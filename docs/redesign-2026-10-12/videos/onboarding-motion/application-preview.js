// 前三步预览直接挂载应用组件；播放器控制只送给局部时间轴。
const kind = document.getElementById('root').dataset.previewKind;
const requestedLocale = new URLSearchParams(location.search).get('lang') || 'zh';
const displayLocale = window.BreviaLocaleData.onboardingMotionCopy[requestedLocale]
  ? requestedLocale
  : 'en';
document.documentElement.lang = displayLocale === 'zh' ? 'zh-CN' : displayLocale;
const overlay = document.getElementById('left-overlay');
overlay.innerHTML = renderOnboardingRail(kind, displayLocale);
const controller = window.BreviaOnboardingMotion.mount(
  overlay.querySelector('.onboarding-rail'),
  kind,
  displayLocale,
);
const tl = controller.timeline;
tl.pause().seek(0);
window.LEFT_TIMELINE = tl;
window.LEFT_STORY = window.BREVIA_LEFT_STORIES[kind];
window.__timelines = { ['brevia-' + kind + '-left']: tl };
const nativeUpdate = tl.eventCallback('onUpdate');
const nativeComplete = tl.eventCallback('onComplete');
const report = () =>
  parent.postMessage({ source: 'brevia-motion', time: tl.time(), paused: tl.paused() }, '*');
tl.eventCallback('onUpdate', () => {
  nativeUpdate?.();
  report();
});
tl.eventCallback('onComplete', () => {
  nativeComplete?.();
  tl.pause();
  parent.postMessage({ source: 'brevia-motion', ended: true }, '*');
});
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.source !== 'brevia-player') return;
  if (event.data.action === 'play') tl.play();
  if (event.data.action === 'pause') tl.pause();
  if (event.data.action === 'seek' && Number.isFinite(event.data.time))
    controller.seek(event.data.time);
});
window.addEventListener('pagehide', () => controller.destroy(), { once: true });
parent.postMessage({ source: 'brevia-motion', ready: true }, '*');
