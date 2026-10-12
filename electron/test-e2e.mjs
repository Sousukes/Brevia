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
import { spawn } from 'node:child_process';
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
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { res, rej });
        socket.send(JSON.stringify({ id, method, params }));
      });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(`${message.error.message}`));
        else res(message.result);
        return;
      }
      if (message.method) onEvent(message);
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
const sandboxRoot = path.join(root, '.e2e-tmp');
rmSync(sandboxRoot, { recursive: true, force: true });
const dataDir = path.join(sandboxRoot, 'data');
const recordingsDir = path.join(sandboxRoot, 'recordings');
const userDataDir = path.join(sandboxRoot, 'userdata');
mkdirSync(dataDir, { recursive: true });
mkdirSync(recordingsDir, { recursive: true });
mkdirSync(userDataDir, { recursive: true });

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
    '--no-sandbox',
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
  const client = await connect(target.webSocketDebuggerUrl, (message) => {
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
    expression: `({ width:outerWidth, height:outerHeight, scale:outerWidth/innerWidth, viewportWidth:innerWidth, viewportHeight:innerHeight, overflow:document.body.scrollWidth>innerWidth })`,
    returnByValue: true,
  });
  check(
    compactWindow.result?.value?.viewportWidth <= 1280 &&
      compactWindow.result.value.viewportHeight <= 800 &&
      Math.abs(compactWindow.result.value.scale - 1) < 0.02 &&
      !compactWindow.result.value.overflow,
    `桌面页面应直接使用 1280×800 与 100% 缩放，重载后保持一致：${JSON.stringify(compactWindow.result?.value)}`,
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
    onboardingPage.querySelector('[name="onboarding-ai-way"][value="built-in"]').closest('label').click();
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
    onboardingPage.querySelector('[name="onboarding-ai-way"][value="online"]').closest('label').click();
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
        return bounds.right <= outer.right + 1 && bounds.left >= outer.left - 1 && node.scrollWidth <= node.clientWidth + 1;
      });
      const normalFits = fits();
      status.textContent = 'VeryLongDeviceNameWithoutSpaces'.repeat(4) + ' · ' + t('已连接');
      results.push(translated && normalFits && fits());
      await openModal('device-connection');
      results.push(document.querySelector('#mobile-pair').textContent === t('连接新设备')
        && document.querySelector('#mobile-install-title').textContent === t('安装Brevia手机端')
        && document.querySelector('.mobile-device-empty').textContent === t('尚未连接设备'));
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
    expression: `(async () => { const page = document.querySelector('.onboarding-ai-setup-page'); const enabled = page.querySelector('[name="onboarding-ai-enabled"]'); enabled.checked=true; enabled.dispatchEvent(new Event('change',{bubbles:true})); const choices = [...page.querySelectorAll('[data-flow-select-choice="onboarding-ai-proactivity"]')]; const options = choices.map(option => option.dataset.value); choices[0].click(); choices[0].focus(); choices[0].dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true})); const keyboard = page.querySelector('[name="onboarding-ai-proactivity"]').value === 'assist' && choices[1].getAttribute('aria-checked') === 'true'; const icons = page.querySelectorAll('.onboarding-ai-icon svg').length; const toggle = page.querySelector('[name="onboarding-summary-enabled"]'); toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true })); const disabled = [...page.querySelectorAll('[name="onboarding-ai-way"]')].every((option) => option.disabled) && page.querySelector('[data-configure-ai-summary]').disabled; await finishAiOnboarding(); const saved = await window.brevia.summary.config.get(); return { options, icons, keyboard, disabled, saved: saved.enabled }; })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    JSON.stringify(aiOptions.result?.value?.options) === '["quiet","assist","auto"]' &&
      aiOptions.result?.value?.icons === 2 &&
      aiOptions.result?.value?.keyboard &&
      aiOptions.result?.value?.disabled &&
      aiOptions.result?.value?.saved === false,
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
      || !mobilePage.querySelector('a[href$="/android/Brevia-android.apk"]')) throw new Error('Mobile downloads missing');
    mobilePage.querySelector('[data-onboarding-mobile-pair]').click();
    const pairDialog = document.querySelector('#mobile-pair-dialog');
    for (let i = 0; i < 200 && !pairDialog.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    if (!pairDialog.open || !document.querySelector('.onboarding-mobile-page')) throw new Error('Onboarding pairing is not a separate dialog: ' + JSON.stringify({open:pairDialog.open,connected:pairDialog.isConnected,error:document.querySelector('#mobile-pair-error').textContent,handler:typeof (mobileConnectionContent || document.getElementById('mobile-dialog')).querySelector('#mobile-pair').onclick}));
    document.querySelector('#mobile-close-pairing').click();
    for (let i = 0; i < 60 && pairDialog.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    if (pairDialog.open) throw new Error('Pairing did not close');
    mobilePage.querySelector('[data-onboarding-mobile-skip]').click();
    const tourDeadline = Date.now() + 10000;
    while (!document.querySelector('.onboarding-tour-overlay')) {
      if (Date.now() > tourDeadline) throw new Error('Onboarding tour did not appear');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // Exercise list filtering while the tour replica exists, then reveal the real app.
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
    Math.abs(scaleAfterCaption.result?.value - 1) < 0.02,
    '打开及关闭独立字幕窗口后，主应用仍保持默认缩放',
  );
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 880,
    height: 720,
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
      const history = settingsModal.querySelector('details.whatsnew-entry');
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
    const mini = !miniMeeting.hidden && !miniMeeting.querySelector('.mobile-source-tag') && miniTitle.textContent === meeting.title && getComputedStyle(taskCards).position === 'absolute' && miniMeeting.getBoundingClientRect().bottom <= document.querySelector('.sidebar').getBoundingClientRect().bottom;
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
    for (let i = 0; i < 60 && !pairing.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    const separatePairing = pairing.open && !settingsModal.contains(pairing)
      && getComputedStyle(pairing).animationName === 'surface-in'
      && getComputedStyle(pairing, '::backdrop').animationName === 'overlay-in'
      && /^\\d{6}$/.test(document.querySelector('#mobile-pin').textContent)
      && !document.querySelector('#mobile-disable');
    document.querySelector('#mobile-close-pairing').click();
    for (let i = 0; i < 60 && !pairing.classList.contains('modal-leave'); i++) await new Promise(resolve => setTimeout(resolve, 10));
    const pairingLeaving = pairing.open && getComputedStyle(pairing).animationName === 'surface-out'
      && getComputedStyle(pairing, '::backdrop').animationName === 'overlay-out'
      && !document.querySelector('#mobile-pairing').hidden;
    for (let i = 0; i < 60 && pairing.open; i++) await new Promise(resolve => setTimeout(resolve, 50));
    const pairingClosed = !pairing.open && !settingsModal.hidden;
    closeModal();
    return {live, source, unique, mini, dialog: dialog && closing && retained && separatePairing && pairingLeaving && pairingClosed};

  })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    Object.values(mobileLive.result?.value || {}).length === 5 &&
      Object.values(mobileLive.result.value).every(Boolean),
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
        rail: onboardingPage.querySelectorAll('.onboarding-rail li').length === 6, keyboardNative: choices.every(input => input.type === 'radio') };
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
  const tourNavigation = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      if (onboardingPage) await new Promise(resolve => dismissOnboardingPage(resolve));
      openOnboardingTour(); const page=onboardingPage;
      const buttons=[...page.querySelectorAll('[data-onboarding-tour-step]')];
      const states=buttons.map((button,index)=>{button.click();return onboardingTourIndex===index && page.querySelector('.tour-preview [inert]') && page.querySelector('[data-onboarding-tour-next]').textContent;});
      buttons[2].click();
      const speakerCount=page.querySelectorAll('.tour-preview .segment .avatar, .tour-preview .segment .speaker').length;
      await new Promise(resolve=>dismissOnboardingPage(resolve));
      return {count:buttons.length, states:states.every(Boolean), speakerCount};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  check(
    tourNavigation.result?.value?.count === 5 &&
      tourNavigation.result.value.states &&
      tourNavigation.result.value.speakerCount === 0,
    '五步演示必须可导航，样例区域不可操作，实时段落不显示说话人',
  );
  const onboardingFit = await client.send('Runtime.evaluate', {
    expression: `(async()=>{
      const errors=[];
      applyLanguage('zh'); applyTheme('light');
      const steps=[['language',()=>openOnboardingLanguage('zh')],['permissions',()=>openOnboardingPermissions()],['models',()=>openOnboardingSetup()],['ai',()=>openOnboardingAi()],['phone',()=>openOnboardingMobile()],['tour',()=>openOnboardingTour()]];
      for(const [name,open] of steps){
        await open();
        await new Promise(resolve=>setTimeout(resolve,100));
        onboardingPage.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).forEach(a=>a.finish());
        const pages=name==='tour'?5:1;
        for(let i=0;i<pages;i++){
          if(name==='tour') updateOnboardingTour(onboardingPage,i);
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
        deviceScaleFactor: 1,
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
    }
    await client.send('Runtime.evaluate', {
      expression: "document.querySelector('.mobile-request-actions button').click()",
    });
    check((await response) === 403, '电脑拒绝后真实配对请求应返回 403');
  }
  await client.send('Runtime.evaluate', {
    expression: `(async()=>{document.querySelector('#mobile-close-pairing').click();await new Promise(r=>setTimeout(r,300));await new Promise(resolve=>dismissOnboardingPage(resolve));})()`,
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
      const reading=content.height>100 && player.bottom<=innerHeight+1 && Math.abs(player.width-detail.querySelector('.final-transcript').getBoundingClientRect().width)<2;
      const threeTabs=detail.querySelectorAll('[data-detail-tab]').length===3;
      detail.querySelector('[data-detail-tab="transcript"]').click();
      detail.querySelector('[data-transcript-version="original"]').click();
      const search=detail.querySelector('[data-transcript-search]');
      search.value='__no_matching_segment__'; search.dispatchEvent(new Event('input',{bubbles:true}));
      const filtered=[...detail.querySelectorAll('.transcript-body .segment,.transcript-body .refined-fulltext')].every(row=>row.hidden);
      search.value=''; search.dispatchEvent(new Event('input',{bubbles:true}));
      detail.querySelector('[data-detail-tab="summary"]').click();
      const summaryVisible=detail.querySelector('.summary-preview').getBoundingClientRect().height>100;
      applyBackendDetail({...meeting,transcript_revision:0,segments:meeting.segments.filter(segment=>segment.version!=='live')});
      const rawUnavailable=detail.querySelector('[data-transcript-version=original]').disabled && uiData.detail.originalTranscript.length===0;
      applyBackendDetail(meeting);
      showRefinementProgress(42,100,'Layout test',meeting.id,'正在识别');
      toggleTaskCardMinimized(refinementCard,refinementCard.querySelector('[data-minimize-task-card]'));
      showRefinementProgress(56,100,'Layout test',meeting.id,'正在识别');
      const minimizedProgress=refinementCard.querySelector('.task-mini-percent').textContent==='56%';
      refinementCard.classList.remove('is-minimized'); refinementCard.hidden=true;
      return {tabs,independent,levels,modelReturn,speakers,menusVisible,prepareReachable,reading,threeTabs,filtered,summaryVisible,rawUnavailable,minimizedProgress};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const restorationChecks = restoration.result?.value;
  check(
    restorationChecks && Object.values(restorationChecks).every(Boolean),
    `设计还原交互、独立 AI 配置及可见布局：${JSON.stringify(restorationChecks || restoration.exceptionDetails)}`,
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
      uiData.detail.summary={markdown:'# Review\\n\\nSaved memo',hasFull:true};renderMeetingDetail();setDetailLayoutMode('transcript');
      const detail=document.getElementById('detail-view');
      for(const code of ['zh','en','es','ja','ko','fr','de','ru']){
        applyLanguage(code);
        for(const action of ['data-open-summary-edit','data-copy-summary','data-regenerate-summary']){
          const button=detail.querySelector('['+action+']');
          if(!button||!visible(button)||!button.textContent.trim()) errors.push(code+': action not visible '+action);
        }
      }
      applyLanguage('zh');
      const player=detail.querySelector('.player'),source=player.querySelector('.player-source');
      if(!source.contains(playerTime)||!source.contains(playerDuration)||!source.textContent.includes('/')) errors.push('playback times separated');
      if(getComputedStyle(player).borderRadius!=='0px'||getComputedStyle(player).boxShadow!=='none') errors.push('player still floating card');
      if(Math.abs(detail.querySelector('.notes').getBoundingClientRect().top-detail.querySelector('.detail-head').getBoundingClientRect().top)>2) errors.push('summary top misaligned');
      if(!visible(detail.querySelector('[data-export-detail]'))) errors.push('export action occluded');
      detail.querySelector('[data-open-summary-edit]').click();
      for(const action of ['data-cancel-inline-summary-edit','data-save-inline-summary']) if(!visible(detail.querySelector('['+action+']'))) errors.push('edit footer outside viewport');
      if(parseFloat(getComputedStyle(detail.querySelector('.notes-editor')).fontSize)!==17) errors.push('legacy editor font');
      inlineSummaryEditor.setMode('markdown');
      if(getComputedStyle(detail.querySelector('.notes-input')).fontFamily!==getComputedStyle(document.body).fontFamily) errors.push('textarea font mismatch');
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

  // 显式启用时导出真实 Electron 渲染图，供设计稿对照；默认测试不产生图片。
  if (process.env.BREVIA_DESIGN_CAPTURE_DIR) {
    const output = path.resolve(process.env.BREVIA_DESIGN_CAPTURE_DIR);
    mkdirSync(output, { recursive: true });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 0,
      height: 0,
      deviceScaleFactor: 1,
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
      ['desktop-library', `showView('home')`],
      ['desktop-prepare', `setPrepareMode('record'); showView('prepare')`],
      ['desktop-import', `setPrepareMode('import'); showView('prepare')`],
      ['desktop-settings', `renderSettingsView(); showView('settings')`],
      ['desktop-ai-summary', `openModal('ai-features')`],
      ['desktop-ai-notes', `openModal('ai-assist')`],
      ['desktop-models', `openModal('models')`],
      ['desktop-advanced', `openModal('advanced-settings')`],
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
        `(async()=>{closeModal(); await new Promise(resolve=>setTimeout(resolve,250)); meetingActive=true; document.querySelector('#live-name').textContent='产品周会'; document.querySelector('#transcript-scroll').innerHTML=uiData.live.transcript.map(entry=>renderTranscriptSegment({...entry,showSpeaker:false})).join(''); await showView('live'); liveNotesEditor?.setMarkdown('# 产品周会\\n\\n## 本周进展\\n\\n- 完成新用户引导设计评审。\\n- 本周交付测试版本。\\n\\n## 重点\\n\\n周五完成内部验收，下周开始小范围发布。'); })()`,
      ],
      ['desktop-live-dark', `applyTheme('dark')`],
      [
        'desktop-detail',
        `(async()=>{meetingActive=false; miniMeeting.hidden=true; applyTheme('light'); document.querySelectorAll('#task-cards > aside').forEach(card=>card.hidden=true); const row=[...document.querySelectorAll('.meeting-list [data-meeting-id]')].at(-1); summaryGeneratingMeetingId=undefined; await openMeetingRow(row);detailActiveTab='notes';setDetailLayoutMode('transcript');uiData.detail.notes='# 产品周会\\n\\n## 本周进展\\n\\n- 新用户引导已完成设计评审。\\n- 本周交付测试版本，开展内部验收。\\n\\n## 待办\\n\\n- 产品团队跟进验收。\\n- 开发同步修复进度。';renderMeetingDetail();})()`,
      ],
      [
        'desktop-detail-transcript',
        `document.querySelector('[data-detail-tab=transcript]').click()`,
      ],
      ['desktop-detail-summary', `document.querySelector('[data-detail-tab=summary]').click()`],
      ['desktop-detail-edit', `document.querySelector('[data-open-summary-edit]').click()`],
      ['desktop-detail-edit-markdown', `inlineSummaryEditor.setMode('markdown')`],
      [
        'desktop-detail-ready',
        `document.querySelector('[data-cancel-inline-summary-edit]').click()`,
      ],
      ['desktop-export', `openModal('export')`],
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
        `(()=>{const enabled=onboardingPage.querySelector('[name="onboarding-summary-enabled"]'); if(!enabled.checked) enabled.click(); onboardingPage.querySelector('[data-configure-ai-summary]').click();})()`,
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
        `(async()=>{document.querySelector('#mobile-close-pairing').click(); await new Promise(resolve=>setTimeout(resolve,250)); await new Promise(resolve=>dismissOnboardingPage(resolve)); openOnboardingPermissions();})()`,
      ],
      [
        'desktop-tour',
        `(async()=>{await new Promise(resolve=>dismissOnboardingPage(resolve)); openOnboardingTour(); updateOnboardingTour(onboardingPage,2);})()`,
      ],
    ];
    captures.push(
      ...Array.from({ length: 5 }, (_, i) => [
        'desktop-tour-step-' + i,
        `updateOnboardingTour(onboardingPage,${i})`,
      ]),
    );
    const measurements = [];
    for (const [name, expression] of captures) {
      await evaluate(expression);
      await delay(500);
      await evaluate(
        `document.getAnimations().filter(animation=>animation.effect.getComputedTiming().iterations!==Infinity).forEach(animation=>animation.finish())`,
      );
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
        ...(await evaluate(
          `({ width:innerWidth, height:innerHeight, windowWidth:outerWidth, windowHeight:outerHeight, overflow:document.body.scrollWidth>innerWidth, font:getComputedStyle(document.body).fontFamily, onboarding:[...document.querySelectorAll('.onboarding-page-content')].map(e=>({height:e.clientHeight,scroll:e.scrollHeight})), actions:[...document.querySelectorAll('.onboarding-actions,.onboarding-tour-actions')].map(e=>({bottom:e.getBoundingClientRect().bottom})) })`,
        )),
      });
    }
    writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
  }
  check(pageErrors.length === 0, `页面操作期间脚本异常：${pageErrors.join('\n')}`);
  client.close();
  cleanup();
  await delay(400);
} catch (error) {
  failures.push(`E2E 运行失败：${error.stack || error.message}`);
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
