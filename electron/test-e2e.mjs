/**
 * 端到端冒烟测试：启动真实的 Electron 应用，通过 CDP 连到真实渲染进程断言。
 *
 * 为什么需要它：`test-main-logic.mjs` 只覆盖纯逻辑接缝，`test-ui.mjs` 是源码文本断言。
 * 本项目的前端是 14 个共享全局作用域的 classic script，**index.html 的 script 顺序就是
 * 依赖图**——任何一个文件在加载期抛 ReferenceError，只有真实启动才能发现。这个测试
 * 因此会先 attach 再 reload 一次，专门吞下加载期异常。
 *
 * 不引入新依赖：用 Node 内置的 fetch + WebSocket 直接讲 CDP。
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 全局 `WebSocket` 从 Node 22 起才默认可用（fetch 从 Node 18 起）。缺了它这里会以
// 一句「WebSocket is not defined」失败，看不出是 Node 版本问题，因此显式说明要求。
// CI（release.yml 的 node-version）与 README 的前置条件都是 Node 22+。
if (typeof WebSocket === 'undefined') {
  console.error(`E2E 需要 Node.js 22+（内置全局 WebSocket）；当前为 ${process.version}。`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/** Electron 可执行文件路径，跨平台。 */
function electronBinary() {
  // `require('electron')` 在 Node（非 Electron）下返回可执行文件路径，Windows 也适用；
  // 直接 spawn `node_modules/.bin/electron` 在 Windows 上会失败（那是 sh 脚本，没有 .exe）。
  try {
    return createRequire(import.meta.url)('electron');
  } catch {
    return path.join(
      root,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'electron.cmd' : 'electron',
    );
  }
}

/** 项目 venv 的 python 路径；开发机存在才覆盖 BREVIA_PYTHON。 */
function venvPython() {
  const candidates =
    process.platform === 'win32'
      ? [path.join(root, '.venv', 'Scripts', 'python.exe')]
      : [path.join(root, '.venv', 'bin', 'python')];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

// 指向打包应用的可执行文件时，同一套检查使用随包 worker，不借用开发环境 Python。
const packagedApp = process.env.BREVIA_E2E_APP;
const electronBin = packagedApp || electronBinary();
const pythonBin = venvPython();

if (process.env.BREVIA_SKIP_E2E === '1') {
  console.log('E2E smoke skipped (BREVIA_SKIP_E2E=1).');
  process.exit(0);
}

/* 每个脚本各取一个代表性全局，用来证明整条 script 依赖链按顺序执行成功。
   顺序与 frontend/index.html 一致；漏掉的文件会在下面被交叉校验。 */
const moduleProbes = [
  ['app-state.js', 'locale'],
  ['app-actions.js', 'appActions'],
  ['app-utils.js', 'formatBytes'],
  ['backend-client.js', 'workletContexts'],
  ['ui-data.js', 'uiData'],
  ['i18n-data.js', 'window.BreviaLocaleData'],
  ['changelog.js', 'window.BreviaChangelog'],
  ['i18n.js', 'window.BreviaI18n'],
  ['i18n-runtime.js', 't'],
  ['model-selection.js', 'window.BreviaModelSelection'],
  ['asr-copy.js', 'window.BreviaAsrCopy'],
  ['ui-components.js', 'escapeHtml'],
  ['workspaces.js', 'workspaces'],
  ['app-meetings.js', 'backendMeeting'],
  ['app-meeting-detail.js', 'renderSegmentData'],
  ['onboarding.js', 'window.BreviaOnboarding'],
  ['app.js', 't'],
  ['mobile-connection.js', "document.getElementById('mobile-pair').onclick"],
];

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** 最小 CDP 客户端：按 id 匹配响应，把事件交给 onEvent。 */
function connect(wsUrl, onEvent) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    const send = (method, params = {}, timeoutMs = 180000) =>
      new Promise((res, rej) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`CDP等待超时：${method} ${String(params.expression || '').slice(0, 160)}`));
        }, timeoutMs);
        pending.set(id, { res, rej, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej, timer } = pending.get(message.id);
        clearTimeout(timer);
        pending.delete(message.id);
        if (message.error) rej(new Error(`${message.error.message}`));
        else res(message.result);
        return;
      }
      if (message.method) onEvent(message);
    });
    socket.addEventListener('close', () => {
      for (const { rej, timer } of pending.values()) {
        clearTimeout(timer);
        rej(new Error('CDP连接已关闭'));
      }
      pending.clear();
    });
    socket.addEventListener('error', () => reject(new Error('CDP websocket error')));
    socket.addEventListener('open', () => resolve({ send, close: () => socket.close() }));
  });
}

/** 等待调试端口上出现页面目标。 */
async function waitForTarget(port, deadline, exited) {
  while (Date.now() < deadline) {
    if (exited()) return null; // Electron 提前退出时立即失败，不干等到超时。
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* 端口还没起来，继续等。 */
    }
    await delay(150);
  }
  return null;
}

/* 临时目录放在工作区内：DSH 文件沙箱只允许写工作区，Chromium 需要往 user-data-dir
   写 DevToolsActivePort 等文件。--no-sandbox 让 Electron 的子进程能在该沙箱下起来。 */
// 并行测试各用独立目录，避免互相覆盖配对证书与 Chromium 状态。
const sandboxRoot = path.join(root, '.e2e-tmp', String(process.pid));
rmSync(sandboxRoot, { recursive: true, force: true });
const dataDir = path.join(sandboxRoot, 'data');
const recordingsDir = path.join(sandboxRoot, 'recordings');
const userDataDir = path.join(sandboxRoot, 'userdata');
mkdirSync(dataDir, { recursive: true });
mkdirSync(recordingsDir, { recursive: true });
mkdirSync(userDataDir, { recursive: true });
// 用真实 Chromium 写入旧版本缩放，避免空用户目录掩盖默认比例被覆盖的问题。
if (!packagedApp) {
  const zoomSeed = path.join(sandboxRoot, 'seed-zoom.cjs');
  writeFileSync(
    zoomSeed,
    `const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadFile(${JSON.stringify(path.join(root, 'frontend', 'index.html'))});
  window.webContents.setZoomFactor(8 / 9);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });`,
  );
  execFileSync(electronBin, [zoomSeed, '--no-sandbox', `--user-data-dir=${userDataDir}`], {
    cwd: root,
    timeout: 15000,
  });
}
if (process.env.BREVIA_DESIGN_CAPTURE_DIR) {
  mkdirSync(path.join(dataDir, 'mobile'), { recursive: true });
  writeFileSync(
    path.join(dataDir, 'mobile', 'devices.json'),
    JSON.stringify([
      {
        id: 'a'.repeat(32),
        name: 'iPhone',
        firstConnectedAt: '2026-10-12T10:00:00Z',
        tokenHash: 'a'.repeat(64),
      },
    ]),
  );
}

const port = await freePort();
const childEnv = {
  ...process.env,
  BREVIA_DATA_DIR: dataDir,
  BREVIA_MEETINGS_DIR: recordingsDir,
  BREVIA_MOBILE_PORT: '0',
};
// 只在开发机的 venv 真实存在时覆盖；CI 用 setup-python，写死 .venv 路径会让 worker 起不来。
if (packagedApp) delete childEnv.BREVIA_PYTHON;
else if (process.env.BREVIA_PYTHON || pythonBin)
  childEnv.BREVIA_PYTHON = process.env.BREVIA_PYTHON || pythonBin;
const child = spawn(
  electronBin,
  [
    ...(packagedApp ? [] : ['.']),
    ...(!packagedApp && process.env.BREVIA_DESIGN_CAPTURE_DIR ? ['--inspect=0'] : []),
    '--no-sandbox',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
  ],
  {
    cwd: root,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  },
);

let mainOutput = '';
child.stdout.on('data', (chunk) => {
  mainOutput += chunk;
});
child.stderr.on('data', (chunk) => {
  mainOutput += chunk;
});
let earlyExit = null;
let spawnError = null;
child.on('exit', (code, signal) => {
  earlyExit = { code, signal };
});
// 没有这个 handler 时，spawn 失败（例如 Windows 上二进制不可执行）会变成未捕获异常。
child.on('error', (error) => {
  spawnError = error;
});

const cleanup = () => {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* 已退出。 */
    }
  }
};

