// 所有引导页共用录音、转写、纪要轮播；仅右侧底板和导航状态不同。
const carouselSegments = [
  { id: 'all', label: '录音 → 转写 → 纪要', start: 0, end: 9 },
  { id: 'recording', label: '录制会议', start: 0, end: 2.35 },
  { id: 'transcript', label: '转写文字', start: 2.35, end: 5.35 },
  { id: 'minutes', label: '生成纪要', start: 5.35, end: 9 },
];
const carouselEvents = [
  { at: 0, id: 'recording', label: '录音卡片与自然声音曲线' },
  { at: 2.35, id: 'transcript', label: '声音变为基线，整句转写淡入' },
  { at: 5.35, id: 'minutes', label: '逐字稿淡出，讨论要点与行动事项淡入' },
  { at: 8.1, id: 'return', label: '回到录音画面，继续下一轮' },
];
window.BREVIA_LEFT_STORIES = Object.fromEntries(
  ['language', 'permissions', 'setup', 'ai', 'phone'].map((kind) => [
    kind,
    { file: kind + '-left.html', duration: 9, segments: carouselSegments, events: carouselEvents },
  ]),
);
