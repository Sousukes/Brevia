/** 独立复拍标注反馈；隔离窗口、数据与静音音频，不代替全量 E2E。 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = path.join(root, '.e2e-tmp', `feedback-${process.pid}`);
const output = path.resolve(
  process.env.BREVIA_FEEDBACK_CAPTURE_DIR ||
    'output/playwright/layout-style-comparison/captures/feedback',
);
mkdirSync(sandbox, { recursive: true });
mkdirSync(path.join(sandbox, 'data'), { recursive: true });
mkdirSync(path.join(sandbox, 'recordings'), { recursive: true });
mkdirSync(output, { recursive: true });
const port = await new Promise((resolve) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const value = server.address().port;
    server.close(() => resolve(value));
  });
});
const audio = Buffer.alloc(44 + 40 * 16000 * 2);
audio.write('RIFF');
audio.writeUInt32LE(audio.length - 8, 4);
audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(16000, 24);
audio.writeUInt32LE(32000, 28);
audio.writeUInt16LE(2, 32);
audio.writeUInt16LE(16, 34);
audio.write('data', 36);
audio.writeUInt32LE(audio.length - 44, 40);
const audioPath = path.join(sandbox, 'silent.wav');
writeFileSync(audioPath, audio);
const child = spawn(
  createRequire(import.meta.url)('electron'),
  [
    '.',
    '--no-sandbox',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(sandbox, 'userdata')}`,
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      BREVIA_DATA_DIR: path.join(sandbox, 'data'),
      BREVIA_MEETINGS_DIR: path.join(sandbox, 'recordings'),
      BREVIA_MOBILE_PORT: '0',
      BREVIA_PYTHON: process.env.BREVIA_PYTHON || path.join(root, '.venv/bin/python'),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  },
);
let mainLog = '',
  socket,
  nextId = 0;
child.stderr.on('data', (data) => (mainLog += data));
const pending = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(`CDP timeout: ${method}`));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const results = [];
try {
  let target;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(
        (tab) => tab.type === 'page',
      );
    } catch {
      /* 启动期间调试端口尚未就绪。 */
    }
    if (target) break;
    await delay(100);
  }
  assert.ok(target, mainLog);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data),
      item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) item.reject(Error(message.error.message));
    else item.resolve(message.result);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`typeof initializationPromise !== 'undefined'`)) break;
    await delay(100);
  }
  await evaluate('initializationPromise');
  await evaluate(
    `(async()=>{const deadline=Date.now()+10000;while(document.querySelector('#startup-splash')){if(Date.now()>deadline)throw Error('启动遮罩未退出');await new Promise(r=>setTimeout(r,100));}})()`,
  );
  await evaluate(
    `(()=>{applyLanguage('zh');applyTheme('light');if(onboardingPage)dismissOnboardingPage();closeModal();})()`,
  );
  await delay(400);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 0,
    height: 0,
    deviceScaleFactor: 30 / 23,
    mobile: false,
  });
  await evaluate(
    `(async()=>{await showView('home');const base=uiData.meetings.at(-1)||{};workspaces=[{id:'feedback-overseas',name:'海外'},{id:'feedback-personal',name:'个人'},{id:'feedback-long',name:'用于检查长名称显示和滚动的工作区'}];activeWorkspaceId='feedback-overseas';uiData.meetings=['产品周会','客户访谈','项目复盘'].map((title,i)=>({...base,id:'feedback-'+i,title,isExample:false,workspaceId:activeWorkspaceId,createdAt:new Date(Date.now()-i*86400000).toISOString(),durationMs:1800000,speakerCount:2,hasSummary:true,tags:[],statusCode:'completed',status:{tone:'done',label:'已整理',detail:''}}));renderWorkspaceNav();renderMeetingList();updateHomeViewTitle();})()`,
  );
  const scenes = [
    [
      'library',
      `(()=>{const a=document.querySelector('#meeting-selection-toggle').getBoundingClientRect(),b=document.querySelector('#home-view .primary-action').getBoundingClientRect(),w=document.querySelector('#workspace-selector').getBoundingClientRect(),c=document.querySelector('.workspace-subnav').getBoundingClientRect();if(Math.abs(a.top-b.top)>1||Math.abs(a.height-b.height)>1||w.bottom>c.bottom)throw Error('选择按钮或工作区裁剪 '+JSON.stringify({selection:a,primary:b,selector:w,container:c}));})()`,
    ],
    [
      'workspace-picker',
      `(()=>{document.querySelector('#workspace-selector').click();const r=workspacePicker.getBoundingClientRect(),hit=document.elementFromPoint(r.left+30,r.top+30);if(!workspacePicker.matches(':popover-open')||!workspacePicker.contains(hit))throw Error('工作区弹层被遮挡');})()`,
    ],
    [
      'workspace-search',
      `(()=>{const input=workspacePicker.querySelector('input');input.value='个人';input.dispatchEvent(new Event('input'));if(workspacePicker.querySelectorAll('[data-workspace-id]').length!==1)throw Error('工作区筛选失效');})()`,
    ],
    [
      'workspace-create',
      `(async()=>{workspacePicker.querySelector('[data-new-workspace]').click();if(workspacePicker||!document.querySelector('.workspace-dialog'))throw Error('工作区创建弹窗被选择器遮挡');})()`,
    ],
    [
      'selection-empty',
      `(async()=>{document.querySelector('.workspace-dialog [data-close-modal]').click();await new Promise(r=>setTimeout(r,350));document.querySelector('#meeting-selection-toggle').click();if(selectedMeetingKeys.size||!batchToolbar.querySelector('[data-batch-delete]').disabled||!batchToolbar.querySelector('[data-batch-export]').disabled)throw Error('0项动作应禁用');})()`,
    ],
    [
      'meeting-submenu',
      `(()=>{document.querySelector('#meeting-selection-toggle').click();document.querySelector('[data-meeting-menu]').click();document.querySelector('[data-meeting-action=workspace]').click();window.dispatchEvent(new Event('resize'));const parent=document.querySelector('.meeting-menu:not([hidden])').getBoundingClientRect(),sub=document.querySelector('.meeting-workspace-menu').getBoundingClientRect();if(Math.abs(parent.top-sub.top)>1||Math.abs(parent.left-sub.right-8)>1)throw Error('二级菜单连接错位');})()`,
    ],
    [
      'playback-task',
      `(async()=>{closeMeetingMenus();currentMeetingDetail={id:'feedback-detail',title:'产品周会',segments:[],speakers:[]};playerAudio.muted=true;playerAudio.src=${JSON.stringify(pathToFileURL(audioPath).href)};await playerAudio.play();playerAudio.currentTime=12;renderMiniPlayback();const bar=miniPlaybackSeek.getBoundingClientRect();if([...miniPlayback.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||miniPlayback.querySelector('#mini-playback-caption')||Math.abs(bar.height-6)>1||getComputedStyle(miniPlaybackSeek,'::after').content!=='none')throw Error('播放卡片未统一');miniPlaybackToggle.click();if(!playerAudio.paused)throw Error('后台暂停失效');})()`,
    ],
    [
      'detail-notes',
      `(async()=>{playerAudio.pause();miniPlayback.hidden=true;await showView('detail');currentMeetingDetail={id:'feedback-detail',title:'产品周会',segments:[],speakers:[]};Object.assign(uiData.detail,{notes:'- 项目计划\\n- 确认下一步',transcript:[{time:'00:00',text:'先回顾上周进展。',speaker:{name:'张伟'},startSeconds:0,endSeconds:10}],hasRefined:false,hasOriginalTranscript:true,transcriptEditing:false,notesEditing:false,summaryEditing:false,summary:{markdown:'## 会议摘要\\n回顾进展，确认下一步。'}});detailActiveTab='notes';document.querySelector('#detail-view .detail-head h1').textContent=currentMeetingDetail.title;renderMeetingDetail();if(document.querySelector('.summary-review-hint')||document.querySelector('#language-toggle'))throw Error('已删除入口仍存在');})()`,
    ],
    [
      'detail-transcript',
      `(()=>{document.querySelector('[data-detail-tab=transcript]').click();const panel=document.querySelector('[data-detail-panel=transcript]');if(panel.hidden||!panel.getAnimations().length)throw Error('逐字稿切换缺少动画');})()`,
    ],
    [
      'detail-summary',
      `(()=>{document.querySelector('[data-detail-tab=summary]').click();const panel=document.querySelector('[data-detail-panel=summary]');if(panel.hidden||!panel.getAnimations().length)throw Error('纪要切换缺少动画');})()`,
    ],
    [
      'detail-reduced-motion',
      `(()=>{document.querySelector('[data-detail-tab=notes]').click();const panel=document.querySelector('[data-detail-panel=notes]');if(panel.hidden||panel.getAnimations().length)throw Error('减少动态效果未生效');})()`,
    ],
    [
      'onboarding-ai',
      `(()=>{openOnboardingAi();const enabled=onboardingPage.querySelector('[name=onboarding-ai-enabled]');enabled.checked=true;enabled.dispatchEvent(new Event('change',{bubbles:true}));const button=onboardingPage.querySelector('[data-flow-select-choice=onboarding-ai-proactivity][data-value=auto]');button.click();const card=button.closest('.onboarding-ai-row').getBoundingClientRect(),levels=button.parentElement.getBoundingClientRect();if(levels.bottom>card.bottom||levels.top<card.top)throw Error('主动性选择条越过卡片');if(button.getAttribute('aria-checked')!=='true'||getComputedStyle(button).justifyContent!=='center'||!getComputedStyle(button.parentElement,'::before').transitionDuration.includes('0.18'))throw Error('主动性选择器缺少居中或动画');})()`,
    ],
    [
      'onboarding-phone',
      `(async()=>{dismissOnboardingPage();await new Promise(r=>setTimeout(r,350));openOnboardingMobile();if(onboardingPage.querySelector('.mobile-install-platform p,.mobile-install-platform small')||onboardingPage.querySelectorAll('.mobile-install-qr').length!==2)throw Error('安装说明未简化或二维码丢失');})()`,
    ],
    [
      'device-connection',
      `(async()=>{dismissOnboardingPage();await new Promise(r=>setTimeout(r,350));await showView('home');await openModal('device-connection');const button=settingsModal.querySelector('[data-mobile-install-toggle]');if(!button||!settingsModal.querySelector('.mobile-install').hidden)throw Error('安装入口未移到顶部');})()`,
    ],
    [
      'device-install',
      `(()=>{settingsModal.querySelector('[data-mobile-install-toggle]').click();if(settingsModal.querySelector('.mobile-install').hidden||settingsModal.querySelectorAll('.mobile-install-qr').length!==2)throw Error('安装入口无法展开');})()`,
    ],
    [
      'device-languages',
      `(async()=>{closeModal();await new Promise(r=>setTimeout(r,350));for(const language of Object.keys(catalog)){applyLanguage(language);await openModal('device-connection');const checks={pair:document.querySelector('#mobile-pair').textContent===t('连接新设备'),title:document.querySelector('#mobile-install-title').textContent===t('安装Brevia手机端'),button:document.querySelector('[data-mobile-install-toggle]').textContent===t('安装Brevia手机端'),heading:document.querySelector('.mobile-install-platform h4').textContent===t('iPhone · App Store'),description:document.querySelector('.mobile-install-platform p').textContent===t('扫码或点击链接，从 App Store 免费安装 Brevia。'),state:document.querySelector('.mobile-device-empty')?.textContent===t('暂无已信任设备'),connected:document.querySelector('#mobile-connected-heading').textContent===t('尚未连接设备'),sidebar:[...document.querySelector('#mobile-nav').querySelectorAll('strong,svg,#mobile-sidebar-status,#mobile-nav-dot')].every(n=>{const r=n.getBoundingClientRect(),o=document.querySelector('#mobile-nav').getBoundingClientRect();const style=getComputedStyle(n),clipped=n.id==='mobile-sidebar-status'&&style.clipPath==='inset(50%)'&&style.overflow==='hidden';return r.left>=o.left-1&&r.right<=o.right+1&&(clipped||n.scrollWidth<=n.clientWidth+1);})};if(Object.values(checks).some(v=>!v))throw Error(language+JSON.stringify(checks));closeModal();await new Promise(r=>setTimeout(r,350));}applyLanguage('zh');})()`,
    ],
    [
      'settings-language',
      `(async()=>{closeModal();await new Promise(r=>setTimeout(r,350));await showView('settings');const choices=document.querySelectorAll('#settings-view [data-flow-select-choice=interface-language]');if(choices.length!==8)throw Error('设置语言选项丢失');const english=[...choices].find(c=>c.dataset.value==='en');english.closest('.flow-select').querySelector('[data-flow-select-toggle]').click();english.click();if(locale!=='en'||localStorage.getItem('brevia-language')!=='en')throw Error('设置切换语言失效');})()`,
    ],
  ];
  for (const [name, expression] of scenes) {
    console.log('Checking', name);
    if (name === 'detail-reduced-motion')
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
    else if (name === 'onboarding-ai') await send('Emulation.setEmulatedMedia', { features: [] });
    await evaluate(expression);
    await evaluate('document.fonts.ready');
    await delay(250);
    await evaluate(
      `document.getAnimations().forEach(a=>a.effect.getComputedTiming().iterations===Infinity?a.pause():a.finish())`,
    );
    const geometry = await evaluate(
      `({width:innerWidth,height:innerHeight,overflow:document.body.scrollWidth>innerWidth+1,splash:!!document.querySelector('#startup-splash')})`,
    );
    assert.equal(geometry.overflow, false, name + ' overflow');
    assert.equal(geometry.splash, false, name + ' startup overlay');
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const png = Buffer.from(shot.data, 'base64');
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 800);
    writeFileSync(path.join(output, `${name}.png`), png);
    results.push({ name, ...geometry });
  }
  writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2));
  console.log('Feedback capture and behavior checks passed:', results.length);
} catch (error) {
  console.error(error, mainLog.slice(-2000));
  process.exitCode = 1;
} finally {
  socket?.close();
  for (const { timer } of pending.values()) clearTimeout(timer);
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* 已退出。 */
  }
  await delay(400);
  rmSync(sandbox, { recursive: true, force: true });
}