let client;
try {
  const target = await waitForTarget(port, Date.now() + 30000, () => earlyExit || spawnError);
  if (!target) {
    console.error(
      spawnError
        ? `✗ 无法启动 Electron（${electronBin}）：${spawnError.message}`
        : earlyExit
          ? `✗ Electron 在暴露渲染进程之前就退出了（code=${earlyExit.code} signal=${earlyExit.signal}）。`
          : '✗ Electron 未在 30 秒内暴露渲染进程目标。',
    );
    console.error(mainOutput.trim().split('\n').slice(-25).join('\n'));
    cleanup();
    process.exit(1);
  }

  const pageErrors = [];
  const consoleErrors = [];
  client = await connect(target.webSocketDebuggerUrl, (message) => {
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      pageErrors.push(details.exception?.description || details.text || 'unknown exception');
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      consoleErrors.push(message.params.entry.text);
    }
  });

  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.enable');

  let timeoutChecked = false;
  try {
    await client.send(
      'Runtime.evaluate',
      { expression: 'window.__cdpTimeoutCheck = new Promise(() => {})', awaitPromise: true },
      25,
    );
  } catch (error) {
    timeoutChecked = error.message.startsWith('CDP等待超时：Runtime.evaluate');
  }
  check(timeoutChecked, 'CDP未返回时必须超时，避免回归永久挂起');

  // attach 之后 reload 一次：加载期异常才是这条 script 依赖链的真正风险。
  pageErrors.length = 0;
  consoleErrors.length = 0;
  await client.send('Page.reload', { ignoreCache: true });
  const reloadDeadline = Date.now() + 20000;
  for (;;) {
    await delay(200);
    const state = await client.send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (state.result?.value === 'complete') break;
    if (Date.now() > reloadDeadline) {
      failures.push('reload 后 20 秒内未完成加载');
      break;
    }
  }
  const initialized = await client.send('Runtime.evaluate', {
    expression: 'initializationPromise',
    awaitPromise: true,
    returnByValue: true,
  });
  check(!initialized.exceptionDetails, '后台初始化必须完成后再测试交互');
  // 加载完成后给事件队列一点时间把加载期异常送过来。
  await delay(300);

  const compactWindow = await client.send('Runtime.evaluate', {
    expression: `({ width:outerWidth, height:outerHeight, scale:outerWidth/innerWidth, viewportWidth:innerWidth, viewportHeight:innerHeight, bodyWidth:document.body.scrollWidth, overflow:document.body.scrollWidth>innerWidth+1 })`,
    returnByValue: true,
  });
  check(
    Math.abs(compactWindow.result?.value?.viewportWidth - 1280) <= 2 &&
      Math.abs(compactWindow.result.value.viewportHeight - 800) <= 2 &&
      Math.abs(compactWindow.result.value.scale - (2 / 3) * 1.15) < 0.02 &&
      !compactWindow.result.value.overflow,
    `旧缩放配置启动并重载后，窗口与内容应同步放大15%至23/30，保留 1280×800 排版：${JSON.stringify(compactWindow.result?.value)}`,
  );

  const probe = `(() => {
    const globals = ${JSON.stringify(moduleProbes.map(([, name]) => name))};
    const missing = globals.filter((name) => {
      try { return typeof eval(name) === 'undefined'; } catch { return true; }
    });
    // 'Brevia' 是真实词条（zh 下为「言录」），既是标题来源也是可靠的翻译探针。
    const probeKey = 'Brevia';
    return {
      brandTitle: typeof t === 'function' ? t(probeKey) : null,
      locales: window.BreviaLocaleData ? Object.keys(window.BreviaLocaleData.catalog).length : 0,
      readyState: document.readyState,
      title: document.title,
      missing,
      views: document.querySelectorAll('.view').length,
      scripts: document.querySelectorAll('script[src]').length,
      translated: typeof t === 'function' ? t(probeKey) : null,
      locale: typeof locale === 'undefined' ? null : locale,
      navItems: document.querySelectorAll('[data-view]').length,
    };
  })()`;

  const result = await client.send('Runtime.evaluate', {
    expression: probe,
    returnByValue: true,
    awaitPromise: false,
  });
  const savedConfig = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    const config = { version: 2, enabled: false, proactivity: 'quiet', provider: 'built-in', providers: {} };
    await window.brevia.aiAssist.config.save(config);
    return JSON.stringify(await window.brevia.aiAssist.config.get()) === JSON.stringify(config);
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(savedConfig.result?.value === true, 'AI 笔记设置经真实 IPC 保存后应从磁盘完整读回');
  const audioPlayback = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    const data = await window.brevia.initialize();
    const meeting = await window.brevia.meeting.get({ meeting_id: data.meetings[0].id });
    const source = meeting.audio.playback.mix || meeting.audio.playback.mic || meeting.audio.playback.system;
    const url = await window.brevia.audioUrl(source);
    const audio = new Audio();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Audio metadata timed out')), 10000);
      audio.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      audio.onerror = () => { clearTimeout(timer); reject(new Error('Audio playback failed')); };
      audio.src = url;
    });
    const duration = audio.duration;
    audio.removeAttribute('src'); audio.load();
    return Number.isFinite(duration) && duration > 0;
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    audioPlayback.result?.value === true,
    '数据目录之外的录音应通过真实 audio.url IPC 并成功加载播放器',
  );
  if (result.exceptionDetails) {
    failures.push(
      `探针求值抛错：${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`,
    );
  }
  const value = result.result?.value || {};

  check(value.readyState === 'complete', `document.readyState = ${value.readyState}`);
  check(
    value.title && value.title === value.brandTitle,
    `document.title = ${value.title}，期望 t('Brevia') = ${value.brandTitle}`,
  );
  check(
    (value.missing || []).length === 0,
    `脚本依赖链缺失全局：${(value.missing || []).join(', ')}`,
  );
  check(value.views >= 5, `视图数量 ${value.views} < 5`);
  check(
    value.scripts === moduleProbes.length,
    `script 标签数 ${value.scripts} != 探针数 ${moduleProbes.length}（index.html 增删脚本后要同步这里）`,
  );
  check(
    typeof value.translated === 'string' && value.translated !== 'Brevia',
    `t('Brevia') 未翻译（回落到键名）：${value.translated}`,
  );
  check(value.locales === 8, `i18n 词条语言数 ${value.locales} != 8`);
  check(value.navItems > 0, '[data-view] 导航项为 0');
  check(pageErrors.length === 0, `渲染进程加载期异常：\n  ${pageErrors.join('\n  ')}`);

  const storageRows = await client.send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('.settings-folder-paths [data-settings-path]')].map((row) => row.dataset.settingsPath).join(',')`,
    returnByValue: true,
  });
  check(
    storageRows.result?.value === 'recordings,models',
    `存储页面路径顺序：${storageRows.result?.value}`,
  );
  const deviceCardOrder = await client.send('Runtime.evaluate', {
    expression: `document.getElementById('mobile-connection').previousElementSibling === speakerProfileCard && !!document.getElementById('mobile-connection').nextElementSibling.querySelector('[data-settings-modal="storage"]')`,
    returnByValue: true,
  });
  check(deviceCardOrder.result?.value, '设备连接应与声纹、存储归在设备与数据分组');
  await client.send('Runtime.evaluate', {
    expression: `document.querySelector('#import-recording').click()`,
  });
  await delay(350);
  const importPage = await client.send('Runtime.evaluate', {
    expression: `({ sidebar: !!document.querySelector('.sidebar > #import-recording'), active: document.querySelector('#prepare-view').classList.contains('active'), mode: document.querySelector('#prepare-view').dataset.mode, capture: getComputedStyle(document.querySelector('#prepare-view fieldset')).display })`,
    returnByValue: true,
  });
  check(
    importPage.result?.value?.sidebar &&
      importPage.result?.value?.active &&
      importPage.result?.value?.mode === 'import' &&
      importPage.result?.value?.capture === 'none',
    `侧栏导入入口未打开独立模式：${JSON.stringify(importPage.result?.value)}`,
  );
  const importUi = await client.send('Runtime.evaluate', {
    expression: `(() => { applyLanguage('fr'); const button = document.querySelector('#import-recording'); const label = button.querySelector('.import-recording-label'); return { radius: getComputedStyle(button).borderTopLeftRadius, referenceRadius: getComputedStyle(document.querySelector('.new-meeting')).borderTopLeftRadius, label: label.textContent, clipped: label.scrollWidth > label.clientWidth, heading: document.querySelector('#prepare-view h1').textContent }; })()`,
    returnByValue: true,
  });
  check(
    importUi.result?.value?.radius === importUi.result?.value?.referenceRadius,
    `导入按钮圆角不一致：${JSON.stringify(importUi.result?.value)}`,
  );
  check(
    importUi.result?.value?.label === 'Importer un fichier audio local' &&
      importUi.result?.value?.heading === 'Importer un fichier audio local' &&
      !importUi.result?.value?.clipped,
    `导入界面法语文案不完整：${JSON.stringify(importUi.result?.value)}`,
  );
  const storageMove = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    let finish;
    const pending = withStorageMigration(() => new Promise((resolve) => { finish = resolve; }));
    const dialog = document.querySelector('.storage-migration-dialog');
    const modal = dialog.matches(':modal');
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    let duplicateRan = false;
    await withStorageMigration(() => { duplicateRan = true; });
    document.querySelector('.new-meeting').focus();
    const focusContained = dialog.contains(document.activeElement);
    const visible = dialog.getBoundingClientRect().width > 0 && !!dialog.querySelector('progress');
    finish();
    await pending;
    const cleaned = !storageMovePending && !document.querySelector('.storage-migration-dialog');
    let failure = '';
    try { await withStorageMigration(async () => { throw new Error('disk disconnected'); }); }
    catch (error) { failure = error.message; }
    return { modal, visible, focusContained, cancelPrevented: cancel.defaultPrevented, duplicateRan, cleaned,
      failedCleanly: failure === 'disk disconnected' && !storageMovePending && !document.querySelector('.storage-migration-dialog') };
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const move = storageMove.result?.value || {};
  check(
    move.modal &&
      move.visible &&
      move.focusContained &&
      move.cancelPrevented &&
      !move.duplicateRan &&
      move.cleaned &&
      move.failedCleanly,
    `Storage migration must block conflicting actions and restore controls after success/failure: ${JSON.stringify(move)}`,
  );
  const aiOnboarding = await client.send('Runtime.evaluate', {
    expression: `(async () => { if (onboardingPage) await new Promise((resolve) => dismissOnboardingPage(resolve)); applyLanguage('zh'); openOnboardingAi(); const page = document.querySelector('.onboarding-ai-setup-page'); const cards = page.querySelectorAll('.onboarding-ai-feature'); const toggle = page.querySelector('[name="onboarding-ai-enabled"]'); const select = page.querySelector('[name="onboarding-ai-proactivity"]'); toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true })); const off = page.querySelector('[data-onboarding-ai-demo]').dataset.mode; toggle.checked = true; select.value = 'auto'; select.dispatchEvent(new Event('change', { bubbles: true })); return { cards: cards.length, choices: page.querySelectorAll('[name="onboarding-ai-way"]').length, off, on: page.querySelector('[data-onboarding-ai-demo]').dataset.mode, aligned: Math.abs(cards[0].getBoundingClientRect().width - cards[1].getBoundingClientRect().width) < 1, summaryVisible: getComputedStyle(page.querySelector('.app-demo-summary-body')).opacity === '1' }; })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    aiOnboarding.result?.value?.cards === 2 &&
      aiOnboarding.result?.value?.choices === 2 &&
      aiOnboarding.result?.value?.off === 'off' &&
      aiOnboarding.result?.value?.on === 'auto' &&
      aiOnboarding.result?.value?.aligned &&
      aiOnboarding.result?.value?.summaryVisible,
    `AI 引导页布局或预览不正确：${JSON.stringify(aiOnboarding.result?.value)}`,
  );
  const disabledDemo = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    const toggle = onboardingPage.querySelector('[name="onboarding-ai-enabled"]');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    const demo = onboardingPage.querySelector('[data-onboarding-ai-demo]');
    const before = demo.innerHTML;
    await new Promise((resolve) => setTimeout(resolve, 2900));
    return before === demo.innerHTML;
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(disabledDemo.result?.value === true, '关闭 AI 演示后旧定时器不能继续更新内容');
  const aiAnimationFit = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      window.__visualAiFit={phase:'initial-dismiss'};
      if(onboardingPage)await new Promise(resolve=>dismissOnboardingPage(resolve));
      for(const code of ['zh','en','es','ja','ko','fr','de','ru']){
        window.__visualAiFit={code,phase:'open'};
        applyLanguage(code);openOnboardingAi();
        await new Promise(resolve=>setTimeout(resolve,250));
        const page=onboardingPage,sections=page.querySelector('.onboarding-ai-sections');
        await document.fonts.ready;
        page.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).forEach(a=>a.finish());
        const footer=page.querySelector('.onboarding-actions');
        const summary=page.querySelector('[name=onboarding-summary-enabled]');
        summary.checked=true;
        summary.dispatchEvent(new Event('change',{bubbles:true}));
        const enabled=page.querySelector('[name=onboarding-ai-enabled]');
        enabled.checked=true;
        for(const mode of ['quiet','assist','auto']){
          window.__visualAiFit={code,mode,phase:'frames'};
          renderOnboardingAiDemo();
          page.querySelector('[data-flow-select-choice=onboarding-ai-proactivity][data-value='+mode+']').click();
          renderOnboardingSummaryDemo();
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const initial=footer.getBoundingClientRect();
          const rowHeights=[...page.querySelectorAll('.onboarding-ai-row')].map(row=>row.getBoundingClientRect().height);
          for(let stage=0;stage<3;stage++){
            window.__visualAiFit={code,mode,stage,phase:'animation'};
            if(stage)await new Promise(resolve=>setTimeout(resolve,1300));
            if(mode==='quiet'&&stage===0)page.querySelector('[data-demo-suggestion] button').click();
            if(mode==='assist'&&stage===2)page.querySelector('[data-demo-add]')?.click();
            const bounds=footer.getBoundingClientRect();
            if(bounds.bottom>innerHeight+1||bounds.top<0||Math.abs(bounds.top-initial.top)>1)errors.push(code+'/'+mode+'/'+stage+': footer moved or clipped');
            if(page.querySelector('.onboarding-page-content').scrollHeight>page.querySelector('.onboarding-page-content').clientHeight+1)errors.push(code+'/'+mode+': outer page overflow');
            if([...page.querySelectorAll('.onboarding-ai-row')].some((row,index)=>Math.abs(row.getBoundingClientRect().height-rowHeights[index])>1))errors.push(code+'/'+mode+': demo changed row height '+JSON.stringify({before:rowHeights,after:[...page.querySelectorAll('.onboarding-ai-row')].map(row=>row.getBoundingClientRect().height)}));
            if(sections.getBoundingClientRect().bottom>bounds.top+1)errors.push(code+'/'+mode+': content covers footer');
          }
        }
        window.__visualAiFit={code,phase:'dismiss'};
        await new Promise(resolve=>dismissOnboardingPage(resolve));
      }
      applyLanguage('zh');openOnboardingAi();
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(aiAnimationFit.result?.value) && !aiAnimationFit.result.value.length,
    `AI 演示全阶段与八语言不能撑高卡片或挤出导航：${JSON.stringify(aiAnimationFit.result?.value || aiAnimationFit.exceptionDetails)}`,
  );
  const builtinOnboarding = await client.send('Runtime.evaluate', {
    expression: `(() => {
    const savedPaths = new Map(modelPaths);
    const savedSelection = selectedBuiltinModel;
    const candidates = modelCatalog.filter((model) => model.kind === 'llama-chat');
    const toggle = onboardingPage.querySelector('[name="onboarding-summary-enabled"]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    candidates.forEach((model) => modelPaths.delete(model.id));
    selectedBuiltinModel = '';
    onboardingBuiltinProvider = true; summaryConfigDraft = structuredClone(summaryConfig); summaryConfigDraft.provider = 'built-in'; openModal('summary-model');
    const body = settingsModal.querySelector('.modal-body');
    const previousSource = localStorage.getItem('brevia-china-model-source');
    localStorage.setItem('brevia-china-model-source', 'true');
    const inheritsSource = modelDownloadPayload(candidates[0].id).source === 'china';
    if (previousSource === null) localStorage.removeItem('brevia-china-model-source');
    else localStorage.setItem('brevia-china-model-source', previousSource);
    const fixedProvider = inheritsSource && body.querySelector('[name="provider"]').value === 'built-in'
      && !body.querySelector('[data-flow-select-choice="provider"]') && !body.querySelector('[data-summary-enabled]')
      && !body.querySelector('[data-china-model-source]') && settingsModal.querySelector('h2').textContent === 'AI 会议纪要';
    const offered = body.querySelectorAll('[data-flow-select-choice="model"]').length === candidates.length;
    const initialDownload = body.querySelector('[data-download-model]');
    const downloadAvailable = Boolean(initialDownload) && body.querySelector('[type="submit"]').disabled;
    const next = candidates.find((model) => model.id !== initialDownload?.dataset.downloadModel);
    body.querySelector('[data-flow-select-choice="model"][data-value="' + next.id + '"]').click();
    const switched = body.querySelector('[data-download-model]').dataset.downloadModel === next.id;
    modelDownloads.set(next.id, { received: 50, total: 100 });
    refreshModelConfigModels();
    const progressVisible = body.textContent.includes('50%') && body.querySelector('[data-download-model]').disabled;
    modelDownloads.delete(next.id);
    modelPaths.set(next.id, '/tmp/test-installed-model');
    refreshModelConfigModels();
    const ready = !body.querySelector('[data-download-model]') && !body.querySelector('[type="submit"]').disabled;
    modelPaths.clear(); savedPaths.forEach((value, key) => modelPaths.set(key, value));
    selectedBuiltinModel = savedSelection;
    closeModal();
    return { fixedProvider, offered, downloadAvailable, switched, progressVisible, ready };
  })()`,
    returnByValue: true,
  });
  check(
    Object.values(builtinOnboarding.result?.value || {}).length === 6 &&
      Object.values(builtinOnboarding.result?.value || {}).every(Boolean),
    `内置 AI 引导应固定供应商，支持模型选择、下载进度及安装后保存：${JSON.stringify(builtinOnboarding.result?.value || builtinOnboarding.exceptionDetails)}`,
  );
  const cancelledProvider = await client.send('Runtime.evaluate', {
    expression: `(() => {
    const previous = summaryConfig.provider;
    onboardingOnlineProvider = true; summaryConfigDraft = structuredClone(summaryConfig); summaryConfigDraft.provider = 'openai'; openModal('summary-model');
    const draft = summaryConfigDraft.provider;
    closeModal();
    return draft !== 'built-in' && summaryConfig.provider === previous;
  })()`,
    returnByValue: true,
  });
  check(cancelledProvider.result?.value === true, '取消引导页供应商配置不能覆盖已保存选择');
  const configDrafts = await client.send('Runtime.evaluate', {
    expression: `(() => {
    for (const kind of ['summary-model', 'ai-assist']) {
      openModal(kind);
      const config = kind === 'summary-model' ? summaryConfigDraft : aiAssistConfigDraft;
      config.provider = 'custom-openai';
      renderModal(kind);
      const values = { apiKey: 'test-only-issue-3-key', model: 'test-model', endpoint: 'https://example.test/v1' };
      for (const [name, value] of Object.entries(values)) {
        const field = settingsModal.querySelector('[name="' + name + '"]');
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const key = settingsModal.querySelector('[name="apiKey"]');
      key.focus();
      refreshModelConfigModels();
      if (document.activeElement !== key || key.value !== values.apiKey) return false;
      renderModal(kind);
      if (Object.entries(values).some(([name, value]) => settingsModal.querySelector('[name="' + name + '"]').value !== value)) return false;
      config.provider = 'built-in'; renderModal(kind);
      config.provider = 'custom-openai'; renderModal(kind);
      if (settingsModal.querySelector('[name="apiKey"]').value !== values.apiKey || JSON.stringify(config).includes(values.apiKey)) return false;
      closeModal();
    }
    return true;
  })()`,
    returnByValue: true,
  });
  check(
    configDrafts.result?.value === true,
    '纪要与 AI 笔记输入应在刷新和供应商切换后保留，密钥不能进入可持久化配置',
  );
  const deviceLanguages = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    const previous = locale;
    await showView('home');
    await new Promise(resolve => setTimeout(resolve, 2100));
    const card = document.querySelector('#mobile-nav');
    const results = [];
    for (const language of Object.keys(catalog)) {
      applyLanguage(language);
      const status = document.querySelector('#mobile-sidebar-status');
      const translated = [t('等待设备连接'), t('服务已关闭')].includes(status.textContent);
      const fits = () => [...card.querySelectorAll('strong, svg, #mobile-sidebar-status, #mobile-nav-dot')].every(node => {
        const bounds = node.getBoundingClientRect(), outer = card.getBoundingClientRect();
        const style = getComputedStyle(node);
        const clippedStatus = node.id === 'mobile-sidebar-status' && style.clipPath === 'inset(50%)' && style.overflow === 'hidden';
        return bounds.right <= outer.right + 1 && bounds.left >= outer.left - 1 && (clippedStatus || node.scrollWidth <= node.clientWidth + 1);
      });
      const normalFits = fits();
      status.textContent = 'VeryLongDeviceNameWithoutSpaces'.repeat(4) + ' · ' + t('已连接');
      results.push(translated && normalFits && fits());
      await openModal('device-connection');
      results.push(document.querySelector('#mobile-pair').textContent === t('连接新设备')
        && document.querySelector('#mobile-install-title').textContent === t('安装Brevia手机端')
        && document.querySelector('[data-mobile-install-toggle]').textContent === t('安装Brevia手机端')
        && document.querySelector('#mobile-dialog .mobile-install').hidden
        && document.querySelector('.mobile-install-platform a').href === 'https://apps.apple.com/app/id6819869442'
        && document.querySelector('.mobile-install-platform h4').textContent === t('iPhone · App Store')
        && document.querySelector('.mobile-install-platform p').textContent === t('扫码或点击链接，从 App Store 免费安装 Brevia。')
        && (document.querySelector('.mobile-device-empty')?.textContent === t('暂无已信任设备') || document.querySelector('.mobile-device small')?.textContent === t('离线 · 保留信任')));
      await closeModal();
    }
    applyLanguage(previous);
    return results.every(Boolean);
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    deviceLanguages.result?.value === true,
    '设备连接应即时切换八种语言，且长标题和设备名称不能溢出卡片',
  );
  const rapidNavigation = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    const homeIsActive = () => activeView === 'home' && document.querySelector('#home-view').classList.contains('active')
      && document.querySelectorAll('body > .app-shell > .workspace > .view.active').length === 1 && document.querySelector('#all-meetings').classList.contains('active')
      && crumb.textContent === catalog[locale].views.home && !document.querySelector('.app-shell').classList.contains('is-live-meeting');
    await showView('home');
    await Promise.all([showView('settings'), showView('prepare'), showView('home')]);
    if (!homeIsActive()) return false;
    await Promise.all([showView('settings'), showLibraryNav(activeLibraryNav)]);
    if (!homeIsActive()) return false;
    await Promise.all([showView('settings'), switchWorkspace(activeWorkspaceId)]);
    if (!homeIsActive()) return false;
    await Promise.all([showLibraryNav('recently-deleted'), showView('settings')]);
    if (activeView !== 'settings' || !document.querySelector('#settings-view').classList.contains('active') || crumb.textContent !== catalog[locale].views.settings) return false;
    await showLibraryNav('all-meetings');
    return homeIsActive();
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    rapidNavigation.result?.value === true,
    '快速连续导航必须到达最后一个目标，且只保留一个活动页面',
  );
  const aiOptions = await client.send('Runtime.evaluate', {
    expression: `(async () => { const page = document.querySelector('.onboarding-ai-setup-page'); const enabled = page.querySelector('[name="onboarding-ai-enabled"]'); enabled.checked=true; enabled.dispatchEvent(new Event('change',{bubbles:true})); const choices = [...page.querySelectorAll('[data-flow-select-choice="onboarding-ai-proactivity"]')]; const options = choices.map(option => option.dataset.value); choices[0].click(); choices[0].focus(); choices[0].dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true})); const keyboard = page.querySelector('[name="onboarding-ai-proactivity"]').value === 'assist' && choices[1].getAttribute('aria-checked') === 'true'; const icons = page.querySelectorAll('.onboarding-ai-icon svg').length; const toggle = page.querySelector('[name="onboarding-summary-enabled"]'); toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true })); const disabled = [...page.querySelectorAll('[name="onboarding-ai-way"]')].every(option=>!option.disabled) && !page.querySelector('[data-configure-ai-summary]').disabled; await finishAiOnboarding(); const saved = await window.brevia.summary.config.get(); const notes = await window.brevia.aiAssist.config.get(); return { options, icons, keyboard, disabled, saved: saved.enabled, shared: saved.provider===notes.provider && JSON.stringify(saved.providers)===JSON.stringify(notes.providers) }; })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    JSON.stringify(aiOptions.result?.value?.options) === '["quiet","assist","auto"]' &&
      aiOptions.result?.value?.icons === 2 &&
      aiOptions.result?.value?.keyboard &&
      aiOptions.result?.value?.disabled &&
      aiOptions.result?.value?.saved === false &&
      aiOptions.result?.value?.shared,
    `AI 开关、图标或档位未正确保存：${JSON.stringify(aiOptions)}`,
  );
  const floatingBars = await client.send('Runtime.evaluate', {
    expression: `(() => { const live = document.querySelector('#live-view .floating-control-bar'); const player = document.querySelector('#detail-view .floating-control-bar'); const toggle = document.querySelector('#live-more-toggle'); toggle.click(); const menuOpen = !document.querySelector('#live-more-panel').hidden && toggle.getAttribute('aria-expanded') === 'true'; document.body.click(); const menuClosed = document.querySelector('#live-more-panel').hidden; const wasActive = meetingActive, wasSeconds = seconds; meetingActive = true; seconds = 57; document.querySelector('#mark-important').click(); const note = currentNotesMarkdown(); meetingActive = wasActive; seconds = wasSeconds; return { live: getComputedStyle(live).position, player: getComputedStyle(player).position, menuOpen, menuClosed, note }; })()`,
    returnByValue: true,
  });
  check(
    floatingBars.result?.value?.live === 'relative' &&
      floatingBars.result?.value?.player === 'static' &&
      floatingBars.result?.value?.menuOpen &&
      floatingBars.result?.value?.menuClosed &&
      floatingBars.result?.value?.note?.includes('重点 · 00:57'),
    `悬浮控制栏操作不正确：${JSON.stringify(floatingBars.result?.value)}`,
  );
  const detailLayout = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    await initializationPromise;
    const mobileDeadline = Date.now() + 10000;
    while (!document.querySelector('.onboarding-mobile-page')) {
      if (Date.now() > mobileDeadline) throw new Error('Mobile onboarding did not appear after AI setup');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const mobilePage = document.querySelector('.onboarding-mobile-page');
    if (mobilePage.querySelectorAll('.mobile-install-platform img').length !== 2
      || !mobilePage.querySelector('a[href$="/android/Brevia-android.apk"]')
      || !mobilePage.querySelector('a[href="https://apps.apple.com/app/id6819869442"]')
      || mobilePage.textContent.includes('TestFlight')) throw new Error('Mobile downloads missing');
    mobilePage.querySelector('[data-onboarding-mobile-pair]').click();
    const pairDialog = document.querySelector('#mobile-pair-dialog');
    for (let i = 0; i < 200 && !pairDialog.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    if (!pairDialog.open || !document.querySelector('.onboarding-mobile-page')) throw new Error('Onboarding pairing is not a separate dialog: ' + JSON.stringify({open:pairDialog.open,connected:pairDialog.isConnected,error:document.querySelector('#mobile-pair-error').textContent,handler:typeof (mobileConnectionContent || document.getElementById('mobile-dialog')).querySelector('#mobile-pair').onclick}));
    document.querySelector('#mobile-close-pairing').click();
    for (let i = 0; i < 60 && pairDialog.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    if (pairDialog.open) throw new Error('Pairing did not close');
    mobilePage.querySelector('[data-onboarding-mobile-skip]').click();
    const finishDeadline = Date.now() + 10000;
    while (document.querySelector('.onboarding-page')) {
      if (Date.now() > finishDeadline) throw new Error('Mobile onboarding did not complete');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (!localStorage.getItem('brevia-onboarding-complete') || typeof openOnboardingTour !== 'undefined') throw new Error('Removed tour is still reachable');
    applyLanguage('en');
    document.querySelectorAll('.onboarding-page').forEach((page) => page.remove());
    onboardingPage = undefined;
    await showView('detail');
    const failures = [];
    for (const code of BreviaI18n.languageCodes) {
      applyLanguage(code);
      for (const theme of ['light', 'dark']) {
        applyTheme(theme);
        const panel = document.querySelector('#detail-view .final-transcript').getBoundingClientRect();
        const notes = document.querySelector('#detail-view .notes').getBoundingClientRect();
        const player = document.querySelector('#detail-view .player').getBoundingClientRect();
        if (panel.width <= 0 || panel.height <= 0 || notes.height <= 0 || panel.bottom > player.top + 1 || notes.bottom > innerHeight + 1) failures.push(code + '/' + theme + ': meeting content hidden or overlaps player');
      }
      if (document.querySelectorAll('[data-settings-path]').length !== 2) failures.push(code + ': duplicate storage rows');
      const error = storageErrorMessage(new Error('Chosen recording folder is no longer empty'));
      if (error !== catalog[code].labels['请选择空文件夹。']) failures.push(code + ': untranslated storage error');
    }
    applyLanguage('zh');
    return failures;
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(detailLayout.result?.value) && detailLayout.result.value.length === 0,
    `多语言/主题布局回归：${JSON.stringify(detailLayout)}`,
  );
  const refineModelLayout = await client.send('Runtime.evaluate', {
    expression: `(() => {
    const host = document.createElement('div');
    host.className = 'refine-menu';
    host.innerHTML = renderRefineModelRow([
      ['qwen', 'Qwen3-ASR 0.6B 8bit · 下载 960MB', '推荐'],
      ['fire', 'FireRedASR2-AED · 下载 4.25GB', ''],
      ['long', 'ASR'.repeat(40), ''],
    ], 'qwen');
    document.body.append(host);
    host.querySelector('.flow-select-options').hidden = false;
    const fits = () => [...host.querySelectorAll('.flow-select-toggle, .flow-select-options, .flow-select-options button')]
      .every(element => element.scrollWidth <= element.clientWidth + 1);
    const initial = fits();
    const toggle = host.querySelector('.flow-select-toggle');
    toggle.firstChild.nodeValue = 'ASR'.repeat(40);
    const changed = fits();
    const arrow = toggle.querySelector('span').getBoundingClientRect();
    const bounds = toggle.getBoundingClientRect();
    host.remove();
    return initial && changed && arrow.right <= bounds.right && arrow.left >= bounds.left;
  })()`,
    returnByValue: true,
  });
  check(
    refineModelLayout.result?.value === true,
    `识别模型长文本布局回归：${JSON.stringify(refineModelLayout)}`,
  );
  const editingRegression = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    await initializationPromise;
    const meeting = await window.brevia.meeting.get({ meeting_id: breviaClient.state.initialized.meetings[0].id });
    const chosen = refinedModelOptions(meeting.language).at(-1)?.[0];
    if (chosen) meeting.refined_model_id = chosen;
    applyBackendDetail(meeting);
    const selected = !chosen || uiData.detail.refinedModelId === chosen;
    uiData.detail.summary = { markdown: 'saved memo', hasFull: true };
    renderMeetingDetail();
    document.querySelector('[data-open-summary-edit]').click();
    inlineSummaryEditor.setMode('markdown');
    const draft = '***draft***\\n---heading\\n___abc';
    const field = document.querySelector('[data-inline-summary-editor] textarea');
    field.value = draft;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    applyLanguage('ja');
    const localizedDraft = inlineSummaryEditor.getMarkdown() === draft && inlineSummaryEditor.getMode() === 'markdown';
    applyBackendDetail(meeting);
    const refreshedDraft = inlineSummaryEditor.getMarkdown() === draft;
    for (let index = 0; index < 30; index += 1) renderMeetingDetail();
    return { selected, localizedDraft, refreshedDraft, editing: uiData.detail.summaryEditing };
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    editingRegression.result?.value?.selected &&
      editingRegression.result?.value?.localizedDraft &&
      editingRegression.result?.value?.refreshedDraft &&
      editingRegression.result?.value?.editing,
    `草稿/模型回归：${JSON.stringify(editingRegression)}`,
  );
  const documentObject = await client.send('Runtime.evaluate', { expression: 'document' });
  const listenersBefore = await client.send('DOMDebugger.getEventListeners', {
    objectId: documentObject.result.objectId,
  });
  await client.send('Runtime.evaluate', {
    expression: 'for (let index = 0; index < 30; index += 1) renderMeetingDetail();',
  });
  const listenersAfter = await client.send('DOMDebugger.getEventListeners', {
    objectId: documentObject.result.objectId,
  });
  check(
    listenersBefore.listeners.length === listenersAfter.listeners.length,
    '重建编辑器不应增加 document 监听器数量',
  );
  const captionClose = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    let closed = 0;
    const unsubscribe = window.brevia.on('floating-caption.closed', () => { closed += 1; });
    for (let index = 0; index < 2; index += 1) {
      await window.brevia.floatingCaption.show();
      await window.brevia.floatingCaption.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    unsubscribe();
    document.querySelector('[data-cancel-inline-summary-edit]').click();
    applyLanguage('zh');
    return closed;
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(captionClose.result?.value === 2, `悬浮字幕关闭通知缺失：${JSON.stringify(captionClose)}`);
  const scaleAfterCaption = await client.send('Runtime.evaluate', {
    expression: 'outerWidth / innerWidth',
    returnByValue: true,
  });
  check(
    Math.abs(scaleAfterCaption.result?.value - (2 / 3) * 1.15) < 0.02,
    '打开及关闭独立字幕窗口后，主应用仍保持默认缩放',
  );
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: Math.round(880 * (2 / 3) * 1.15),
    height: Math.round(720 * (2 / 3) * 1.15),
    deviceScaleFactor: 1,
    mobile: false,
  });
  const minimumWindow = await client.send('Runtime.evaluate', {
    expression: `({ activeView, className: document.querySelector('#detail-view').className, display: getComputedStyle(document.querySelector('#detail-view')).display, onboarding: [...document.querySelectorAll('.onboarding-page')].map(page => page.className), shell: getComputedStyle(document.querySelector('.app-shell')).display, parentWidth: document.querySelector('#detail-view').parentElement.getBoundingClientRect().width, width: document.querySelector('#detail-view').getBoundingClientRect().width, sidebar: getComputedStyle(document.querySelector('.app-shell > .sidebar')).display })`,
    returnByValue: true,
  });
  check(
    minimumWindow.result?.value?.width > 500 && minimumWindow.result?.value?.sidebar !== 'none',
    `最小桌面窗口丢失内容或导航：${JSON.stringify(minimumWindow.result?.value)}`,
  );
  const changelog = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    const errors = [];
    for (const code of ['zh', 'en']) for (const theme of ['light', 'dark']) {
      applyLanguage(code); applyTheme(theme);
      await openModal('whats-new');
      const current = settingsModal.querySelector('.whatsnew-entry.is-current');
      const body = settingsModal.querySelector('.modal-body');
      if (!current || !current.textContent.includes(whatsNewLog[0].version)) errors.push(code + ': missing current version');
      if (body.scrollWidth > body.clientWidth + 1) errors.push(code + '/' + theme + ': horizontal overflow');
      const history = settingsModal.querySelector('details.whatsnew-entry:not(.is-current)');
      if (!history || history.open) errors.push(code + ': history must start collapsed');
      history.querySelector('summary').click();
      if (!history.open || !history.querySelector('section')) errors.push(code + ': history cannot be expanded');
      if (whatsNewLog[0].contributors?.length && !current.textContent.includes(whatsNewCopy[code].contributors)) errors.push(code + ': missing contributors');
      for (const anchor of current.querySelectorAll('a')) if (!anchor.href.startsWith('https://github.com/') || anchor.target !== '_blank') errors.push('unsafe release link');
    }
    closeModal(); applyLanguage('zh'); applyTheme('light');
    return errors;
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(changelog.result?.value) && changelog.result.value.length === 0,
    `双语更新日志布局或链接异常：${JSON.stringify(changelog)}`,
  );
  const upgradeSmall = await client.send('Runtime.evaluate', {
    expression: `(async()=>{await openModal('upgrade-log');const body=settingsModal.querySelector('.modal-body'),panel=settingsModal.querySelector('.modal-panel'),footer=settingsModal.querySelector('.upgrade-log-actions');settingsModal.dispatchEvent(new MouseEvent('click',{bubbles:true}));return activeModal==='upgrade-log'&&document.activeElement===settingsModal.querySelector('.modal-title h2')&&body.scrollWidth<=body.clientWidth+1&&panel.scrollHeight<=panel.clientHeight+1&&footer.getBoundingClientRect().bottom<=innerHeight;})()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(upgradeSmall.result?.value === true, '升级浮窗在最小窗口溢出、焦点不正确或遮罩误关闭');
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  check(
    (
      await client.send('Runtime.evaluate', {
        expression: `document.activeElement===settingsModal.querySelector('.modal-close')`,
        returnByValue: true,
      })
    ).result?.value === true,
    '升级标题的Tab未进入关闭按钮',
  );
  await client.send('Runtime.evaluate', {
    expression: `settingsModal.querySelector('[data-update-log-dismiss]').focus()`,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  check(
    (
      await client.send('Runtime.evaluate', {
        expression: `document.activeElement===settingsModal.querySelector('.modal-close')`,
        returnByValue: true,
      })
    ).result?.value === true,
    'Tab焦点越出升级浮窗',
  );
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  check(
    (
      await client.send('Runtime.evaluate', {
        expression: `settingsModal.hidden&&!document.querySelector('.app-shell').inert&&localStorage.getItem('brevia-whatsnew-seen')===installedAppVersion`,
        returnByValue: true,
      })
    ).result?.value === true,
    'Esc未关闭升级浮窗、保存已读或恢复交互',
  );
  await client.send('Emulation.clearDeviceMetricsOverride');
  const mergedAiSettings = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    const settled = async predicate => {
      const deadline=Date.now()+5000;
      while(!predicate()) { if(Date.now()>deadline) throw new Error('AI settings save timed out'); await new Promise(resolve=>setTimeout(resolve,25)); }
    };
    meetingActive = false;
    summaryConfig.enabled = false;
    aiAssistConfig.enabled = false;
    aiAssistConfig.proactivity = 'quiet';
    await Promise.all([persistSummaryConfig(), persistAiAssistConfig()]);
    await showView('settings');
    const cards = [...document.querySelectorAll('[data-settings-modal]')].map(button => button.dataset.settingsModal);
    await openModal('ai-features');
    const initial = settingsModal.classList.contains('settings-page')
      && settingsModal.querySelectorAll('[data-ai-settings-tab]').length===2
      && !settingsModal.querySelector('[data-summary-enabled]').checked
      && !onboardingPage && getComputedStyle(document.querySelector('.app-shell')).display !== 'none';
    await openModal('ai-assist');
    settingsModal.querySelector('[data-ai-settings-enabled]').click();
    closeModal(); await new Promise(resolve => setTimeout(resolve,350));
    const cancelled = !aiAssistConfig.enabled && !summaryConfig.enabled;
    await openModal('ai-assist');
    const notesConfig = !!settingsModal.querySelector('.ai-assist-config-form');
    settingsModal.querySelector('[name="proactivity"][value="auto"]').click();
    const selected = aiAssistConfigDraft.proactivity==='auto';
    settingsModal.querySelector('form').requestSubmit();
    await settled(()=>settingsModal.hidden);
    const summary = await window.brevia.summary.config.get();
    const notes = await window.brevia.aiAssist.config.get();
    const saved = !summary.enabled && !notes.enabled && notes.proactivity==='auto';
    const model = modelCatalog.find(item => item.kind === 'llama-chat').id;
    modelPaths.set(model, '/tmp/e2e-ai-model');
    summaryConfig.provider='built-in'; summaryConfig.providers={'built-in':{model}};
    aiAssistConfig.provider='built-in'; aiAssistConfig.providers={'built-in':{model}};
    await openModal('ai-features');
    { const enabled=settingsModal.querySelector('[data-summary-enabled]'); enabled.click(); await settled(()=>!enabled.disabled); }
    const summaryOnly = summaryConfig.enabled && !aiAssistConfig.enabled;
    await openModal('ai-assist');
    const restored = !settingsModal.querySelector('[data-ai-settings-enabled]').checked
      && settingsModal.querySelector('[name="proactivity"][value="auto"]').checked;
    await openModal('ai-features');
    { const enabled=settingsModal.querySelector('[data-summary-enabled]'); enabled.click(); await settled(()=>!enabled.disabled); }
    await openModal('ai-assist');
    settingsModal.querySelector('[data-ai-settings-enabled]').click();
    settingsModal.querySelector('form').requestSubmit();
    await settled(()=>settingsModal.hidden);
    const independent = summaryOnly && restored && !(await window.brevia.summary.config.get()).enabled
      && (await window.brevia.aiAssist.config.get()).enabled;
    let dismissible=true;
    for (const close of ['button','backdrop','escape']) {
      await openModal('ai-features');
      if(close==='button') settingsModal.querySelector('.modal-close').click();
      else if(close==='backdrop') settingsModal.click();
      else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      await new Promise(resolve=>setTimeout(resolve,350));
      dismissible=dismissible && settingsModal.hidden && !document.body.classList.contains('modal-open');
    }
    return { cards, initial, cancelled, notesConfig, saved, selected, summaryOnly, restored, independent, dismissible, closed: settingsModal.hidden };
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const merged = mergedAiSettings.result?.value;
  check(
    merged?.cards?.includes('ai-features') &&
      !merged.cards.includes('ai-assist') &&
      !merged.cards.includes('summary-model') &&
      merged.initial &&
      merged.cancelled &&
      merged.notesConfig &&
      merged.saved &&
      merged.selected &&
      merged.independent &&
      merged.dismissible &&
      merged.closed,
    `合并 AI 设置回归：${JSON.stringify(mergedAiSettings)}`,
  );
  const settingsModalDescriptions = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    await showView('settings');
    const failures = [];
    for (const kind of ['models', 'storage', 'advanced-settings', 'summary-model', 'ai-assist', 'whats-new']) {
      await openModal(kind);
      const description = settingsModal.querySelector('.modal-title p');
      if (description.hidden || getComputedStyle(description).display === 'none' || !settingsModal.classList.contains('settings-page')) failures.push(kind);
      if (!settingsModal.querySelector('h2').textContent) failures.push(kind + ': missing title');
      closeModal();
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    return failures;
  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(settingsModalDescriptions.result?.value) &&
      !settingsModalDescriptions.result.value.length,
    `设置页面导航或说明不可见：${JSON.stringify(settingsModalDescriptions)}`,
  );
  const mobileLive = await client.send('Runtime.evaluate', {
    expression: `(async () => {
    aiAssistConfig.enabled = false;
    const meeting = {id:'a126fdcc-e5a5-40d5-92da-c7064e031654', title:'手机联动测试', language:'zh', tags:['手机录音'], notes:'已有重点', segments:[{id:'mobile-initial',speaker_name:'不应显示',text:'初次接管字幕',start_ms:0,end_ms:1000}], status:'recording'};
    syncBackendMeeting(meeting);
    adoptMobileMeeting(meeting);
    await new Promise(resolve => setTimeout(resolve, 400));
    const live = activeView === 'live' && meetingActive && document.querySelector('#pause').disabled && !document.querySelector('#end-meeting').disabled;
    const source = !document.querySelector('.mobile-source-tag') && !document.querySelector('#transcript-scroll .speaker-name') && document.querySelector('[data-ai-assist-empty]').hidden && document.querySelector('#live-input-label').textContent===t('手机录音');
    const unique = uiData.meetings.filter(m => m.id === meeting.id).length === 1;
    minimizeMeeting(); await showView('home');
    const miniDiagnostic={title:miniTitle.textContent,hidden:miniMeeting.hidden,source:!!miniMeeting.querySelector('.mobile-source-tag'),position:getComputedStyle(taskCards).position,task:taskCards.getBoundingClientRect().toJSON(),mini:miniMeeting.getBoundingClientRect().toJSON(),sidebar:document.querySelector('.sidebar').getBoundingClientRect().toJSON(),view:activeView};
    const mini = !miniMeeting.hidden && !miniMeeting.querySelector('.mobile-source-tag') && miniTitle.textContent === meeting.title && getComputedStyle(taskCards).position === 'relative' && miniMeeting.getBoundingClientRect().bottom <= document.querySelector('.sidebar').getBoundingClientRect().bottom;
    document.querySelector('#mobile-manage').click();
    // 后台窗口的动画帧可能被节流，等待实际打开而不是固定延迟。
    for (let i = 0; i < 60 && !settingsModal.classList.contains('modal-enter'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    await settingsModal.querySelector('.mobile-install img').decode();
    const dialog = activeModal === 'device-connection' && !settingsModal.hidden && settingsModal.classList.contains('modal-enter') && !!settingsModal.querySelector('#mobile-dialog') && settingsModal.querySelector('.mobile-install img').complete && settingsModal.querySelector('.mobile-install img').naturalWidth > 0;
    settingsModal.querySelector('.modal-close').click();
    const closing = settingsModal.classList.contains('modal-leave');
    await new Promise(resolve => setTimeout(resolve, 250));
    await openModal('storage'); closeModal();
    await new Promise(resolve => setTimeout(resolve, 250));
    document.querySelector('#mobile-manage').click();
    const retained = !!settingsModal.querySelector('#mobile-pair')?.onclick;
    document.querySelector('#mobile-pair').click();
    const pairing = document.querySelector('#mobile-pair-dialog');
    const preview = settingsModal.querySelector('.mobile-pair-preview');
    for (let i = 0; i < 60 && !pairing.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    const inlinePairing = preview.hidden && pairing.open && /^\\d{6}$/.test(pairing.querySelector('#mobile-pin').textContent)
      && preview.querySelector('[data-mobile-pair-qr]').src===document.querySelector('#mobile-qr').src
      && typeof preview.querySelector('[data-mobile-copy-preview]').onclick==='function'
      && !document.querySelector('#mobile-disable');
    pairing.querySelector('#mobile-close-pairing').click();
    for (let i = 0; i < 60 && pairing.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    const pairingClosed = preview.hidden && !pairing.open && !settingsModal.hidden;
    closeModal();
    return {live, source, unique, mini, dialog: dialog && closing && retained && inlinePairing && pairingClosed,miniDiagnostic};

  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    ['live', 'source', 'unique', 'mini', 'dialog'].every(
      (key) => mobileLive.result?.value?.[key] === true,
    ),
    `手机会议桌面联动：${JSON.stringify(mobileLive)}`,
  );
  check(pageErrors.length === 0, `交互期间渲染异常：${pageErrors.join('\n')}`);

  /* 应用自身把可预期的失败写进 console.error（例如临时数据目录里没有模型），
     这里只报告不判负，避免把"测试环境缺模型"误判成回归。 */
  if (consoleErrors.length) {
    console.log(`  · 渲染进程 console.error ${consoleErrors.length} 条（测试环境预期内，未判负）`);
  }

  const languagePicker = await client.send('Runtime.evaluate', {
    expression: `(async () => {
      if (onboardingPage) await new Promise(resolve => dismissOnboardingPage(resolve));
      openOnboardingLanguage('zh');
      const choices = [...onboardingPage.querySelectorAll('[name="locale"]')];
      const japanese = choices.find(input => input.value === 'ja');
      japanese.click();
      await new Promise(resolve => setTimeout(resolve, 150));
      const result = { count: choices.length, checked: onboardingPage.querySelector('[name="locale"]:checked').value,
        rail: onboardingPage.querySelectorAll('.onboarding-rail li').length === 5, keyboardNative: choices.every(input => input.type === 'radio') };
      onboardingPage.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
      const deadline = Date.now()+5000;
      while (!onboardingPage?.querySelector('[data-onboarding-permissions]') && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
      result.saved = locale === 'ja' && localStorage.getItem('brevia-language') === 'ja';
      await new Promise(resolve => dismissOnboardingPage(resolve));
      return result;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    languagePicker.result?.value?.count === 8 &&
      languagePicker.result?.value?.checked === 'ja' &&
      languagePicker.result?.value?.rail &&
      languagePicker.result?.value?.keyboardNative &&
      languagePicker.result?.value?.saved,
    '语言引导必须展示八项原生单选，并即时保存选择',
  );
  const onboardingFit = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      applyLanguage('zh'); applyTheme('light');
      const steps=[['language',()=>openOnboardingLanguage('zh')],['permissions',()=>openOnboardingPermissions()],['models',()=>openOnboardingSetup()],['ai',()=>openOnboardingAi()],['phone',()=>openOnboardingMobile()]];
      for(const [name,open] of steps){
        await open();
        await new Promise(resolve=>setTimeout(resolve,100));
        onboardingPage.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).forEach(a=>a.finish());
        const pages=1;
        for(let i=0;i<pages;i++){
          const content=onboardingPage.querySelector('.onboarding-page-content');
          const actions=onboardingPage.querySelector('.onboarding-actions,.onboarding-tour-actions');
          const bounds=actions?.getBoundingClientRect();
          if(content.scrollHeight>content.clientHeight+1) errors.push(name+'/'+i+': page overflow '+content.scrollHeight+'/'+content.clientHeight);
          if(!bounds || bounds.bottom>innerHeight+1 || bounds.top<0) errors.push(name+'/'+i+': footer outside viewport');
        }
        await new Promise(resolve=>dismissOnboardingPage(resolve));
      }
      await showView('settings');
      const voice=document.getElementById('speaker-profiles-entry');
      renderSettingsView();
      if(document.getElementById('speaker-profiles-entry')!==voice || !document.getElementById('app-update-entry')) errors.push('settings entries lost');
      const directory=document.querySelector('#settings-view .settings-grid');
      if(directory.scrollHeight>directory.clientHeight+1) errors.push('settings directory requires scrolling '+directory.scrollHeight+'/'+directory.clientHeight);
      const toggle=document.querySelector('[data-toggle-notes-toolbar]');
      const toolbar=document.getElementById('live-notes-toolbar');
      if(!toolbar.hidden) errors.push('toolbar initially expanded');
      toggle.click();
      if(toolbar.hidden || toggle.getAttribute('aria-expanded')!=='true') errors.push('toolbar cannot expand');
      toggle.click();
      if(!toolbar.hidden) errors.push('toolbar cannot collapse');
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(onboardingFit.result?.value) && onboardingFit.result.value.length === 0,
    `引导页默认满屏及应用入口回归：${JSON.stringify(onboardingFit)}`,
  );
  const phonePair = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      openOnboardingMobile();
      onboardingPage.querySelector('[data-onboarding-mobile-pair]').click();
      const deadline=Date.now()+10000;
      while(!document.querySelector('#mobile-pair-dialog').open && Date.now()<deadline) await new Promise(r=>setTimeout(r,25));
      const status=await window.brevia.mobile.status();
      return {status,pin:document.querySelector('#mobile-pin').textContent,visible:!document.querySelector('#mobile-pairing').hidden,error:document.querySelector('#mobile-pair-error').textContent};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const pairState = phonePair.result?.value;
  check(
    pairState?.visible && /^\d{6}$/.test(pairState.pin) && !pairState.error,
    `引导页应从真实配对服务显示二维码与配对码：${JSON.stringify(phonePair)}`,
  );
  if (pairState?.visible && pairState.status.addresses.length) {
    const certificate = JSON.parse(
      readFileSync(path.join(dataDir, 'mobile', 'identity.json'), 'utf8'),
    ).cert;
    const response = new Promise((resolve, reject) => {
      const request = httpsRequest(
        {
          hostname: '127.0.0.1',
          port: new URL(pairState.status.addresses[0]).port,
          path: '/pair',
          method: 'POST',
          ca: certificate,
          checkServerIdentity: () => undefined,
          headers: { 'Content-Type': 'application/json' },
        },
        (reply) => {
          reply.resume();
          reply.on('end', () => resolve(reply.statusCode));
        },
      );
      request.on('error', reject);
      request.setTimeout(10000, () => request.destroy(new Error('Phone approval timed out')));
      request.end(
        JSON.stringify({ name: '<UI test phone>', code: pairState.pin, nonce: 'b'.repeat(32) }),
      );
    });
    const approval = await client.send('Runtime.evaluate', {
      expression: `(async()=>{
        const deadline=Date.now()+6000;
        while(!document.querySelector('.mobile-request-actions') && Date.now()<deadline) await new Promise(r=>setTimeout(r,25));
        const status=await window.brevia.mobile.status();
        const info=document.querySelector('.mobile-request-info');
        const actions=document.querySelector('.mobile-request-actions');
        const safe=info?.querySelector('b')?.textContent==='<UI test phone>' && !info.querySelector('ui');
        const verification=info?.querySelector('.mobile-verification')?.textContent===status.approval?.verification;
        const focused=document.activeElement===actions?.querySelector('button');
        const dialog=document.querySelector('#mobile-pair-dialog');
        const footer=dialog.querySelector('.mobile-pair-actions').getBoundingClientRect();
        const fits=dialog.scrollHeight<=dialog.clientHeight+1 && footer.bottom<=innerHeight+1;
        return {safe,verification,focused,fits,bounds:{height:dialog.clientHeight,scroll:dialog.scrollHeight,footer:footer.bottom,viewport:innerHeight}};
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    check(
      ['safe', 'verification', 'focused', 'fits'].every(
        (key) => approval.result?.value?.[key] === true,
      ),
      `真实手机请求应安全显示设备名、校验词且默认焦点在拒绝：${JSON.stringify(approval)}`,
    );
    if (process.env.BREVIA_DESIGN_CAPTURE_DIR) {
      const output = path.resolve(process.env.BREVIA_DESIGN_CAPTURE_DIR);
      mkdirSync(output, { recursive: true });
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: 0,
        height: 0,
        deviceScaleFactor: 30 / 23,
        mobile: false,
      });
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      writeFileSync(
        path.join(output, 'desktop-onboarding-pairing-request.png'),
        Buffer.from(shot.data, 'base64'),
      );
      await client.send('Runtime.evaluate', {
        expression: `(async()=>{if(onboardingPage)await new Promise(r=>dismissOnboardingPage(r));await showView('home');})()`,
        awaitPromise: true,
      });
      await client.send('Runtime.evaluate', {
        expression: `(async()=>{await document.fonts.ready;document.getAnimations().forEach(a=>a.effect.getComputedTiming().iterations===Infinity?a.pause():a.finish());await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`,
        awaitPromise: true,
      });
      const homePairShot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      writeFileSync(
        path.join(output, 'desktop-mobile-pairing-approval.png'),
        Buffer.from(homePairShot.data, 'base64'),
      );
    }
    await client.send('Runtime.evaluate', {
      expression: "document.querySelector('.mobile-request-actions button').click()",
    });
    check((await response) === 403, '电脑拒绝后真实配对请求应返回 403');
  }
  await client.send('Runtime.evaluate', {
    expression: `(async()=>{document.querySelector('#mobile-close-pairing').click();await new Promise(r=>setTimeout(r,300));if(onboardingPage)await new Promise(resolve=>dismissOnboardingPage(resolve));})()`,
    awaitPromise: true,
  });
  const workspaceSubmit = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      showNewWorkspaceDialog();
      const form=document.querySelector('.workspace-dialog form');
      const name='Design review '+Date.now();
      form.querySelector('[name="name"]').value=name;
      form.requestSubmit(); form.requestSubmit();
      for(let i=0;i<100 && !workspaces.some(item=>item.name===name);i++) await new Promise(resolve=>setTimeout(resolve,25));
      const created=workspaces.filter(item=>item.name===name);
      if(created.length===1) {
        await window.brevia.workspace.delete({workspace_id:created[0].id});
        workspaces=workspaces.filter(item=>item.id!==created[0].id); renderWorkspaceNav();
      }
      await new Promise(resolve=>setTimeout(resolve,240));
      return created.length===1;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(workspaceSubmit.result?.value === true, '连续提交工作区表单只能创建一次');
  const protectedFocus = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      openConfirmation('Confirmation','Focus check',()=>{});
      const cancel=settingsModal.querySelector('[data-cancel-confirmation]');
      const buttons=[...settingsModal.querySelectorAll('button')];
      const initial=document.activeElement===cancel && document.querySelector('.app-shell').inert;
      buttons.at(-1).focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
      const wrapped=document.activeElement===buttons[0];
      closeModal();await new Promise(resolve=>setTimeout(resolve,250));
      return initial && wrapped && !document.querySelector('.app-shell').inert;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    protectedFocus.result?.value === true,
    '确认弹窗默认聚焦取消，Tab 留在弹窗，关闭后恢复背景交互',
  );

  const restoration = await client.send('Runtime.evaluate', {
    expression: `(async () => {
      if (onboardingPage) await new Promise(resolve => dismissOnboardingPage(resolve));
      closeModal(); await new Promise(resolve => setTimeout(resolve,250));
      meetingActive=false; await showView('settings'); openModal('ai-features');
      const tabs=settingsModal.querySelectorAll('[data-ai-settings-tab]').length===2;
      const summaryEnabled=summaryConfig.enabled;
      settingsModal.querySelector('[data-ai-settings-tab="ai-assist"]').click();
      const notes=settingsModal.querySelector('[data-ai-settings-enabled]');
      notes.click();
      const independent=summaryConfig.enabled===summaryEnabled && aiAssistConfigDraft.enabled===notes.checked;
      const levels=settingsModal.querySelectorAll('[name="proactivity"]').length===3;
      const draft=aiAssistConfigDraft; draft.proactivity='auto';
      settingsModal.querySelector('[data-open-models-from-config]').click();
      settingsModal.querySelector('.modal-close').click();
      const modelReturn=activeModal==='ai-assist' && aiAssistConfigDraft===draft && draft.proactivity==='auto';
      closeModal(); await new Promise(resolve => setTimeout(resolve,250));
      setPrepareMode('record'); await showView('prepare');
      const speakers=new FormData(prepareForm).get('meeting-speakers')==='-1';
      const language=prepareForm.querySelector('[name="meeting-language"]').closest('.flow-select');
      language.querySelector('[data-flow-select-toggle]').click();
      const menu=language.querySelector('.flow-select-options'), menuRect=menu.getBoundingClientRect();
      const menusVisible=menuRect.top>=0 && menuRect.bottom<=innerHeight && menuRect.height>0 && menu.contains(document.elementFromPoint(menuRect.left+12,menuRect.top+12));
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      const button=prepareForm.querySelector('.primary-action'); button.scrollIntoView({block:'nearest'});
      const prepareReachable=button.getBoundingClientRect().bottom<=innerHeight+1;
      const data=await window.brevia.initialize();
      const meeting=await window.brevia.meeting.get({meeting_id:data.meetings[0].id});
      applyBackendDetail(meeting); await showView('detail');
      const detail=document.querySelector('#detail-view');
      const content=detail.querySelector('.detail-layout').getBoundingClientRect();
      const player=detail.querySelector('.player').getBoundingClientRect();
      const reading=content.height>100 && player.bottom<=innerHeight+1 && Math.abs(player.left-detail.getBoundingClientRect().left)<2 && Math.abs(player.right-detail.querySelector('.final-transcript').getBoundingClientRect().right-parseFloat(getComputedStyle(detail).columnGap))<2;
      const threeTabs=detail.querySelectorAll('[data-detail-tab]').length===3;
      detail.querySelector('[data-detail-tab="transcript"]').click();
      detail.querySelector('[data-transcript-version="original"]').click();
      const search=detail.querySelector('[data-transcript-search]');
      search.value='__no_matching_segment__'; search.dispatchEvent(new Event('input',{bubbles:true}));
      const filtered=[...detail.querySelectorAll('.transcript-body .segment,.transcript-body .refined-fulltext')].every(row=>!row.hidden);
      const resultsPanel=detail.querySelector('.detail-search-results');
      const searchEmpty=!resultsPanel.hidden && resultsPanel.querySelectorAll('.transcript-search-result').length===0 && detail.querySelector('.notes').hidden;
      const firstText=detail.querySelector('.segment-copy p,.refined-fulltext-body')?.textContent?.trim().slice(0,4)||'';
      search.value=firstText;search.dispatchEvent(new Event('input',{bubbles:true}));
      const mirrored=resultsPanel.querySelector('[data-transcript-search]').value===firstText && resultsPanel.querySelectorAll('.transcript-search-result').length>0;
      resultsPanel.querySelector('[data-close-transcript-search]').click();
      const searchRestored=resultsPanel.hidden&&!detail.querySelector('.notes').hidden&&document.activeElement===search;
      search.value=''; search.dispatchEvent(new Event('input',{bubbles:true}));
      detail.querySelector('[data-detail-tab="summary"]').click();
      const summaryVisible=detail.querySelector('[data-detail-panel=summary]').contains(detail.querySelector('.summary-preview')) && detail.querySelector('[data-detail-panel=notes]').hidden && detail.querySelector('.notes').hidden && !detail.querySelector('.detail-actions').hidden && detail.querySelector('.summary-preview').getBoundingClientRect().width > detail.querySelector('.detail-layout').getBoundingClientRect().width * .95 && detail.querySelector('.summary-preview').getBoundingClientRect().height>100;
      const originalSummaryConfig=structuredClone(summaryConfig);
      const retainedSummary=uiData.detail.summary.markdown;
      summaryConfig.enabled=true;summaryConfig.provider='built-in';summaryConfig.providers['built-in'].model='__missing_summary_model__';
      const previousTaskCount=taskCards.children.length;
      await generateMeetingSummary();
      const inlineSummaryConfig=taskCards.children.length===previousTaskCount && !detail.querySelector('[data-summary-feedback]').hidden && detail.querySelector('[data-summary-feedback]').textContent.includes(t('内置纪要模型未配置')) && uiData.detail.summary.markdown===retainedSummary && !summaryGeneratingMeetingId;
      detail.querySelector('[data-summary-feedback] [data-settings-modal]').click();
      const configReturnsToMeeting=activeView==='detail' && activeModal==='summary-model' && currentMeetingDetail.id===meeting.id;
      closeModal();await new Promise(resolve=>setTimeout(resolve,250));
      summaryConfig.enabled=false;await generateMeetingSummary();
      const disabledSummary=!detail.querySelector('[data-summary-feedback]').hidden && detail.querySelector('[data-summary-feedback]').textContent.includes(t('会议纪要功能未开启'));
      detail.querySelector('.summary-feedback-close').click();summaryConfig=originalSummaryConfig;
      openModal('export');const summaryExportDefault=Object.entries(exportSelection).filter(([,format])=>format).every(([content])=>content==='notes') && Boolean(exportSelection.notes);closeModal();await new Promise(resolve=>setTimeout(resolve,250));
      const summaryBack=detail.querySelector('.back');
      const summaryBackVisible=summaryBack.getBoundingClientRect().width>0 && Math.abs(summaryBack.querySelector('svg.interface-icon')?.getBoundingClientRect().width-20)<.5 && getComputedStyle(summaryBack,'::before').content==='none';
      uiData.detail.summary.markdown ||= '# 纪要草稿';
      renderMeetingDetail();
      detail.querySelector('[data-open-summary-edit]').click();
      const summaryEditor=inlineSummaryEditor;
      summaryEditor.setMarkdown('# 切换标签后保留草稿');
      uiData.detail.summaryDraft=summaryEditor.getMarkdown();
      detail.querySelector('[data-detail-tab=notes]').click();
      const editorInAside=detail.querySelector('.notes').contains(detail.querySelector('[data-inline-summary-editor]'));
      detail.querySelector('[data-detail-tab=summary]').click();
      const summaryDraftPreserved=editorInAside && inlineSummaryEditor===summaryEditor && summaryEditor.getMarkdown().includes('切换标签后保留草稿') && detail.querySelector('[data-detail-panel=summary]').contains(detail.querySelector('[data-inline-summary-editor]'));
      detail.querySelector('[data-cancel-inline-summary-edit]').click();
      applyBackendDetail({...meeting,transcript_revision:0,segments:meeting.segments.filter(segment=>segment.version!=='live')});
      const rawUnavailable=detail.querySelector('[data-transcript-version=original]').disabled && uiData.detail.originalTranscript.length===0;
      applyBackendDetail(meeting);
      showRefinementProgress(42,100,'Layout test',meeting.id,'正在识别');
      toggleTaskCardMinimized(refinementCard,refinementCard.querySelector('[data-minimize-task-card]'));
      showRefinementProgress(56,100,'Layout test',meeting.id,'正在识别');
      const minimizedProgress=refinementCard.querySelector('.task-mini-percent').textContent==='56%';
      refinementCard.classList.remove('is-minimized'); refinementCard.hidden=true;
      return {tabs,independent,levels,modelReturn,speakers,menusVisible,prepareReachable,reading,threeTabs,filtered,searchEmpty,mirrored,searchRestored,summaryVisible,inlineSummaryConfig,configReturnsToMeeting,disabledSummary,summaryExportDefault,summaryBackVisible,summaryDraftPreserved,rawUnavailable,minimizedProgress};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const restorationChecks = restoration.result?.value;
  check(
    restorationChecks && Object.values(restorationChecks).every(Boolean),
    `设计还原交互、独立 AI 配置及可见布局：${JSON.stringify(restorationChecks || restoration.exceptionDetails)}`,
  );
  const finalAtlasControls = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      if(onboardingPage) await new Promise(resolve=>dismissOnboardingPage(resolve));
      await openOnboardingSetup();
      for(const card of onboardingPage.querySelectorAll('.onboarding-model-card')) {
        if(card.querySelector('.asr-meters,.asr-meter,.rating-scale,.is-installed')) errors.push('legacy onboarding model details');
        const id=card.querySelector('input').value;
        if(card.querySelector('.asr-tagline').textContent!==asrText('model')[id].onboarding) errors.push('model short description');
      }
      await new Promise(resolve=>dismissOnboardingPage(resolve));
      openOnboardingPermissions({microphone:'granted',screen:'granted',systemAudioSupported:true});
      await new Promise(resolve=>setTimeout(resolve,100));
      breviaClient.onLevel('mic',0.5);
      const meters=[...document.querySelectorAll('#mic-level,[data-onboarding-mic-level],[data-live-mic-level]')];
      const masks=new Set(meters.map(e=>getComputedStyle(e).maskImage));
      const fills=new Set(meters.map(e=>getComputedStyle(e,'::after').backgroundColor));
      if(meters.length<3 || masks.size!==1 || fills.size!==1 || ![...masks][0].includes('repeating-linear-gradient')) errors.push('inconsistent input meters');
      breviaClient.onLevel('mic',0);
      if(meters.some(e=>e.style.getPropertyValue('--level')!=='0')) errors.push('silent input still active');
      await new Promise(resolve=>dismissOnboardingPage(resolve));
      openOnboardingAi();
      if(onboardingPage.querySelector('[data-configure-ai-notes]') || onboardingPage.querySelector('.onboarding-privacy-hint')) errors.push('legacy onboarding AI options');
      if(!onboardingPage.querySelector('.onboarding-shared-service [data-configure-ai-summary]')) errors.push('shared service not separated');
      await new Promise(resolve=>dismissOnboardingPage(resolve));
      await showView('home');
      showRefinementProgress(42,100,'视觉回归任务',currentMeetingDetail.id,'正在识别');
      miniPlayback.hidden=false;syncTaskCardStack(miniPlayback);
      const r=refinementCard.getBoundingClientRect(),bar=refinementBar.parentElement.getBoundingClientRect();
      if(bar.height<3 || bar.top<r.top || bar.bottom>r.bottom+.5 || refinementBar.parentElement.getAttribute('aria-valuenow')!=='42') errors.push('rear task progress hidden');
      const toggle=document.querySelector('[data-toggle-task-stack]');toggle.click();
      if(getComputedStyle(taskCards).display!=='none') errors.push('task stack cannot collapse');
      toggle.click();
      if(getComputedStyle(taskCards).display==='none') errors.push('task stack cannot restore');
      miniPlayback.hidden=true;refinementCard.hidden=true;
      for(const tone of ['success','error','info']) {
        showToast(t('工作区已创建'),undefined,tone);
        if(!toast.querySelector('.toast-status-mark svg') || getComputedStyle(toast).borderRadius!=='8px' || toast.dataset.tone!==tone || toast.getAttribute('role')!==(tone==='error'?'alert':'status')) errors.push('legacy notification '+tone);
      }
      toast.classList.remove('visible');
      const actions=document.querySelector('.window-actions');
      const center=actions.getBoundingClientRect().top+actions.getBoundingClientRect().height/2;
      for(const e of actions.querySelectorAll(':scope > #app-version,:scope > a,:scope > .language-menu,:scope > #theme-toggle')) {
        const r=e.getBoundingClientRect();if(Math.abs(r.top+r.height/2-center)>1) errors.push('window action alignment');
      }
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(finalAtlasControls.result?.value) && !finalAtlasControls.result.value.length,
    `电平、首启选型、共享 AI、任务进度及通知：${JSON.stringify(finalAtlasControls.result?.value || finalAtlasControls.exceptionDetails)}`,
  );
  const detailToolChecks = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      await showView('detail');
      const meeting=currentMeetingDetail;
      const d=uiData.detail;
      d.hasRefined=true;d.refinedMode='timestamps';d.transcriptVersion='refined';
      d.refinedTranscript=d.originalTranscript;d.transcriptEditable=true;d.refineState='idle';
      detailActiveTab='transcript';renderMeetingDetail();
      const errors=[];
      const selectors=['[data-edit-transcript]','[data-detail-translation-toggle]','[data-refine-more]','[data-open-summary-edit]','[data-copy-summary]'];
      for(const selector of selectors){
        const button=document.querySelector(selector),icon=button?.querySelector('svg');
        if(!button||!icon||Math.abs(parseFloat(getComputedStyle(icon).width)-20)>.1||button.getBoundingClientRect().height<31.5||button.getBoundingClientRect().height>36||!button.textContent.trim())errors.push(selector+': detail action geometry');
      }
      if(!document.querySelector('.refine-state.is-done[role=status]')||document.querySelector('.refine-state.is-done svg'))errors.push('legacy refined state');
      const checkMenu=selector=>{
        const menu=document.querySelector(selector),r=menu.getBoundingClientRect();
        if(r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1||!menu.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))errors.push(selector+': menu clipped or occluded');
      };
      document.querySelector('[data-refine-more]').click();checkMenu('.refine-menu');
      document.querySelector('[data-detail-translation-toggle]').click();checkMenu('.detail-translation-menu');
      document.querySelector('[data-edit-transcript]').click();
      if(!document.querySelector('[data-transcript-save]')||document.querySelector('[data-refine-more]'))errors.push('editing action guard lost');
      document.querySelector('[data-transcript-cancel]').click();
      applyBackendDetail(meeting);renderMeetingDetail();
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(detailToolChecks.result?.value) && !detailToolChecks.result.value.length,
    `详情操作统一图标、间距、菜单及编辑保护：${JSON.stringify(detailToolChecks.result?.value || detailToolChecks.exceptionDetails)}`,
  );

  const visualFeedback = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      closeModal();await new Promise(resolve=>setTimeout(resolve,250));
      applyLanguage('zh');applyTheme('light');
      const visible=element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom<=innerHeight+1&&r.top>=0&&element.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));};
      for(const mode of ['record','import']){
        setPrepareMode(mode);await showView('prepare');
        const button=prepareForm.querySelector('.primary-action'),view=document.getElementById('prepare-view');
        const r=button.getBoundingClientRect(),v=view.getBoundingClientRect(),padding=parseFloat(getComputedStyle(view).paddingBottom);
        if(!visible(button)||Math.abs(r.bottom-(v.bottom-padding))>2) errors.push(mode+': footer not aligned '+r.bottom+'/'+(v.bottom-padding));
        if(view.scrollHeight>view.clientHeight+1) errors.push(mode+': default page needs scrolling');
      }
      setPrepareMode('record');await showView('prepare');
      const primaryFields=[...prepareForm.querySelectorAll('.form-grid label')];
      if(primaryFields.length!==3 || primaryFields.some(field=>Math.abs(field.getBoundingClientRect().left-primaryFields[0].getBoundingClientRect().left)>1)) errors.push('record: main fields are not one column');
      const speakerInput=prepareForm.querySelector('[name="meeting-speakers"]');
      const previousSpeakers=speakerInput.value;
      speakerInput.value='4';renderPrepareSelects();setPrepareMode('import');
      if(new FormData(prepareForm).get('meeting-speakers')!=='4' || !prepareForm.querySelector('[data-prepare-processing] [name="meeting-speakers"]')) errors.push('prepare: processing values lost when moving fields');
      setPrepareMode('record');prepareForm.querySelector('[name="meeting-speakers"]').value=previousSpeakers;renderPrepareSelects();
      const data=await window.brevia.initialize();const meeting=await window.brevia.meeting.get({meeting_id:data.meetings[0].id});
      summaryGeneratingMeetingId=undefined;applyBackendDetail(meeting);await showView('detail');await new Promise(resolve=>setTimeout(resolve,350));
      uiData.detail.summary={markdown:'# Review\\n\\nSaved memo',hasFull:true};detailActiveTab='notes';renderMeetingDetail();setDetailLayoutMode('transcript');
      const detail=document.getElementById('detail-view');
      for(const code of ['zh','en','es','ja','ko','fr','de','ru']){
        applyLanguage(code);
        for(const action of ['data-open-summary-edit','data-copy-summary','data-regenerate-summary']){
          const button=[...detail.querySelectorAll('['+action+']')].find(visible);
          if(!button||!visible(button)||!button.textContent.trim()) errors.push(code+': action not visible '+action);
        }
      }
      applyLanguage('zh');
      const player=detail.querySelector('.player'),source=player.querySelector('.player-source');
      if(!source.contains(playerTime)||!source.contains(playerDuration)||!source.textContent.includes('/')) errors.push('playback times separated');
      if(getComputedStyle(player).borderRadius!=='0px'||getComputedStyle(player).boxShadow!=='none') errors.push('player still floating card');
      if(Math.abs(detail.querySelector('.notes').getBoundingClientRect().top-detail.querySelector('.detail-head').getBoundingClientRect().top)>2) errors.push('summary top misaligned');
      if(!visible(detail.querySelector('[data-export-detail]'))) errors.push('export action occluded');
      const exportButton=detail.querySelector('[data-export-detail]').getBoundingClientRect();
      const above=exportButton.top-detail.getBoundingClientRect().top,below=detail.querySelector('.notes').getBoundingClientRect().top-exportButton.bottom;
      if(above<11.5||below<11.5||Math.abs(above-below)>.5)errors.push('export/summary symmetric spacing');
      detail.querySelector('[data-open-summary-edit]').click();
      for(const action of ['data-cancel-inline-summary-edit','data-save-inline-summary']) if(!visible(detail.querySelector('['+action+']'))) errors.push('edit footer outside viewport');
      if(parseFloat(getComputedStyle(detail.querySelector('.notes-editor')).fontSize)!==17) errors.push('legacy editor font');
      inlineSummaryEditor.setMode('markdown');
      if(!getComputedStyle(detail.querySelector('.notes-input')).fontFamily.includes('monospace')) errors.push('Markdown source must use monospace');
      detail.querySelector('[data-cancel-inline-summary-edit]').click();
      for(const theme of ['light','dark']){
        applyTheme(theme);
        const expected=theme==='dark'?'rgb(25, 25, 25)':'rgb(255, 255, 255)';
        if(getComputedStyle(document.body).backgroundColor!==expected||getComputedStyle(player).backgroundColor!==expected) errors.push(theme+': canvas background');
        if(getComputedStyle(document.querySelector('.sidebar .new-meeting')).backgroundColor!=='rgba(0, 0, 0, 0)') errors.push(theme+': legacy navigation fill');
      }
      applyTheme('light');applyBackendDetail(meeting);
      openOnboardingPermissions();await new Promise(resolve=>setTimeout(resolve,150));
      for(const status of onboardingPage.querySelectorAll('.permission-status.is-granted')){
        const mark=getComputedStyle(status.querySelector('.check-icon'));
        if(mark.backgroundColor==='rgba(0, 0, 0, 0)'||mark.borderRadius!=='50%') errors.push('granted status lacks filled check');
      }
      await new Promise(resolve=>dismissOnboardingPage(resolve));
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(visualFeedback.result?.value) && visualFeedback.result.value.length === 0,
    `本轮视觉反馈回归：${JSON.stringify(visualFeedback.result?.value || visualFeedback.exceptionDetails)}`,
  );

  const remainingAlignment = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      await showView('detail');
      const originalMuted=playerAudio.muted;
      document.querySelector('#player-mute').click();
      await new Promise(resolve=>setTimeout(resolve,50));
      if(playerAudio.muted===originalMuted||document.querySelector('#player-mute').getAttribute('aria-pressed')!==String(playerAudio.muted)) errors.push('mute action');
      document.querySelector('#player-mute').click();
      for(const code of ['zh','en','es','ja','ko','fr','de','ru']){applyLanguage(code);if(document.querySelector('#player-mute').getAttribute('aria-label')!==t('静音'))errors.push(code+': mute label');}
      applyLanguage('zh');
      document.querySelector('#player-fullscreen').click();await new Promise(resolve=>setTimeout(resolve,400));
      if(document.fullscreenElement?.id!=='detail-view') errors.push('fullscreen action: '+toast.textContent);
      if(document.fullscreenElement)await document.exitFullscreen();await new Promise(resolve=>setTimeout(resolve,400));
      for(const state of ['saved','dirty','saving','failed']){
        const host=document.createElement('div');host.innerHTML=renderSaveState(state);document.body.append(host);
        const mark=host.querySelector('.save-state-mark'),style=getComputedStyle(mark);
        if(state==='saved' && (!mark.querySelector('svg')||style.backgroundColor==='rgba(0, 0, 0, 0)')) errors.push('saved circular check');
        if(state==='dirty' && Math.abs(parseFloat(style.width)-8)>.1) errors.push('dirty dot');
        if(state==='saving' && style.animationName!=='save-state-spin') errors.push('saving spinner');
        if(state==='failed' && mark.textContent!=='!') errors.push('failure mark');
        host.remove();
      }
      await showView('settings');await openModal('storage');
      const list=settingsModal.querySelector('.storage-list'),rows=[...list.querySelectorAll('section')];
      if(rows.length!==2 || list.clientHeight<rows.reduce((sum,row)=>sum+row.getBoundingClientRect().height,0)-1) errors.push('storage rows clipped');
      if(!settingsModal.querySelector('.storage-usage-bar')||!settingsModal.querySelector('[data-cleanup-storage]')) errors.push('storage usage/cleanup');
      const bar=settingsModal.querySelector('.storage-usage-bar');
      if(storageUsage && !bar.getAttribute('aria-label').includes(formatBytes(storageUsage.meetings))) errors.push('usage not real');
      const clear=settingsModal.querySelector('[data-clear-storage="meetings"]');clear.click();
      if(!storageConfirmationPage||!storageConfirmationPage.page.querySelector('.storage-usage-bar')||!storageConfirmationPage.page.inert)errors.push('storage confirmation lost page');
      settingsModal.querySelector('[data-cancel-confirmation]').click();
      if(activeModal!=='storage'||document.activeElement!==clear||!settingsModal.querySelector('.storage-usage-bar'))errors.push('storage confirmation return');
      closeModal();await new Promise(resolve=>setTimeout(resolve,250));await showView('home');
      const originalWorkspace=activeWorkspaceId,workspace=workspaces.find(w=>w.id===originalWorkspace)||workspaces[0];
      if(workspace){
        await switchWorkspace(workspace.id);document.querySelector('#workspace-edit').click();
        await new Promise(resolve=>setTimeout(resolve,150));
        const popup=document.querySelector('.workspace-edit-popover .modal-panel'),anchor=document.querySelector('#workspace-edit').getBoundingClientRect();
        if(!popup)errors.push('workspace not anchored');
        else {const r=popup.getBoundingClientRect();if(Math.abs(r.right-anchor.right)>2||r.top<anchor.bottom||r.bottom>innerHeight)errors.push('workspace popup bounds');const save=popup.querySelector('[type="submit"]').getBoundingClientRect(),cancel=popup.querySelector('.modal-form-actions [data-close-modal]').getBoundingClientRect();if(Math.abs(save.top-cancel.top)>1||save.left>=cancel.left)errors.push('workspace action layout');const controls=[...popup.querySelectorAll('button:not(:disabled), input, textarea, summary')].filter(e=>e.getClientRects().length);controls.at(-1).focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));if(document.activeElement!==controls[0])errors.push('workspace focus trap');if(!popup.querySelector('textarea[name="description"]')||!popup.querySelector('[data-delete-workspace]'))errors.push('workspace operations removed');}
        document.querySelector('.workspace-dialog [data-close-modal]').click();toast.classList.remove('visible');await new Promise(resolve=>setTimeout(resolve,250));await switchWorkspace(originalWorkspace);
      }
      return errors;
    })()`,
    userGesture: true,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(remainingAlignment.result?.value) && !remainingAlignment.result.value.length,
    `播放/保存状态/工作区浮窗/存储分组回归：${JSON.stringify(remainingAlignment.result?.value || remainingAlignment.exceptionDetails)}`,
  );

  const designStates = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      await showView('settings');
      const navigation=document.querySelector('#settings-view .settings-navigation');
      if(navigation.querySelectorAll('[data-settings-page]').length!==8) errors.push('general navigation');
      const general=document.querySelector('.settings-general-main').getBoundingClientRect();
      await openModal('models');
      const panel=settingsModal.querySelector('.modal-panel').getBoundingClientRect();
      if(Math.abs(general.left-panel.left)>1 || Math.abs(navigation.getBoundingClientRect().width-200)>1) errors.push('settings content origin changed');
      if(!settingsModal.querySelector('.rating-scale') || settingsModal.querySelector('.rating-scale').children.length!==1) errors.push('rating is not continuous');
      settingsModal.querySelector('.modal-body').scrollTop=500;
      await openModal('device-connection');
      if(settingsModal.querySelector('.modal-body').scrollTop!==0) errors.push('settings retained previous scroll');
      closeModal();await new Promise(resolve=>setTimeout(resolve,250));
      const deleted=document.getElementById('recently-deleted').getBoundingClientRect();
      const workspace=document.querySelector('.workspace-heading').getBoundingClientRect();
      if(deleted.top>=workspace.top || !document.querySelector('.new-workspace[aria-label]')) errors.push('sidebar order');
      await showView('detail');detailActiveTab='notes';renderMeetingDetail();
      document.querySelector('[data-edit-notes]').click();
      const saved=persistNotes;
      try {
        let rejectSave;
        persistNotes=()=>new Promise((resolve,reject)=>rejectSave=reject);
        detailNotesEditor.setMarkdown('# 保留的草稿');updateDetailNotesDraft();
        const draft=detailNotesEditor.getMarkdown();
        document.querySelector('[data-notes-save]').click();
        if(uiData.detail.notesSaveState!=='saving' || !document.querySelector('[data-notes-save]').disabled) errors.push('saving state');
        rejectSave(new Error('fixture: save failed'));
        await new Promise(resolve=>setTimeout(resolve,30));
        if(uiData.detail.notesSaveState!=='failed' || detailNotesEditor.getMarkdown()!==draft || document.querySelector('[data-notes-save]').disabled) errors.push('failure discarded draft');
        const rich=detailNotesEditor.getMarkdown();
        detailNotesEditor.setMode('markdown');detailNotesEditor.setMode('rich');
        if(detailNotesEditor.getMarkdown()!==rich) errors.push('mode lost draft');
        persistNotes=saved;
        document.querySelector('[data-notes-save]').click();
        for(let i=0;i<100&&uiData.detail.notesEditing;i++) await new Promise(resolve=>setTimeout(resolve,30));
        const written=await window.brevia.meeting.get({meeting_id:currentMeetingDetail.id});
        if(uiData.detail.notesEditing || written.notes!==draft || uiData.detail.notesSaveState!=='saved') errors.push('retry did not persist');
      } finally { persistNotes=saved; }
      await openModal('summary-model');
      summaryConfigDraft.provider='built-in';renderModal('summary-model');showSettingsModal();
      const form=settingsModal.querySelector('.summary-model-form');
      const originalPersist=persistSummaryConfig;
      const originalConfig=JSON.stringify(summaryConfig);
      const originalDisabled=form.querySelector('[type="submit"]').disabled;
      try {
        let rejectConfig, saves=0;
        persistSummaryConfig=()=>{saves++;return new Promise((resolve,reject)=>rejectConfig=reject);};
        form.requestSubmit();
        await new Promise(resolve=>setTimeout(resolve,30));
        form.requestSubmit();
        if(saves!==1 || !form.querySelector('[data-save-state="saving"]') || !form.querySelector('[type="submit"]').disabled) errors.push('config pending state');
        rejectConfig(new Error('fixture: config failed'));
        await new Promise(resolve=>setTimeout(resolve,30));
        if(!form.querySelector('[data-save-state="failed"]') || form.querySelector('[type="submit"]').disabled!==originalDisabled || JSON.stringify(summaryConfig)!==originalConfig) errors.push('config failure state');
      } finally {persistSummaryConfig=originalPersist;closeModal();}
      toast.classList.remove('visible');
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(designStates.result?.value) && !designStates.result.value.length,
    '第五轮壳层/评级/失败草稿/重试写入：' +
      JSON.stringify(designStates.result?.value || designStates.exceptionDetails),
  );

  const detailExportStates = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      closeModal();await new Promise(resolve=>setTimeout(resolve,250));
      meetingActive=false;await showView('detail');detailActiveTab='notes';setDetailLayoutMode('transcript');renderMeetingDetail();
      document.querySelector('[data-edit-notes]').click();
      const toolbar=document.querySelector('#detail-view .detail-notes-edit .notes-toolbar');
      const first=document.querySelector('#detail-view .notes-editor > :first-child');
      const tabbar=document.querySelector('#detail-view .tabbar');
      if(Math.abs(toolbar.getBoundingClientRect().top-tabbar.getBoundingClientRect().bottom-16)>1)errors.push('editor duplicated top padding');
      if(first && first.getBoundingClientRect().top-toolbar.getBoundingClientRect().bottom>32)errors.push('editor heading separated from toolbar');
      if(document.querySelectorAll('[data-detail-tab]').length!==3)errors.push('content tab removed');
      document.querySelector('[data-notes-cancel]').click();
      for(const code of ['zh','en','es','ja','ko','fr','de','ru']){
        applyLanguage(code);await openModal('export');await document.fonts.ready;
        document.getAnimations().forEach(a=>a.effect.getComputedTiming().iterations===Infinity?a.pause():a.finish());
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const panel=settingsModal.querySelector('.modal-panel'),p=panel.getBoundingClientRect(),w=document.querySelector('.workspace').getBoundingClientRect();
        if(Math.abs(p.left+p.width/2-w.left-w.width/2)>1||p.top<0||p.bottom>innerHeight+1)errors.push(code+': export position');
        const buttons=[...panel.querySelectorAll('.export-actions button')];
        const checkActions=()=>{if(buttons.some(b=>{const r=b.getBoundingClientRect();return r.left<p.left||r.right>p.right+1||r.top<p.top||r.bottom>p.bottom+1;}))errors.push(code+': export actions clipped');};
        checkActions();
        for(const picker of panel.querySelectorAll('[data-export-format]')){
          const content=picker.dataset.exportFormat;
          const choices=[...picker.parentElement.querySelectorAll('[data-flow-select-choice]')];
          if(JSON.stringify(choices.map(c=>c.dataset.value))!==JSON.stringify(exportContentFormats[content]))errors.push(code+': missing real formats');
          choices.at(-1).click();
          if(exportSelection[content]!==choices.at(-1).dataset.value)errors.push(code+': format selection disconnected');
        }
        const fields=[...panel.querySelectorAll('[data-export-item]')];
        fields.forEach(f=>{if(f.checked)f.click();});
        if(!panel.querySelector('[data-export-save]').disabled||!panel.querySelector('[data-share-target=copy]').disabled||selectedExportItems().length)errors.push(code+': empty export enabled');
        const audio=panel.querySelector('[data-export-item=audio]');
        if(audio){audio.click();if(!panel.querySelector('[data-share-target=copy]').disabled||selectedExportItems()[0]?.format!=='wav')errors.push(code+': audio export or text availability');}
        fields.forEach(f=>{if(!f.checked)f.click();});
        panel.querySelector('.export-more-share summary').click();checkActions();
        if(!panel.querySelector('[data-share-target=email]')||!panel.querySelector('[data-export-summary]').textContent.trim())errors.push(code+': share channels or packaging hint missing');
        closeModal();
      }
      applyLanguage('zh');
      for(const theme of ['light','dark']){
        applyTheme(theme);let actions=0;
        showToast(t('已保存'),{label:t('重试'),run:()=>actions++},'success');
        toast.querySelector('button').click();
        if(actions!==1||toast.classList.contains('visible'))errors.push(theme+': notification action');
        showToast(t('保存失败'),undefined,'error');
        if(toast.querySelector('button')||toast.getAttribute('role')!=='alert')errors.push(theme+': stale notification action');
      }
      applyTheme('light');toast.classList.remove('visible');
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(detailExportStates.result?.value) && !detailExportStates.result.value.length,
    `详情几何、八语言导出选项与通知操作：${JSON.stringify(detailExportStates.result?.value || detailExportStates.exceptionDetails)}`,
  );
  const originalViewport = await client.send('Runtime.evaluate', {
    expression: `({width:innerWidth,height:innerHeight})`,
    returnByValue: true,
  });
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 675,
    height: 491,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const minimumStates = [
    [
      'detail',
      `(()=>{closeModal();detailActiveTab='notes';setDetailLayoutMode('transcript');renderMeetingDetail();document.querySelector('[data-edit-notes]').click();})()`,
    ],
    [
      'export',
      `(async()=>{document.querySelector('[data-notes-cancel]').click();await openModal('export');})()`,
    ],
    ['export-expanded', `settingsModal.querySelector('.export-more-share summary').click()`],
    [
      'tasks',
      `(async()=>{closeModal();await showView('home');miniMeeting.hidden=false;miniPlayback.hidden=false;showRefinementProgress(42,100,'产品周会',currentMeetingDetail.id,'正在识别');document.querySelector('.workspace-subnav').classList.remove('is-collapsed');syncTaskCardStack(refinementCard);})()`,
    ],
  ];
  for (const [name, expression] of minimumStates) {
    const result = await client.send('Runtime.evaluate', {
      expression: `(async()=>{await (${expression});await document.fonts.ready;document.getAnimations().forEach(a=>a.effect.getComputedTiming().iterations===Infinity?a.pause():a.finish());await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const errors=[];
      if(${JSON.stringify(name)}==='detail'){
        const player=document.querySelector('#detail-view .player'),p=player.getBoundingClientRect();
        for(const selector of ['.play','.player-source','.player-meta','.player-track']){const r=player.querySelector(selector).getBoundingClientRect();if(r.left<p.left-1||r.right>p.right+1||r.top<p.top-1||r.bottom>p.bottom+1)errors.push(selector+' outside player');}
        if(p.right>document.querySelector('#detail-view .notes').getBoundingClientRect().left+1)errors.push('player overlaps memo');
      }else if(${JSON.stringify(name)}==='tasks'){
        const nav=document.querySelector('.workspace-subnav');nav.scrollTop=0;
        const first=nav.querySelector('.workspace-item').getBoundingClientRect(),n=nav.getBoundingClientRect();
        if(first.top<n.top||first.bottom>n.bottom+1)errors.push('first workspace clipped by tasks');
        for(const selector of ['#mobile-nav','.sidebar-settings']){const r=document.querySelector(selector).getBoundingClientRect();if(r.bottom>innerHeight+1)errors.push(selector+' outside sidebar');}
      }else{
        const p=settingsModal.querySelector('.modal-panel').getBoundingClientRect();
        for(const selector of ['.export-actions','[data-export-summary]']){const r=settingsModal.querySelector(selector).getBoundingClientRect();if(r.top<p.top||r.bottom>p.bottom+1||r.left<p.left||r.right>p.right+1)errors.push(selector+' outside export');}
      }return errors;})()`,
      awaitPromise: true,
      returnByValue: true,
    });
    check(
      Array.isArray(result.result?.value) && !result.result.value.length,
      `最小窗口 ${name}：${JSON.stringify(result.result?.value || result.exceptionDetails)}`,
    );
    if (process.env.BREVIA_DESIGN_CAPTURE_DIR) {
      const output = path.resolve(process.env.BREVIA_DESIGN_CAPTURE_DIR);
      mkdirSync(output, { recursive: true });
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      writeFileSync(
        path.join(output, `desktop-minimum-${name}.png`),
        Buffer.from(shot.data, 'base64'),
      );
    }
  }
  await client.send('Emulation.clearDeviceMetricsOverride', {});
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 0,
    height: 0,
    deviceScaleFactor: 30 / 23,
    mobile: false,
  });
  await client.send('Runtime.evaluate', {
    expression: `closeModal();toast.classList.remove('visible');miniMeeting.hidden=true;miniPlayback.hidden=true;refinementCard.hidden=true;syncTaskCardStack()`,
  });
  const restoredViewport = await client.send('Runtime.evaluate', {
    expression: `({width:innerWidth,height:innerHeight})`,
    returnByValue: true,
  });
  check(
    JSON.stringify(restoredViewport.result?.value) ===
      JSON.stringify(originalViewport.result?.value),
    '最小窗口检查后必须恢复默认画布',
  );

  const taskLayoutChecks = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      closeModal();await new Promise(resolve=>setTimeout(resolve,250));
      await showView('home');
      const longTitle='快牛 印尼会议 20260813 — 完整会议标题与进度保留测试';
      showRefinementProgress(42,100,longTitle,currentMeetingDetail.id,'正在识别');
      miniMeeting.hidden=false;miniTitle.textContent=longTitle;miniTimer.textContent='00:12:36';
      miniPlayback.hidden=false;document.querySelector('#mini-playback-title').textContent=longTitle;
      syncTaskCardStack(miniPlayback);
      const minimize=refinementCard.querySelector('[data-minimize-task-card]');
      minimize.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      if(!refinementCard.classList.contains('is-task-card-back'))errors.push('child key activates background card');
      minimize.click();
      if(!refinementCard.classList.contains('is-minimized'))errors.push('background minimize requires two clicks');
      minimize.click();
      await new Promise(resolve=>setTimeout(resolve,300));
      for(const card of [...taskCards.children].filter(c=>!c.hidden)){
        const r=card.getBoundingClientRect();
        if(card.scrollWidth>card.clientWidth+1)errors.push(card.id+': horizontal overflow');
        for(const child of card.querySelectorAll('header,header button')){
          const c=child.getBoundingClientRect();
          if(c.width && (c.left<r.left-1||c.right>r.right+1||c.top<r.top-1||c.bottom>r.bottom+1))errors.push(card.id+': clipped heading/control');
        }
      }
      const label=refinementCard.querySelector('.task-progress-label'),value=refinementCard.querySelector('.task-progress-value');
      if(!label||label.title!==longTitle||value?.textContent.trim()!=='· 42%'||value.getBoundingClientRect().right>refinementCard.getBoundingClientRect().right)errors.push('long title clips or loses true percentage');
      const bar=refinementBar.parentElement.getBoundingClientRect(),fill=refinementBar.getBoundingClientRect();
      if(Math.abs(fill.width/bar.width-.42)>.01||fill.height<5)errors.push('progress geometry does not reflect 42%');
      const downloadsBefore=new Map(modelDownloads);
      const dismissedBefore=dismissedModelDownloadIds.slice();
      const model=onboardingAsrModels()[0];
      modelDownloads.set(model.id,{received:model.size_bytes*.42,total:model.size_bytes,paused:false});
      renderModelDownloadQueue();
      const queue=document.querySelector('#model-download-queue');
      const pause=queue.querySelector('[data-pause-required]');
      modelDownloads.get(model.id).received=model.size_bytes*.56;renderModelDownloadQueue();
      if(queue.querySelector('[data-pause-required]')!==pause)errors.push('download updates replace live controls');
      syncTaskCardStack(refinementCard);
      queue.querySelector('[data-minimize-task-card]').click();
      if(!queue.classList.contains('is-minimized'))errors.push('background download minimize requires two clicks');
      queue.querySelector('[data-dismiss-task-card]').click();
      modelDownloads.get(model.id).received=model.size_bytes*.57;renderModelDownloadQueue();
      await new Promise(resolve=>setTimeout(resolve,250));
      if(document.querySelector('#model-download-queue')||!modelDownloads.has(model.id))errors.push('closing download reopens card or cancels actual task');
      modelDownloads.clear();for(const [id,progress] of downloadsBefore)modelDownloads.set(id,progress);dismissedModelDownloadIds=dismissedBefore;queue.remove();
      meetingActive=true;await showView('settings');await openModal('models');
      miniMeeting.hidden=false;miniMeeting.click();await new Promise(resolve=>setTimeout(resolve,400));
      document.activeElement.blur();await new Promise(resolve=>setTimeout(resolve,250));
      if(!settingsModal.hidden||activeModal||activeView!=='live'||!meetingActive||document.querySelector('.app-shell').inert)errors.push('settings remains over live meeting');
      for(const card of [...taskCards.children].filter(c=>!c.hidden)){
        if(card.scrollWidth>card.clientWidth+1)errors.push(card.id+': narrow sidebar overflow');
        const visibleText=[...card.querySelectorAll('header p,strong,time,.task-card-actions')].some(e=>e.getBoundingClientRect().width>0);
        if(visibleText)errors.push(card.id+': narrow sidebar exposes full task text');
      }
      meetingActive=false;miniMeeting.hidden=true;miniPlayback.hidden=true;refinementCard.hidden=true;
      await showView('home');await showLibraryNav('all-meetings');
      const row=document.querySelector('[data-meeting-action=delete]').closest('.meeting-row'),menu=row.querySelector('[data-meeting-menu]');
      const ids=uiData.meetings.map(m=>m.id).join(',');
      menu.click();row.querySelector('[data-meeting-action=delete]').click();
      if([...document.querySelectorAll('.meeting-menu')].some(e=>!e.hidden)||document.activeElement!==settingsModal.querySelector('[data-cancel-confirmation]'))errors.push('delete menu/focus not retired');
      settingsModal.querySelector('[data-cancel-confirmation]').click();await new Promise(resolve=>setTimeout(resolve,250));
      if(ids!==uiData.meetings.map(m=>m.id).join(',')||!settingsModal.hidden||document.querySelector('.app-shell').inert)errors.push('delete cancel changes data or traps focus');
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(taskLayoutChecks.result?.value) && !taskLayoutChecks.result.value.length,
    `任务卡片、真实进度、设置返回与删除取消：${JSON.stringify(taskLayoutChecks)}`,
  );

  // 显式启用时导出真实 Electron 渲染图，供设计稿对照；默认测试不产生图片。
  const revisedInteractions = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[],originalWorkspaces=workspaces,originalMeetings=uiData.meetings;
      closeModal();await new Promise(r=>setTimeout(r,250));
      if(onboardingPage)await new Promise(r=>dismissOnboardingPage(r));
      meetingActive=false;await showView('home');
      const root=document.querySelector('.workspace-subnav'),before=root.getBoundingClientRect().height;
      workspaces=Array.from({length:40},(_,i)=>({id:'fixture-'+i,name:'工作区 '+i,meeting_count:0}));renderWorkspaceNav();
      if(Math.abs(root.getBoundingClientRect().height-before)>1)errors.push('workspace height changes with count');
      document.querySelector('#workspace-selector').click();
      const picker=workspacePicker,search=picker.querySelector('input');
      if(picker.querySelectorAll('.workspace-item').length!==41)errors.push('missing real workspace choices');
      const list=picker.querySelector('.workspace-picker-list');
      if(list.scrollHeight<=list.clientHeight||getComputedStyle(list).overflowY!=='auto')errors.push('workspace list cannot scroll');
      search.value='工作区 39';search.dispatchEvent(new Event('input'));
      if(picker.querySelectorAll('.workspace-item').length!==1)errors.push('workspace search disconnected');
      search.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
      if(document.activeElement.dataset.workspaceId!=='fixture-39')errors.push('workspace keyboard');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      if(workspacePicker||document.activeElement.id!=='workspace-selector')errors.push('workspace escape focus');
      workspaces=originalWorkspaces;renderWorkspaceNav();
      const data=await window.brevia.initialize(),actual=data.meetings[0];
      uiData.meetings=[backendMeeting(actual)];activeLibraryNav='all-meetings';activeWorkspaceId=uiData.meetings[0].workspaceId||'';renderMeetingList();
      document.querySelector('[data-meeting-menu]').click();
      document.querySelector('[data-meeting-action=workspace]').click();
      if(document.querySelector('.meeting-menu').hidden||!document.querySelector('.meeting-workspace-menu'))errors.push('destination menu hides parent');
      if([...document.querySelectorAll('.meeting-menu button')].some(b=>!b.querySelector('svg')))errors.push('legacy menu icon');
      closeMeetingMenus();
      document.querySelector('[data-meeting-menu]').click();document.querySelector('[data-meeting-action=rename]').click();
      let input=meetingList.querySelector('[data-rename-meeting] input');input.value='重命名测试';input.dispatchEvent(new Event('input',{bubbles:true}));
      renderMeetingList();
      if(meetingList.querySelector('[data-rename-meeting] input')!==input||input.value!=='重命名测试')errors.push('refresh loses rename draft');
      input.form.requestSubmit();
      for(let i=0;i<100&&meetingRenameDraft;i++)await new Promise(r=>setTimeout(r,30));
      const written=await window.brevia.meeting.get({meeting_id:actual.id});
      if(meetingRenameDraft||written.title!=='重命名测试')errors.push('rename not persisted');
      await window.brevia.meeting.update({meeting_id:actual.id,updates:{title:actual.title}});
      uiData.meetings=[{...backendMeeting(actual),id:'9d610fcc-dd65-4a78-a996-f287d57242e3',isExample:false}];renderMeetingList();
      document.querySelector('[data-meeting-menu]').click();document.querySelector('[data-meeting-action=rename]').click();
      input=meetingList.querySelector('[data-rename-meeting] input');input.value='失败仍保留';input.dispatchEvent(new Event('input',{bubbles:true}));input.form.requestSubmit();
      for(let i=0;i<100&&meetingRenameDraft?.saving;i++)await new Promise(r=>setTimeout(r,30));
      if(!meetingRenameDraft?.error||input.value!=='失败仍保留'||input.disabled||uiData.meetings[0].title!==actual.title)errors.push('failed rename loses original or draft');
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      if(meetingRenameDraft||meetingList.querySelector('[data-rename-meeting]'))errors.push('rename cancel');
      uiData.meetings=Array.from({length:4},(_,i)=>({...backendMeeting(actual),id:'fixture-select-'+i,isExample:false}));renderMeetingList();
      document.querySelector('#meeting-selection-toggle').click();
      if(batchToolbar.hidden||!batchToolbar.querySelector('[data-batch-export]').disabled)errors.push('empty selection actions');
      meetingList.querySelector('[data-select-meeting]').click();
      if(selectedMeetingKeys.size!==1||!batchToolbar.querySelector('#batch-select-all').indeterminate)errors.push('mixed checkbox state');
      batchToolbar.querySelector('#batch-select-all').click();
      if(selectedMeetingKeys.size!==4||!batchToolbar.querySelector('#batch-select-all').checked)errors.push('select all');
      batchToolbar.querySelector('#batch-select-all').click();
      if(selectedMeetingKeys.size||!meetingSelectionMode||!batchToolbar.querySelector('[data-batch-delete]').disabled)errors.push('clear all exits selection or enables delete');
      document.querySelector('#meeting-selection-toggle').click();
      if(meetingSelectionMode||!batchToolbar.hidden)errors.push('explicit exit');
      uiData.meetings=originalMeetings;workspaces=originalWorkspaces;activeWorkspaceId='';renderWorkspaceNav();renderMeetingList();
      return errors;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Array.isArray(revisedInteractions.result?.value) && !revisedInteractions.result.value.length,
    '新版选择器、菜单、重命名与多选：' +
      JSON.stringify(revisedInteractions.result?.value || revisedInteractions.exceptionDetails),
  );

  if (process.env.BREVIA_DESIGN_CAPTURE_DIR) {
    const output = path.resolve(process.env.BREVIA_DESIGN_CAPTURE_DIR);
    mkdirSync(output, { recursive: true });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 0,
      height: 0,
      deviceScaleFactor: 30 / 23,
      mobile: false,
    });
    const evaluate = async (expression) => {
      const value = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (value.exceptionDetails)
        throw new Error(
          value.exceptionDetails.exception?.description || value.exceptionDetails.text,
        );
      return value.result?.value;
    };
    await evaluate(
      `(async () => { if (onboardingPage) await new Promise(resolve => dismissOnboardingPage(resolve)); closeModal(); await new Promise(resolve => setTimeout(resolve,250)); meetingActive=false; miniMeeting.hidden=true; clearInterval(timer); applyLanguage('zh'); applyTheme('light'); })()`,
    );
    await delay(3500);
    const captures = [
      [
        'desktop-library',
        `(()=>{window.visualOriginalMeetings=uiData.meetings;const source=uiData.meetings.at(-1);const now=new Date();uiData.meetings=['产品周会','客户访谈','项目复盘','需求评审'].map((title,i)=>({...source,id:'visual-library-'+i,title,isExample:false,workspaceId:'',workspace:{name:['产品','访谈','产品','未分类'][i]},createdAt:new Date(now.getFullYear(),now.getMonth(),now.getDate()-(i<2?0:7),i%2?14:10).toISOString(),durationMs:i%2?5400000:3600000,speakerCount:0,hasSummary:false,tags:i%2?['手机录音']:[],statusCode:i===1?'pending':'completed',status:{tone:i===1?'processing':'done',label:i===1?'待转写':'已整理',detail:''}}));window.visualLibraryMeetings=uiData.meetings;showView('home');renderMeetingList();homeSlogan.textContent=t('所有对话，清晰归档。');})()`,
      ],
      ['desktop-prepare', `setPrepareMode('record'); showView('prepare')`],
      ['desktop-import', `setPrepareMode('import'); showView('prepare')`],
      [
        'desktop-import-selected',
        `(()=>{const input=document.createElement('input');input.type='file';input.id='visual-import-file';input.hidden=true;document.body.append(input);})()`,
      ],
      ['desktop-settings', `renderSettingsView(); showView('settings')`],
      ['desktop-ai-summary', `openModal('ai-features')`],
      ['desktop-ai-notes', `openModal('ai-assist')`],
      ['desktop-models', `openModal('models')`],
      [
        'desktop-advanced',
        `(async()=>{await openModal('advanced-settings');const groups=settingsModal.querySelectorAll('.advanced-settings-form details');groups[0]?.setAttribute('open','');[...groups].find(group=>group.querySelector('[name^=\"live.\"]'))?.setAttribute('open','');})()`,
      ],
      ['desktop-storage', `openModal('storage')`],
      ['desktop-voiceprints', `openModal('speaker-profiles')`],
      ['desktop-phone', `openModal('device-connection')`],
      [
        'desktop-workspace-create',
        `(async()=>{closeModal(); await new Promise(resolve=>setTimeout(resolve,250)); showNewWorkspaceDialog();})()`,
      ],
      [
        'desktop-confirmation',
        `(()=>{document.querySelector('.workspace-dialog [data-close-modal]').click(); openConfirmation(t('删除工作区'),t('工作区内的会议将移至最近删除。恢复会议时将还原原工作区。此操作不能撤销。'),()=>{});})()`,
      ],
      [
        'desktop-tasks',
        `(async()=>{closeModal(); await new Promise(resolve=>setTimeout(resolve,250)); await showView('home'); showTranslationProgress(56,100,'en'); showSummaryProgress(68,100,'summary.generating',uiData.meetings[0].id); showRefinementProgress(42,100,'产品周会',uiData.meetings[0].id,'正在识别');})()`,
      ],
      ['desktop-task-paused', `setTaskCardPaused(refinementCard,true)`],
      [
        'desktop-task-minimized',
        `toggleTaskCardMinimized(refinementCard,refinementCard.querySelector('[data-minimize-task-card]'))`,
      ],
      [
        'desktop-live',
        `(async()=>{closeModal(); await new Promise(resolve=>setTimeout(resolve,250)); meetingActive=true; breviaClient.state.meeting={...breviaClient.state.meeting,tags:[]};breviaClient.state.inputs={mic:true,system:true};renderLiveInputStatus();document.querySelector('#pause').disabled=false;document.querySelector('#pause').innerHTML=interfaceIcon('pause')+'<span>'+t('暂停')+'</span>'; document.querySelector('#live-name').textContent='产品周会'; uiData.live.transcript=[['10:02','我们先回顾一下上周的进展。整体来说，核心功能已经稳定，当前重点是提升会议纪要的准确性和可用性。接下来会重点看真实使用场景。'],['10:04','我们建议优先邀请 3 个有代表性的客户，结合他们的真实会议内容，收集使用反馈和典型问题，再决定后续的扩展节奏。'],['10:06','另外，关于数据存储方式，我们需要向客户解释清楚：录音和文字内容优先保存在本地，在线服务需要明确确认。'],['10:08','本周先完成测试版本，下周开始试点。各负责人同步准备使用指南和反馈入口。']].map(([time,text],i)=>({time,text,speaker:{name:''},translation:i===2?'In addition, regarding the storage method, we need to explain it clearly to customers: prioritize local storage of audio and text.':undefined}));document.querySelector('#transcript-scroll').innerHTML=uiData.live.transcript.map(entry=>renderTranscriptSegment({...entry,showSpeaker:false})).join(''); await showView('live'); liveNotesEditor?.setMarkdown('## 一、试点范围\\n\\n- 先在产品团队与 3 个核心客户中进行试点\\n- 覆盖会议场景：周会、需求评审、客户访谈\\n- 试点周期 4 周，收集使用反馈并评估效果\\n- 重点验证：转写准确性、会议纪要、行动项提取\\n\\n## 二、待办事项\\n\\n- [ ] 优化会议纪要生成效果（负责人：张伟）\\n- [ ] 准备试点使用指南与 FAQ（负责人：李娜）\\n- [ ] 整理客户反馈入口（4 月 28 日）');latestAiSuggestion={id:'visual-suggestion',type:'conclusion',text:'本周先完成测试版本，下周开始小范围试点，随后汇总使用反馈并评估效果。'};aiNoteUserTyping=false;renderAiSuggestion();clearTimeout(aiSuggestionAutoFadeTimer); })()`,
      ],
      ['desktop-live-dark', `applyTheme('dark')`],
      [
        'desktop-detail',
        `(async()=>{meetingActive=false;uiData.meetings=window.visualOriginalMeetings;renderMeetingList(); miniMeeting.hidden=true; applyTheme('light'); document.querySelectorAll('#task-cards > aside').forEach(card=>card.hidden=true); const row=[...document.querySelectorAll('.meeting-list [data-meeting-id]')].at(-1); summaryGeneratingMeetingId=undefined; await openMeetingRow(row);detailActiveTab='notes';setDetailLayoutMode('transcript');uiData.detail.hasRefined=true;uiData.detail.hasOriginalTranscript=true;uiData.detail.transcriptEditable=true;uiData.detail.refinedMode='timestamps';uiData.detail.refinedTranscript=uiData.detail.transcript=uiData.detail.originalTranscript=[['张伟','大家好，今天我们主要回顾上周进展，并讨论下个版本的重点。',0],['李娜','先看一下产品数据。整体活跃用户保持增长，尤其是会议纪要功能的使用率提升明显。',28],['王强','关于下个版本，建议我们优先优化企业版的权限管理，同时控制预算，确保在 Q2 内完成上线。',72],['陈晨','我同意这个方向。另外，用户反馈中提到了移动端体验问题，我们也需要跟进。',105],['刘洋','好的，我这边会整理详细的需求列表，并在本周内评估开发资源。',138],['张伟','如果实际成本超过预算，我们再评估范围和交付节奏。',182]].map(([name,text,time],i)=>({segmentId:'visual-reference-'+i,time:formatMeetingTime(time*1000),startSeconds:time,endSeconds:time+25,speaker:{name},text}));currentMeetingDetail={...currentMeetingDetail,title:'产品周会',speakers:[{id:'visual-zhang',name:'张伟'},{id:'visual-li',name:'李娜'},{id:'visual-wang',name:'王强'}]};document.querySelector('#detail-view .detail-title h1').textContent='产品周会';uiData.detail.notes='# 试点计划\\n\\n本次会议围绕新客户试点计划的推进节奏、核心功能范围和风险评估展开讨论，明确了下阶段的重点任务与责任人。\\n\\n## 决定\\n\\n- 选定两家标杆客户开展试点，优先验证会议纪要的准确性与可用性。\\n- 试点周期为 4 周，11 月初进行中期评估。\\n- 产品侧优先支持多语言识别与发言人区分，其余需求后续迭代。\\n\\n## 待办事项\\n\\n- [ ] 整理试点客户的需求清单并确认对接人（@张伟）\\n- [ ] 完成多语言识别的测试版本并内部评测（@李娜）\\n- [ ] 准备试点使用指南与培训材料（@王强）\\n\\n## 待确认\\n\\n- [ ] 是否需要接入企业的 SSO 登录？\\n- [ ] 试点阶段的数据留存周期与安全评估方案。';uiData.detail.summary.markdown='## 会议要点\\n\\n本次会议聚焦新客户试点计划，确定了试点客户、周期与核心功能范围，并对资源安排、风险及后续评估方式达成一致。\\n\\n## 决定\\n\\n1. 选定两家标杆客户开展试点，优先验证会议纪要的准确性与可用性。\\n2. 试点周期为 4 周，11 月初进行中期评估。\\n3. 产品侧优先支持多语言识别与发言人区分，其余需求后续迭代。\\n\\n## 待办事项\\n\\n- [ ] 整理试点客户的需求清单并确认对接人（@张伟）\\n- [ ] 完成多语言识别的测试版本并内部评测（@李娜）\\n- [ ] 准备试点使用指南与培训材料（@王强）';renderMeetingDetail();})()`,
      ],
      [
        'desktop-detail-transcript',
        `document.querySelector('[data-detail-tab=transcript]').click()`,
      ],
      [
        'desktop-detail-transcript-search',
        `(()=>{const search=finalTranscript.querySelector('[data-transcript-search]');search.value='预算';search.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      ],
      [
        'desktop-detail-search-reset',
        `document.querySelector('[data-close-transcript-search]').click()`,
      ],
      ['desktop-detail-summary', `document.querySelector('[data-detail-tab=summary]').click()`],
      [
        'desktop-detail-summary-config-required',
        `(()=>{window.visualSavedSummaryConfig=structuredClone(summaryConfig);summaryConfig.enabled=true;summaryConfig.provider='built-in';summaryConfig.providers['built-in'].model='__missing_summary_model__';return generateMeetingSummary();})()`,
      ],
      [
        'desktop-detail-edit',
        `(()=>{summaryConfig=window.visualSavedSummaryConfig;document.querySelector('.summary-feedback-close').click();document.querySelector('[data-open-summary-edit]').click();})()`,
      ],
      ['desktop-detail-edit-markdown', `inlineSummaryEditor.setMode('markdown')`],
      [
        'desktop-detail-ready',
        `document.querySelector('[data-cancel-inline-summary-edit]').click()`,
      ],
      [
        'desktop-export',
        `document.querySelector('[data-detail-tab=notes]').click();openModal('export')`,
      ],
      [
        'desktop-language',
        `(async()=>{closeModal(); await new Promise(resolve=>setTimeout(resolve,250)); meetingActive=false; applyTheme('light'); openOnboardingLanguage('zh');})()`,
      ],
      [
        'desktop-onboarding-models',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve)); await openOnboardingSetup();})()`,
      ],
      [
        'desktop-onboarding-ai',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve)); openOnboardingAi();})()`,
      ],
      [
        'desktop-onboarding-ai-config',
        `(()=>{const enabled=onboardingPage.querySelector('[name="onboarding-summary-enabled"]'); if(!enabled.checked) enabled.click(); onboardingPage.querySelector('[name="onboarding-ai-way"][value="online"]').click();settingsModal.querySelector('[data-flow-select-choice="provider"][data-value="custom-openai"]').click();})()`,
      ],
      [
        'desktop-onboarding-phone',
        `(async()=>{closeModal(); await new Promise(resolve=>setTimeout(resolve,250)); await new Promise(resolve=>dismissOnboardingPage(resolve)); openOnboardingMobile();})()`,
      ],
      [
        'desktop-onboarding-pairing',
        `(async()=>{onboardingPage.querySelector('[data-onboarding-mobile-pair]').click(); const until=Date.now()+10000; while(!document.getElementById('mobile-pair-dialog').open && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,50)); if(!document.getElementById('mobile-pair-dialog').open) throw new Error('配对弹窗未打开');})()`,
      ],
      [
        'desktop-onboarding-permissions',
        `(async()=>{document.querySelector('#mobile-close-pairing').click(); await new Promise(resolve=>setTimeout(resolve,250)); await new Promise(resolve=>dismissOnboardingPage(resolve)); openOnboardingPermissions({microphone:'not-determined',screen:'not-determined',systemAudioSupported:true});})()`,
      ],
    ];
    captures.push(
      [
        'desktop-workspace-empty',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve));await showView('home');const workspace=await window.brevia.workspace.create({name:'访谈',description:''});workspaces.push(workspace);renderWorkspaceNav();await switchWorkspace(workspace.id);})()`,
      ],
      ['desktop-workspace-popover', `document.querySelector('#workspace-edit').click()`],
      ['desktop-notification-workspace', `showToast(t('工作区已创建'),undefined,'success')`],
      ['desktop-notification-ai-saved', `showToast(t('AI 笔记已保存'),undefined,'success')`],
      ['desktop-notification-error', `showToast(t('保存失败'),undefined,'error')`],
      [
        'desktop-workspace-after-popover',
        `(async()=>{document.querySelector('.workspace-dialog [data-close-modal]').click();await new Promise(resolve=>setTimeout(resolve,250));})()`,
      ],
      [
        'desktop-trash',
        `(async()=>{meetingSearch.value='';await showLibraryNav('recently-deleted');})()`,
      ],
      [
        'desktop-about',
        `(async()=>{await showLibraryNav('all-meetings');await showView('settings');await openModal('whats-new');})()`,
      ],
      [
        'desktop-update-first-launch-changelog-zh',
        `(async()=>{closeModal();await new Promise(r=>setTimeout(r,250));await showView('home');applyLanguage('zh');localStorage.setItem('brevia-whatsnew-seen','1.2.0');whatsNewShown=false;maybeShowWhatsNew();const deadline=Date.now()+6000;while(activeModal!=='upgrade-log'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));if(activeModal!=='upgrade-log')throw Error('升级日志未自动显示');})()`,
      ],
      [
        'desktop-update-changelog-scroll',
        `(()=>{const body=settingsModal.querySelector('.modal-body');body.scrollTop=body.scrollHeight;})()`,
      ],
      [
        'desktop-update-changelog-history',
        `(()=>{const body=settingsModal.querySelector('.modal-body');const history=body.querySelector('details:not(.is-current)');history.open=true;body.scrollTop=history.offsetTop-body.offsetTop;})()`,
      ],
      [
        'desktop-update-first-launch-changelog-en',
        `(()=>{applyLanguage('en');settingsModal.querySelector('.modal-body').scrollTop=0;})()`,
      ],
      [
        'desktop-update-changelog-en-long',
        `(()=>{const body=settingsModal.querySelector('.modal-body');body.scrollTop=180;})()`,
      ],
      [
        'desktop-update-changelog-en-links',
        `(()=>{const body=settingsModal.querySelector('.modal-body');const history=body.querySelector('details:not(.is-current)');history.open=true;body.scrollTop=history.offsetTop-body.offsetTop;})()`,
      ],
      [
        'desktop-update-changelog-en-dark',
        `(()=>{applyTheme('dark');settingsModal.querySelector('.modal-body').scrollTop=0;})()`,
      ],
      [
        'desktop-update-changelog-dismiss',
        `(async()=>{settingsModal.querySelector('[data-update-log-dismiss]').click();await new Promise(r=>setTimeout(r,300));if(!settingsModal.hidden||document.querySelector('.app-shell').inert||localStorage.getItem('brevia-whatsnew-seen')!==installedAppVersion)throw Error('开始使用未关闭/保存已读/恢复交互');applyTheme('light');applyLanguage('zh');})()`,
      ],
      [
        'desktop-update-changelog-same-version',
        `(()=>{whatsNewShown=false;maybeShowWhatsNew();if(activeModal)throw Error('已读版本重复弹出');})()`,
      ],
      [
        'desktop-update-changelog-about',
        `(async()=>{await openModal('upgrade-log');settingsModal.querySelector('[data-update-log-about]').click();const deadline=Date.now()+6000;while(activeModal!=='whats-new'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));if(activeModal!=='whats-new'||activeView!=='settings'||!settingsModal.classList.contains('settings-page'))throw Error('日志入口未进入D41');})()`,
      ],
      [
        'desktop-update-changelog-return',
        `(async()=>{closeModal();await new Promise(r=>setTimeout(r,600));if(activeView!=='home')throw Error('D41返回未恢复原页');await showView('settings');})()`,
      ],
      [
        'desktop-settings-dark',
        `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));applyTheme('dark');})()`,
      ],
      [
        'desktop-models-ai',
        `(async()=>{applyTheme('light');await openModal('models');const section=[...settingsModal.querySelectorAll('.model-group-heading')].find(e=>e.textContent.includes('会议纪要'));section?.scrollIntoView({block:'start'});})()`,
      ],
      [
        'desktop-models-installed',
        `(()=>{window.visualModelPaths=new Map(modelPaths);const model=onboardingAsrModels()[0];modelPaths.set(model.id,'/fixture/installed');modelLibraryTab='installed';renderModelLibrary();settingsModal.querySelector('.modal-body').scrollTop=0;})()`,
      ],
      [
        'desktop-models-download-error',
        `(()=>{modelPaths.clear();for(const [id,path] of window.visualModelPaths)modelPaths.set(id,path);modelLibraryTab='available';const model=onboardingAsrModels()[0];window.visualDownloadId=model.id;modelDownloads.set(model.id,{error:'fixture: download failed',received:0,total:model.size_bytes});renderModelLibrary();})()`,
      ],
      [
        'desktop-advanced-expanded',
        `(async()=>{modelDownloads.delete(window.visualDownloadId);await openModal('advanced-settings');settingsModal.querySelector('.advanced-settings-form details')?.setAttribute('open','');})()`,
      ],
      [
        'desktop-notes-edit',
        `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));await showView('detail');detailActiveTab='notes';setDetailLayoutMode('transcript');uiData.detail.notesEditing=false;renderMeetingDetail();document.querySelector('[data-edit-notes]').click();detailNotesEditor.setMarkdown('# 试点计划\\n\\n本次会议围绕新客户试点计划的推进节奏、核心功能范围和风险评估展开讨论。\\n\\n## 决定\\n\\n- 选定两家标杆客户开展试点。\\n- 试点周期为 4 周。\\n\\n## 待办事项\\n\\n- [ ] 整理试点客户的需求清单。\\n- [ ] 准备培训材料。');updateDetailNotesDraft();})()`,
      ],
      ['desktop-notes-markdown', `detailNotesEditor.setMode('markdown')`],
      [
        'desktop-notes-saving',
        `(()=>{window.visualPersistNotes=persistNotes;persistNotes=()=>new Promise((resolve,reject)=>window.visualRejectNotes=reject);document.querySelector('[data-notes-save]').click();})()`,
      ],
      [
        'desktop-notes-save-failed',
        `(async()=>{window.visualRejectNotes(new Error('fixture: save failed'));await new Promise(resolve=>setTimeout(resolve,50));toast.classList.remove('visible');})()`,
      ],
      [
        'desktop-component-states',
        `(async()=>{persistNotes=window.visualPersistNotes;document.querySelector('[data-notes-cancel]').click();await showView('prepare');prepareForm.querySelector('[name="meeting-speakers"]').closest('.flow-select').querySelector('.flow-select-toggle').click();})()`,
      ],
      [
        'desktop-live-expanded',
        `(async()=>{meetingActive=true;await showView('live');showRefinementProgress(42,100,'产品周会',currentMeetingDetail.id,'正在识别');document.querySelector('.sidebar .brand').focus();})()`,
      ],
      [
        'desktop-live-more-menu',
        `(()=>{const toggle=document.querySelector('#live-more-toggle');toggle.click();const panel=document.querySelector('#live-more-panel'),r=panel.getBoundingClientRect(),anchor=toggle.getBoundingClientRect();if(panel.hidden||r.top<anchor.bottom||r.bottom>innerHeight||r.right>innerWidth)throw Error('会议标题栏菜单错位');})()`,
      ],
      ['desktop-live-more-closed', `document.querySelector('#live-more-toggle').click()`],
      [
        'desktop-live-info',
        `(()=>{const before=meetingActive;document.querySelector('#live-info-toggle').click();const panel=document.querySelector('#live-info-panel'),r=panel.getBoundingClientRect();if(panel.hidden||meetingActive!==before||activeView!=='live'||!panel.textContent.includes(document.querySelector('#live-name').textContent)||r.top<40||r.bottom>innerHeight||r.right>innerWidth)throw Error('会议信息错位或改变录制状态');})()`,
      ],
      [
        'desktop-live-info-closed',
        `(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));if(!document.querySelector('#live-info-panel').hidden||document.querySelector('#live-info-toggle').getAttribute('aria-expanded')!=='false')throw Error('会议信息不能关闭');})()`,
      ],

      [
        'desktop-onboarding-storage',
        `(async()=>{meetingActive=false;document.querySelectorAll('#task-cards > aside').forEach(e=>e.hidden=true);await openOnboardingSetup();})()`,
      ],
      [
        'desktop-onboarding-ai-local-config',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve));openOnboardingAi();onboardingPage.querySelector('[name="onboarding-summary-enabled"]').checked=true;onboardingPage.querySelector('[name="onboarding-summary-enabled"]').dispatchEvent(new Event('change',{bubbles:true}));window.__designBuiltinPath=modelPaths.get(RECOMMENDED_BUILTIN_MODEL_ID);modelPaths.delete(RECOMMENDED_BUILTIN_MODEL_ID);onboardingBuiltinProvider=true;summaryConfigDraft=structuredClone(summaryConfig);summaryConfigDraft.provider='built-in';openModal('summary-model');})()`,
      ],
      [
        'desktop-onboarding-ai-local',
        `(async()=>{closeModal();if(window.__designBuiltinPath)modelPaths.set(RECOMMENDED_BUILTIN_MODEL_ID,window.__designBuiltinPath);delete window.__designBuiltinPath;await new Promise(resolve=>setTimeout(resolve,250));})()`,
      ],
      [
        'desktop-onboarding-ai-auto',
        `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));onboardingPage.querySelector('[name="onboarding-ai-enabled"]').checked=true;onboardingPage.querySelector('[data-flow-select-choice="onboarding-ai-proactivity"][data-value="auto"]').click();await new Promise(resolve=>setTimeout(resolve,1300));})()`,
      ],
      [
        'desktop-onboarding-ai-auto-written',
        `(async()=>{await new Promise(resolve=>setTimeout(resolve,2000));})()`,
      ],
      [
        'desktop-onboarding-ai-manual',
        `(()=>{onboardingPage.querySelector('[data-flow-select-choice="onboarding-ai-proactivity"][data-value="quiet"]').click();})()`,
      ],
      [
        'desktop-onboarding-ai-suggestion',
        `(async()=>{onboardingPage.querySelector('[data-demo-suggestion] button').click();await new Promise(resolve=>setTimeout(resolve,1300));})()`,
      ],
      ['desktop-onboarding-ai-written', `onboardingPage.querySelector('[data-demo-add]').click()`],
      [
        'desktop-onboarding-permissions-granted',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve));openOnboardingPermissions({microphone:'granted',screen:'not-determined',systemAudioSupported:true});})()`,
      ],
      [
        'desktop-onboarding-permissions-denied',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve));openOnboardingPermissions({microphone:'denied',screen:'denied',systemAudioSupported:false});})()`,
      ],
    );
    captures.push(
      [
        'desktop-workspace-edit',
        `(async()=>{if(onboardingPage)await new Promise(resolve=>dismissOnboardingPage(resolve));await showView('home');const workspace=await window.brevia.workspace.create({name:'产品',description:'产品研发会议'});workspaces.push(workspace);renderWorkspaceNav();await switchWorkspace(workspace.id);showEditWorkspaceDialog(workspace.id);})()`,
      ],
      [
        'desktop-task-media',
        `(async()=>{document.querySelector('.workspace-dialog [data-close-modal]').click();await switchWorkspace('');uiData.meetings=window.visualLibraryMeetings;renderMeetingList();miniMeeting.hidden=false;miniTitle.textContent='产品周会';miniTimer.textContent='00:12:36';miniPlayback.hidden=false;miniPlayback.querySelector('#mini-playback-title').textContent='客户访谈';miniPlayback.querySelector('#mini-playback-state').textContent='已暂停';if(refinementCard.classList.contains('is-minimized'))toggleTaskCardMinimized(refinementCard,refinementCard.querySelector('[data-minimize-task-card]'));showRefinementProgress(42,100,'产品周会',currentMeetingDetail.id,'正在识别');document.querySelector('.workspace-subnav').classList.remove('is-collapsed');setTaskCardPaused(refinementCard,false);syncTaskCardStack(refinementCard);await document.fonts.ready;document.getAnimations().forEach(a=>a.effect.getComputedTiming().iterations===Infinity?a.pause():a.finish());await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));for(const card of taskCards.querySelectorAll('.is-task-card-back')){const r=card.getBoundingClientRect(),h=card.querySelector('header').getBoundingClientRect();if(h.top<r.top||h.bottom>r.top+48)throw new Error('后层任务标题不可见');}const nav=document.querySelector('.workspace-subnav'),first=nav.querySelector('.workspace-item');nav.scrollTop=0;if(first.getBoundingClientRect().bottom>nav.getBoundingClientRect().bottom+1)throw new Error('任务挤出首个工作区 '+JSON.stringify({first:first.getBoundingClientRect().toJSON(),nav:nav.getBoundingClientRect().toJSON(),sidebar:document.querySelector('.sidebar').getBoundingClientRect().toJSON()}));})()`,
      ],
      [
        'desktop-models-downloading',
        `(async()=>{miniMeeting.hidden=true;miniPlayback.hidden=true;await showView('settings');await openModal('models');const model=onboardingAsrModels()[0];modelDownloads.set(model.id,{received:Math.round(model.size_bytes*.42),total:model.size_bytes,paused:false});modelLibraryTab='available';renderModelLibrary();settingsModal.querySelector('.modal-panel').scrollTop=0;settingsModal.querySelector('[data-model-id="'+model.id+'"]')?.scrollIntoView({block:'center'});})()`,
      ],
      [
        'desktop-phone-trusted',
        `(async()=>{document.querySelectorAll('#task-cards > aside, #task-cards > section, #task-cards > button').forEach(card=>card.hidden=true);await showView('settings');await openModal('device-connection');settingsModal.querySelector('.modal-body').scrollTop=0;})()`,
      ],
    );
    captures.push(
      [
        'desktop-ai-online',
        `(async()=>{await showView('settings');await openModal('ai-assist');aiAssistConfigDraft.provider='custom-openai';renderModal('ai-assist');showSettingsModal();})()`,
      ],
      [
        'desktop-model-picker-options',
        `(()=>{const selector=settingsModal.querySelector('[name=provider]').closest('.flow-select');selector.querySelector('[data-flow-select-toggle]').click();})()`,
      ],
      [
        'desktop-voiceprints-filled',
        `(async()=>{await openModal('speaker-profiles');speakerProfiles=[{id:'visual-speaker-1',name:'王琳',sample_count:2,duration_ms:62000},{id:'visual-speaker-2',name:'陈明',sample_count:1,duration_ms:28000}];expandedSpeakerProfileId='visual-speaker-1';speakerSamples.set('visual-speaker-1',[{id:'visual-sample-1',duration_ms:20000},{id:'visual-sample-2',duration_ms:42000}]);renderSpeakerProfileModal();})()`,
      ],
      [
        'desktop-trash-selected',
        `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));await showLibraryNav('recently-deleted');const source=backendMeeting((await window.brevia.initialize()).meetings[0]);uiData.meetings.push({...source,id:'visual-trash-1',title:'产品周会',isExample:false,deleted:true,deletedAt:new Date().toISOString()},{...source,id:'visual-trash-2',title:'客户访谈',isExample:false,deleted:true,deletedAt:new Date().toISOString()});renderMeetingList();for(const field of document.querySelectorAll('[data-select-meeting]'))field.click();})()`,
      ],
      ['desktop-trash-confirmation', `document.querySelector('[data-batch-delete]').click()`],
      [
        'desktop-storage-confirmation',
        `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));await showView('settings');await openModal('storage');settingsModal.querySelector('[data-clear-storage=meetings]').click();})()`,
      ],
      [
        'desktop-export-format-options',
        `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));await showView('detail');detailActiveTab='notes';setDetailLayoutMode('transcript');renderMeetingDetail();await openModal('export');})()`,
      ],
      [
        'desktop-export-expanded',
        `(()=>{settingsModal.querySelector('.export-format-wrap [data-flow-select-toggle]').click();settingsModal.querySelector('.export-more-share summary').click();})()`,
      ],
      [
        'desktop-export-none',
        `(()=>{settingsModal.querySelector('.export-more-share summary').click();settingsModal.querySelectorAll('[data-export-item]').forEach(field=>{if(field.checked)field.click();});})()`,
      ],
      [
        'desktop-export-audio-only',
        `settingsModal.querySelector('[data-export-item=audio]').click()`,
      ],
    );
    captures.push([
      'desktop-onboarding-ai-weak',
      `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));const report=deviceReport;deviceReport={...report,weak:true};openOnboardingAi();deviceReport=report;})()`,
    ]);
    captures.push(
      [
        'desktop-ai-demo-processing',
        `(async()=>{if(onboardingPage)await new Promise(resolve=>dismissOnboardingPage(resolve));openOnboardingAi();onboardingPage.querySelector('[name=onboarding-summary-enabled]').checked=true;onboardingPage.querySelector('[name=onboarding-ai-enabled]').checked=true;onboardingPage.querySelector('[name=onboarding-ai-proactivity]').value='assist';renderOnboardingSummaryDemo();renderOnboardingAiDemo();})()`,
      ],
      [
        'desktop-ai-demo-suggestion',
        `(async()=>{await new Promise(resolve=>setTimeout(resolve,1000));})()`,
      ],
      ['desktop-ai-demo-added', `document.querySelector('[data-demo-add]')?.click()`],
      [
        'desktop-ai-demo-auto',
        `(async()=>{const enabled=onboardingPage.querySelector('[name=onboarding-ai-enabled]');enabled.checked=true;renderOnboardingAiDemo();onboardingPage.querySelector('[data-flow-select-choice=onboarding-ai-proactivity][data-value=auto]').click();await new Promise(resolve=>setTimeout(resolve,2600));})()`,
      ],
      [
        'desktop-detail-tools-refined',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve));await showView('detail');const d=uiData.detail;d.hasRefined=true;d.refinedMode='timestamps';d.transcriptVersion='refined';d.refinedTranscript=d.originalTranscript;currentMeetingDetail.current_segments=d.refinedTranscript.map((entry)=>({id:entry.segmentId,text:entry.text,start_ms:entry.startSeconds*1000,end_ms:entry.endSeconds*1000}));d.transcriptEditable=true;d.refineState='idle';detailActiveTab='transcript';renderMeetingDetail();})()`,
      ],
      ['desktop-detail-refine-menu', `document.querySelector('[data-refine-more]').click()`],
      [
        'desktop-detail-translation-menu',
        `document.querySelector('[data-detail-translation-toggle]').click()`,
      ],
      [
        'desktop-detail-transcript-edit',
        `document.querySelector('[data-edit-transcript]').click()`,
      ],
      [
        'desktop-detail-transcript-edit-v11',
        `(()=>{const d=uiData.detail;d.refinedTranscript[2].translation='For the next release, we suggest prioritizing enterprise permission management and keeping the launch within budget.';document.querySelector('[data-transcript-cancel]').click();document.querySelector('[data-edit-transcript]').click();const edited=document.querySelectorAll('[data-segment-text]')[2];edited.value+=' 修改';edited.dispatchEvent(new Event('input',{bubbles:true}));edited.focus();if(!document.querySelector('#detail-view .translation').textContent.includes(t('译文（未更新）'))||document.querySelector('#detail-view .translation textarea'))throw Error('旧译文未保持只读/状态提示');if(document.querySelectorAll('[data-transcript-save]').length!==1||!document.querySelector('[data-transcript-save-status]').textContent.includes(t('已修改 · 尚未保存'))||!document.querySelector('.segment-modified-state'))throw Error('逐段修改状态缺失');})()`,
      ],
      [
        'desktop-detail-transcript-saving-v11',
        `(()=>{uiData.detail.transcriptSaveState='saving';renderMeetingDetail();if(!document.querySelector('[data-transcript-save]').disabled||!document.querySelector('[data-transcript-cancel]').disabled||![...document.querySelectorAll('[data-segment-text]')].every(f=>f.disabled))throw Error('保存中未锁定');})()`,
      ],
      [
        'desktop-detail-transcript-failed-v11',
        `(()=>{uiData.detail.transcriptSaveState='failed';renderMeetingDetail();if(!document.querySelector('[data-transcript-save]').textContent.includes(t('重试'))||!Object.values(uiData.detail.transcriptDraft).some(v=>v.includes('修改')))throw Error('失败未保留草稿/重试');})()`,
      ],
      [
        'desktop-detail-transcript-empty-v11',
        `(async()=>{const field=document.querySelector('[data-segment-text]');field.value='  ';field.dispatchEvent(new Event('input',{bubbles:true}));await saveDetailTranscriptEdits();if(!document.activeElement?.matches('[data-segment-text][aria-invalid=true]')||!uiData.detail.transcriptEditing)throw Error('空文本未定位/保留草稿 '+JSON.stringify({id:currentMeetingDetail?.id,editing:uiData.detail.transcriptEditing,state:uiData.detail.transcriptSaveState,draft:uiData.detail.transcriptDraft,errors:uiData.detail.transcriptErrors,focus:document.activeElement.outerHTML.slice(0,350)}));})()`,
      ],
      [
        'desktop-detail-summary-tools',
        `(()=>{document.querySelector('[data-transcript-cancel]').click();document.querySelector('[data-detail-tab=summary]').click();})()`,
      ],
    );
    captures.push(
      [
        'desktop-tasks-long-title',
        `(async()=>{await showView('home');miniMeeting.hidden=false;miniTitle.textContent='快牛 印尼会议 20260813 — 长会议标题验证';miniTimer.textContent='00:12:36';miniPlayback.hidden=false;document.querySelector('#mini-playback-title').textContent='客户访谈 — 带有很长标题的音频';showRefinementProgress(42,100,'快牛 印尼会议 20260813 — 长会议标题验证',currentMeetingDetail.id,'正在识别');syncTaskCardStack(refinementCard);})()`,
      ],
      [
        'desktop-live-task-summary-compact-v11',
        `(async()=>{meetingActive=true;await showView('live');taskCards.querySelectorAll('.task-card-stack-item').forEach(card=>card.hidden=true);miniMeeting.hidden=false;miniTimer.textContent='18:42';miniPlayback.hidden=false;refinementCard.hidden=false;syncTaskCardStack(miniMeeting);document.activeElement?.blur();})()`,
      ],
      [
        'desktop-live-task-summary-compact-error-v11',
        `(()=>{refinementCard.dataset.failed='true';syncTaskCardStack(miniMeeting);})()`,
      ],
      [
        'desktop-live-task-summary-expanded-v11',
        `(()=>{document.querySelector('[data-task-summary]').focus();document.querySelector('[data-task-summary]').click();})()`,
      ],
      [
        'desktop-live-task-summary-return-v11',
        `(async()=>{delete refinementCard.dataset.failed;meetingActive=false;await showView('home');document.activeElement?.blur();syncTaskCardStack();})()`,
      ],
      [
        'desktop-tasks-download-states',
        `(()=>{const models=onboardingAsrModels().slice(0,3);models.forEach((model,i)=>modelDownloads.set(model.id,{received:model.size_bytes*.42,total:model.size_bytes,paused:i===1,error:i===2?'网络连接暂时中断，请重试。':undefined}));renderModelDownloadQueue();syncTaskCardStack();taskCards.scrollTop=taskCards.scrollHeight;})()`,
      ],
      [
        'desktop-settings-with-tasks',
        `(async()=>{meetingActive=true;await showView('settings');await openModal('models');miniMeeting.hidden=false;})()`,
      ],
      [
        'desktop-settings-return-live',
        `(async()=>{miniMeeting.click();await new Promise(resolve=>setTimeout(resolve,400));document.activeElement.blur();if(!settingsModal.hidden||activeView!=='live'||!meetingActive)throw new Error('设置仍覆盖会议');})()`,
      ],
      ['desktop-live-tasks-expanded', `document.querySelector('.sidebar .brand').focus()`],
      [
        'desktop-meeting-delete',
        `(async()=>{meetingActive=false;await showLibraryNav('all-meetings');const row=document.querySelector('[data-meeting-action=delete]').closest('.meeting-row');row.querySelector('[data-meeting-menu]').click();row.querySelector('[data-meeting-action=delete]').click();})()`,
      ],
      [
        'desktop-tasks-paused',
        `(async()=>{closeModal();await new Promise(resolve=>setTimeout(resolve,250));setTaskCardPaused(refinementCard,true);syncTaskCardStack(refinementCard);taskCards.scrollTop=taskCards.scrollHeight;})()`,
      ],
      [
        'desktop-tasks-minimized',
        `toggleTaskCardMinimized(refinementCard,refinementCard.querySelector('[data-minimize-task-card]'))`,
      ],
    );
    captures.push(
      [
        'desktop-sidebar-workspace-selector-tasks',
        `(async()=>{closeModal();await new Promise(r=>setTimeout(r,250));await switchWorkspace('');uiData.meetings=window.visualLibraryMeetings;renderMeetingList();taskCards.querySelectorAll('.is-minimized').forEach(c=>c.classList.remove('is-minimized'));workspaces=Array.from({length:24},(_,i)=>({id:'visual-workspace-'+i,name:['产品','访谈','海外','未分类'][i%4]+(i>3?' '+i:''),meeting_count:i}));renderWorkspaceNav();miniMeeting.hidden=false;miniTitle.textContent='产品周会';miniTimer.textContent='00:12:36';miniPlayback.hidden=false;document.querySelector('#mini-playback-title').textContent='客户访谈';modelDownloads.clear();renderModelDownloadQueue();showRefinementProgress(42,100,'产品周会',currentMeetingDetail.id,'正在识别');syncTaskCardStack(refinementCard);taskCards.scrollTop=0;})()`,
      ],
      ['desktop-library-select-entry-v11', `(()=>{})()`],
      [
        'desktop-sidebar-workspace-popover-tasks',
        `document.querySelector('#workspace-selector').click()`,
      ],
      [
        'desktop-sidebar-workspace-search',
        `(()=>{const input=workspacePicker.querySelector('input');input.value='海外';input.dispatchEvent(new Event('input'));})()`,
      ],
      [
        'desktop-sidebar-many-tasks',
        `(()=>{closeWorkspacePicker(true);showTranslationProgress(56,100,'en');showSummaryProgress(68,100,'summary.generating',uiData.meetings[0].id);taskCards.scrollTop=taskCards.scrollHeight;})()`,
      ],
      [
        'desktop-meeting-management-menu',
        `(()=>{taskCards.querySelectorAll('.task-card-stack-item').forEach(c=>c.hidden=true);syncTaskCardStack();document.querySelector('[data-meeting-menu]').click();})()`,
      ],
      [
        'desktop-meeting-workspace-targets',
        `document.querySelector('[data-meeting-action=workspace]').click()`,
      ],
      [
        'desktop-meeting-rename-inline',
        `document.querySelector('[data-meeting-action=rename]').click()`,
      ],
      [
        'desktop-meeting-batch-none',
        `(()=>{document.querySelector('[data-cancel-meeting-rename]').click();document.querySelector('#meeting-selection-toggle').click();})()`,
      ],
      [
        'desktop-library-selection-empty-v11',
        `(()=>{miniMeeting.hidden=false;miniPlayback.hidden=false;refinementCard.hidden=false;syncTaskCardStack(refinementCard);})()`,
      ],
      [
        'desktop-library-selection-exit-v11',
        `document.querySelector('#meeting-selection-toggle').click()`,
      ],
      [
        'desktop-library-selection-entry-again-v11',
        `document.querySelector('#meeting-selection-toggle').click()`,
      ],
      [
        'desktop-meeting-batch-selected',
        `(()=>{const fields=[...meetingList.querySelectorAll('.meeting-row:not([hidden]) [data-select-meeting]')];fields[0].click();fields[2].click();})()`,
      ],
      ['desktop-meeting-batch-all', `batchToolbar.querySelector('#batch-select-all').click()`],
      [
        'desktop-meeting-batch-delete-confirm',
        `(()=>{batchToolbar.querySelector('#batch-select-all').click();const fields=[...meetingList.querySelectorAll('.meeting-row:not([hidden]) [data-select-meeting]')];fields[0].click();fields[2].click();batchToolbar.querySelector('[data-batch-delete]').click();})()`,
      ],
      [
        'desktop-meeting-batch-export-partial',
        `(()=>{closeModal();const meetings=selectedMeetings().map(m=>({...m}));showBatchResults(meetings,[{meeting_id:meetings[0].id,path:'/fixture/export.md'},{meeting_id:meetings[1].id,error:'网络连接暂时中断，请重试。'}],'export',()=>{});})()`,
      ],
      ['desktop-meeting-batch-states', `(()=>{})()`],
      [
        'desktop-library-select-entry-empty-v11',
        `(()=>{closeModal();clearMeetingSelection();uiData.meetings=[];renderMeetingList();})()`,
      ],
      [
        'desktop-trash-batch',
        `(async()=>{closeModal();await new Promise(r=>setTimeout(r,250));await showLibraryNav('recently-deleted');uiData.meetings=window.visualLibraryMeetings.slice(0,2).map(m=>({...m,deleted:true,deletedAt:new Date().toISOString()}));renderMeetingList();document.querySelector('#meeting-selection-toggle').click();batchToolbar.querySelector('#batch-select-all').click();})()`,
      ],
      [
        'desktop-devices-empty',
        `(async()=>{clearMeetingSelection();await showView('settings');await openModal('device-connection');const devices=(await window.brevia.mobile.status()).devices;for(const device of devices)await window.brevia.mobile.revoke({id:device.id});await new Promise(r=>setTimeout(r,1200));settingsModal.querySelector('.modal-body').scrollTop=0;})()`,
      ],
      [
        'desktop-devices-service-off',
        `(async()=>{await window.brevia.mobile.disable();await new Promise(r=>setTimeout(r,1200));})()`,
      ],
      [
        'desktop-mobile-discovery-pairing',
        `(async()=>{closeModal();await new Promise(r=>setTimeout(r,250));await showLibraryNav('all-meetings');uiData.meetings=window.visualLibraryMeetings;renderMeetingList();await openModal('device-connection');document.querySelector('#mobile-pair').click();const deadline=Date.now()+6000;while(!document.querySelector('#mobile-pair-dialog').open&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));if(!document.querySelector('#mobile-pair-dialog').open)throw new Error('配对弹窗未打开');settingsModal.hidden=true;settingsModal.classList.remove('modal-enter');document.querySelector('.app-shell').inert=false;})()`,
      ],
      [
        'desktop-mobile-pairing-expired',
        `(async()=>{const clock=Date.now;try{Date.now=()=>clock()+121000;await new Promise(r=>setTimeout(r,1500));}finally{Date.now=clock;}if(document.querySelector('#mobile-retry-pairing').hidden||!document.querySelector('#mobile-copy-pin').disabled||!document.querySelector('#mobile-pair-error').textContent)throw new Error('配对过期状态错误');})()`,
      ],
    );
    const measurements = [];
    for (const [name, expression] of captures) {
      await evaluate(expression);
      if (name.startsWith('desktop-update-') && (await evaluate(`activeModal==='upgrade-log'`))) {
        const issues = await evaluate(
          `(()=>{const body=settingsModal.querySelector('.modal-body'),panel=settingsModal.querySelector('.modal-panel'),footer=settingsModal.querySelector('.upgrade-log-actions');const errors=[];if(body.scrollWidth>body.clientWidth+1)errors.push('正文横向溢出');if(footer.getBoundingClientRect().bottom>innerHeight||panel.scrollHeight>panel.clientHeight+1)errors.push('固定动作溢出');if(settingsModal.querySelectorAll('.upgrade-log-actions').length!==1)errors.push('重复动作');if(!settingsModal.querySelector('.whatsnew-entry.is-current[open]')?.textContent.includes(installedAppVersion))errors.push('实际版本未展开');if(!document.querySelector('.app-shell').inert)errors.push('背景仍可操作');return errors;})()`,
        );
        if (issues.length) throw Error(name + ': ' + issues.join(', '));
      }
      if (name.startsWith('desktop-live-task-summary-compact')) {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1100, y: 100 });
        await new Promise((resolve) => setTimeout(resolve, 250));
        const valid = await evaluate(
          `(()=>{const summary=document.querySelector('[data-task-summary]'),r=summary.getBoundingClientRect(),device=document.querySelector('#mobile-nav').getBoundingClientRect();return Math.abs(r.width-52)<1&&Math.abs(r.height-44)<1&&device.top>=r.bottom&&device.top-r.bottom<32&&getComputedStyle(taskCards).display==='none'&&summary.textContent.includes('3')&&summary.textContent.includes('18:42');})()`,
        );
        if (!valid) throw Error(name + ': D51汇总几何/数量/计时/底部定位不正确');
      }
      if (name === 'desktop-import-selected') {
        const audioPath = await evaluate(
          `(async()=>{const data=await window.brevia.initialize();const meeting=await window.brevia.meeting.get({meeting_id:data.meetings[0].id});return meetingPlaybackPath(meeting);})()`,
        );
        if (!audioPath) throw new Error('导入截图需要真实样例音频');
        const { root } = await client.send('DOM.getDocument');
        const { nodeId } = await client.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: '#visual-import-file',
        });
        await client.send('DOM.setFileInputFiles', { files: [audioPath], nodeId });
        await evaluate(
          `(async()=>{const input=document.querySelector('#visual-import-file');try{await selectImportAudio(input.files[0]);if(!importAudioSelection)throw new Error('真实音频选择失败');document.querySelector('#meeting-title').value='客户访谈';}finally{input.remove();}})()`,
        );
      }
      if (name === 'desktop-export-format-options') {
        const rowsVisible = await evaluate(
          `(()=>{const list=settingsModal.querySelector('.export-builder-section'),rows=[...list.querySelectorAll('.export-content-row')];return rows.length===4&&rows.every(row=>row.getBoundingClientRect().bottom<=list.getBoundingClientRect().bottom+1);})()`,
        );
        if (!rowsVisible) throw Error('默认导出浮窗的四项内容应完整可见');
        const rect = await evaluate(
          `settingsModal.querySelector('.export-format-wrap [data-flow-select-toggle]').getBoundingClientRect().toJSON()`,
        );
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        await client.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
        await client.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
        if (
          !(await evaluate(
            `!!settingsModal.querySelector('.export-format-wrap [data-flow-select-toggle][aria-expanded=true]')`,
          ))
        )
          throw new Error('导出格式菜单未响应鼠标点击');
        if (
          !(await evaluate(
            `(()=>{const options=[...settingsModal.querySelectorAll('.export-format-wrap .flow-select-options:not([hidden]) button')];return options.length>0&&options.every(option=>option.getBoundingClientRect().height>=31.5&&option.getBoundingClientRect().height<=34&&getComputedStyle(option).fontSize==='14px')&&options.find(option=>option.dataset.value==='txt')?.textContent.trim()==='TXT';})()`,
          ))
        )
          throw new Error('导出格式菜单未对齐 D12 的行高与类型名称');
      }
      if (!name.startsWith('desktop-notification-'))
        await evaluate(`toast.classList.remove('visible')`);
      await evaluate(`document.fonts.ready.then(()=>true)`);
      await delay(500);
      await evaluate(
        `document.getAnimations().forEach(animation=>animation.effect.getComputedTiming().iterations===Infinity?animation.pause():animation.finish())`,
      );
      await evaluate(
        `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,
      );
      if (['desktop-onboarding-ai-config', 'desktop-onboarding-ai-local-config'].includes(name)) {
        const configFits = await evaluate(
          `(()=>{const panel=settingsModal.querySelector('.modal-panel'),r=panel.getBoundingClientRect();return Math.abs(r.width-450)<2&&Math.abs(r.left-(innerWidth-r.width)/2)<2&&r.top>=0&&r.bottom<=innerHeight&&(!onboardingBuiltinProvider||(!!panel.querySelector('[data-download-model]')&&panel.querySelector('[type="submit"]').disabled));})()`,
        );
        if (!configFits) throw Error(name + ': 引导配置浮窗错位或缺少真实下载状态');
      }
      const menuErrors = await evaluate(
        `([...document.querySelectorAll('.flow-select-options.is-floating:not([hidden])')].filter(menu=>{const bounds=menu.getBoundingClientRect(),anchor=menu.closest('.flow-select').querySelector('[data-flow-select-toggle]').getBoundingClientRect();return bounds.width>Math.max(anchor.width,160)+1||bounds.left<0||bounds.right>innerWidth+1||bounds.top<0||bounds.bottom>innerHeight+1;}).length)`,
      );
      if (menuErrors) throw new Error(name + ': 下拉菜单超出控件或视口边界');
      if (
        name === 'desktop-advanced' &&
        !(await evaluate(
          `(()=>{const panel=settingsModal.querySelector('[data-permission-settings]'),form=settingsModal.querySelector('.advanced-settings-form');return form.getBoundingClientRect().top-panel.getBoundingClientRect().bottom>=15.5;})()`,
        ))
      )
        throw new Error('权限区和进阶参数之间缺少分组留白');
      if (
        name === 'desktop-trash-selected' &&
        (await evaluate(
          `!!document.querySelector('.meeting-list .library-empty') || document.querySelectorAll('.meeting-row:not([hidden])').length !== 2`,
        ))
      )
        throw new Error('最近删除必须显示其它工作区的已选会议');
      if (
        ['desktop-library-select-entry-v11', 'desktop-library-selection-empty-v11'].includes(name)
      ) {
        const valid = await evaluate(
          `(()=>{const button=document.querySelector('#meeting-selection-toggle'),r=button.getBoundingClientRect(),icon=button.querySelector('svg').getBoundingClientRect(),start=document.querySelector('#home-view .page-head > .primary-action').getBoundingClientRect();if(Math.abs(r.height-44)>1||Math.abs(icon.width-16)>1||Math.abs(start.left-r.right-12)>1)return false;const fields=[...meetingList.querySelectorAll('.meeting-row:not([hidden]) [data-select-meeting]')];if(!meetingSelectionMode)return batchToolbar.hidden&&fields.every(f=>f.hidden)&&button.getAttribute('aria-pressed')==='false';return selectedMeetingKeys.size===0&&!batchToolbar.hidden&&fields.every(f=>!f.hidden&&!f.checked)&&batchToolbar.querySelector('[data-batch-export]').disabled&&batchToolbar.querySelector('[data-batch-delete]').disabled&&!batchToolbar.querySelector('[data-batch-clear]').disabled&&getComputedStyle(batchToolbar.querySelector('[data-batch-delete]')).color===getComputedStyle(batchToolbar.querySelector('[data-batch-export]')).color&&batchToolbar.querySelector('[data-batch-count]').textContent===t('已选择')+' 0 / '+fields.length;})()`,
        );
        if (!valid) throw new Error(name + ': 选择入口几何或0项初始状态不符合D53/D54');
      }
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      const png = Buffer.from(shot.data, 'base64');
      writeFileSync(path.join(output, name + '.png'), png);
      if (
        [
          'desktop-library-select-entry-v11',
          'desktop-library-selection-empty-v11',
          'desktop-sidebar-many-tasks',
          'desktop-sidebar-workspace-popover-tasks',
          'desktop-meeting-batch-selected',
          'desktop-tasks-long-title',
          'desktop-tasks-download-states',
          'desktop-settings-with-tasks',
          'desktop-settings-return-live',
          'desktop-meeting-delete',
          'desktop-library',
          'desktop-prepare',
          'desktop-settings',
          'desktop-detail-tools-refined',
          'desktop-detail-summary-tools',
          'desktop-storage',
          'desktop-workspace-popover',
          'desktop-notes-edit',
          'desktop-export-format-options',
        ].includes(name) ||
        name.startsWith('desktop-ai-demo-')
      ) {
        await client.send('Emulation.setDeviceMetricsOverride', {
          width: 0,
          height: 0,
          deviceScaleFactor: 1,
          mobile: false,
        });
        const scaled = await client.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        });
        writeFileSync(
          path.join(output, name + '-default-window.png'),
          Buffer.from(scaled.data, 'base64'),
        );
        await client.send('Emulation.setDeviceMetricsOverride', {
          width: 0,
          height: 0,
          deviceScaleFactor: 30 / 23,
          mobile: false,
        });
      }
      measurements.push({
        name,
        imageWidth: png.readUInt32BE(16),
        imageHeight: png.readUInt32BE(20),
        ...(await evaluate(
          `({ width:innerWidth, height:innerHeight, windowWidth:outerWidth, windowHeight:outerHeight, dpr:devicePixelRatio, overflow:document.body.scrollWidth>innerWidth+1, modal:{hidden:settingsModal.hidden,classes:settingsModal.className,opacity:getComputedStyle(settingsModal).opacity,panelOpacity:getComputedStyle(settingsModal.querySelector('.modal-panel')).opacity}, font:getComputedStyle(document.body).fontFamily, fontWeight:getComputedStyle(document.body).fontWeight, typography:['.page-title','.meeting-title','.detail-title','.notes-body','.transcript-text','.primary-button','.secondary-button','.setting-label'].flatMap(selector=>[...document.querySelectorAll(selector)].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).slice(0,3).map(e=>({selector,weight:getComputedStyle(e).fontWeight,size:getComputedStyle(e).fontSize}))), regions:['.sidebar','.window-bar','#settings-view .settings-navigation','.settings-page .settings-navigation','.settings-general-main','.settings-page .modal-panel','#meeting-form','.detail-layout','.player'].map(selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return {selector,rect:r?.toJSON(),display:e&&getComputedStyle(e).display}}), onboarding:[...document.querySelectorAll('.onboarding-page-content')].map(e=>({height:e.clientHeight,scroll:e.scrollHeight})), actions:[...document.querySelectorAll('.onboarding-actions,.onboarding-tour-actions')].map(e=>({bottom:e.getBoundingClientRect().bottom})) })`,
        )),
      });
    }
    if (!packagedApp) {
      const debuggerUrl = mainOutput.match(/Debugger listening on (ws:\/\/[^\s]+)/)?.[1];
      if (!debuggerUrl) throw Error('原生窗口捕获缺少主进程调试入口');
      const inspector = await connect(debuggerUrl, () => {});
      const resizeNativeWindow = async (width, height) => {
        const result = await inspector.send('Runtime.evaluate', {
          expression: `(() => { const win = process.getBuiltinModule('module').createRequire(process.cwd() + '/electron/main.js')('electron').BrowserWindow.getAllWindows()[0]; win.setContentSize(${width}, ${height}); return win.getContentBounds(); })()`,
          returnByValue: true,
        });
        if (
          result.exceptionDetails ||
          result.result?.value?.width !== width ||
          result.result?.value?.height !== height
        )
          throw Error('原生窗口尺寸不正确');
      };
      try {
        await evaluate(
          `(async()=>{document.querySelector('#mobile-close-pairing').click();await new Promise(resolve=>setTimeout(resolve,300));closeModal();})()`,
        );
        await resizeNativeWindow(675, 491);
        const nativeScenes = [
          [
            'desktop-live-task-summary-native-minimum',
            `(async()=>{closeModal();meetingActive=true;await showView('live');taskCards.querySelectorAll('.task-card-stack-item').forEach(card=>card.hidden=true);miniMeeting.hidden=false;miniPlayback.hidden=false;refinementCard.hidden=false;miniTimer.textContent='18:42';syncTaskCardStack(miniMeeting);document.activeElement?.blur();})()`,
          ],
          [
            'desktop-detail-transcript-native-minimum',
            `(async()=>{meetingActive=false;await showView('detail');const d=uiData.detail;d.notesEditing=false;d.summaryEditing=false;d.transcriptEditing=false;d.transcriptEditable=true;d.refineState='idle';d.transcriptVersion='refined';d.refinedMode='timestamps';detailActiveTab='transcript';renderMeetingDetail();document.querySelector('[data-edit-transcript]').click();})()`,
          ],
        ];
        for (const [name, expression] of nativeScenes) {
          await evaluate(expression);
          await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 100 });
          await delay(350);
          const geometry = await evaluate(
            `(()=>{const errors=[];if(document.querySelector('dialog[open]')||!settingsModal.hidden)errors.push('前序弹窗未关闭');if(document.body.scrollWidth>innerWidth+1)errors.push('横向溢出');const summary=document.querySelector('[data-task-summary]').getBoundingClientRect(),player=document.querySelector('#detail-view .player').getBoundingClientRect();if(activeView==='live'&&(Math.abs(summary.width-52)>1||Math.abs(summary.height-44)>1||summary.bottom>document.querySelector('#mobile-nav').getBoundingClientRect().top))errors.push('汇总入口错位');if(activeView==='detail'&&(document.querySelectorAll('[data-transcript-save]').length!==1||player.bottom>innerHeight+1))errors.push('编辑动作或播放器溢出');return {errors,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.body.scrollWidth>innerWidth+1};})()`,
          );
          if (geometry.errors.length) throw Error(name + ': ' + geometry.errors.join(','));
          const shot = await client.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
          });
          const png = Buffer.from(shot.data, 'base64');
          writeFileSync(path.join(output, name + '.png'), png);
          measurements.push({
            name,
            imageWidth: png.readUInt32BE(16),
            imageHeight: png.readUInt32BE(20),
            nativeContent: { width: 675, height: 491 },
            ...geometry,
          });
        }
        await evaluate(`document.querySelector('[data-transcript-cancel]').click()`);
      } finally {
        await resizeNativeWindow(981, 613);
        inspector.close();
      }
    }
    await evaluate(`window.brevia.floatingCaption.show()`);
    await delay(500);
    await evaluate(
      `window.brevia.floatingCaption.update({segmentId:'visual-caption',text:'我们先回顾上周的进展。',translation:'Let us review progress from last week.',locale:'zh'})`,
    );
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const caption = targets.find((target) => target.url.includes('floating-caption.html'));
    if (!caption) throw new Error('悬浮字幕窗口未创建');
    const captionClient = await connect(caption.webSocketDebuggerUrl, () => {});
    try {
      await delay(500);
      const shot = await captionClient.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      writeFileSync(
        path.join(output, 'desktop-floating-caption.png'),
        Buffer.from(shot.data, 'base64'),
      );
    } finally {
      captionClient.close();
      await evaluate(`window.brevia.floatingCaption.close()`);
    }
    writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
  }
  check(pageErrors.length === 0, `页面操作期间脚本异常：${pageErrors.join('\n')}`);
  client.close();
  cleanup();
  await delay(400);
} catch (error) {
  failures.push(`E2E 运行失败：${error.stack || error.message}`);
  try {
    const state = await client?.send(
      'Runtime.evaluate',
      {
        expression:
          '({visibility:document.visibilityState,phase:window.__visualAiFit,page:onboardingPage?.className,locale,activeView,activeModal})',
        returnByValue: true,
      },
      1000,
    );
    console.error('E2E失败时页面状态：', JSON.stringify(state?.result?.value));
  } catch {
    /* 失联时保留主进程日志。 */
  }
  console.error(mainOutput.slice(-4000));
  cleanup();
} finally {
  cleanup();
  try {
    rmSync(sandboxRoot, { recursive: true, force: true });
  } catch {
    /* 临时目录可能已被系统回收。 */
  }
}

if (failures.length) {
  console.error('E2E smoke failed:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('E2E smoke passed.');
process.exit(0);
