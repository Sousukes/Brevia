// 演示复用正式应用的外壳、图标、词条和渲染函数，不启动录音或后端。
const motionParams = new URLSearchParams(location.search);
const locale = motionParams.get('lang') === 'en' ? 'en' : 'zh';
// 正式组件通过 classic script 的共享状态读取这三项。
window.editingMeetingIndex = null;
window.uiData = { detail: {} };
window.detailActiveTab = 'summary';

(async () => {
  const pick = (zh, en) => (locale === 'en' ? en : zh);
  const scene = [
    'live',
    'summary',
    'library',
    'phone-live',
    'phone-offline',
    'pair-microphone',
    'pair-field',
  ].includes(motionParams.get('scene'))
    ? motionParams.get('scene')
    : 'live';
  const phone = scene.startsWith('phone-');
  const collaboration = scene.startsWith('pair-');
  let renderCollaboration;
  let renderCapture;
  let liveNotesEditor;
  let acceptedCount = -1;
  const stage = document.querySelector('#motion-stage');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration =
    collaboration || motionParams.has('capture')
      ? pairingTimes.duration
      : scene === 'summary'
        ? 22000
        : 20000;
  let elapsed = 0;
  let previous = 0;
  let frame = 0;
  let running = parent === window && !motionParams.has('manual');
  let reduced = reducedMotion.matches;
  let lastPaint = -Infinity;
  const rendered = new Map();
  const write = (selector, html) => {
    if (rendered.get(selector) === html) return;
    rendered.set(selector, html);
    stage.querySelector(selector).innerHTML = html;
  };
  const timeText = (seconds) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const reveal = (text, progress) =>
    [...text].slice(0, Math.ceil([...text].length * clamp(progress))).join('');
  const meeting = pick('产品周会', 'Product sync');
  const captions = [
    [
      '我们今天确认新用户引导的上线范围。',
      'Today we will confirm the launch scope for the new onboarding flow.',
    ],
    [
      '设计稿已经完成，开发团队周四可以交付测试版本。',
      'The design is ready. Engineering can deliver a test build on Thursday.',
    ],
    [
      '周五前完成内部验收，下周一开始小范围发布。',
      'Complete internal acceptance by Friday, then start a limited rollout next Monday.',
    ],
    [
      '我来整理测试范围，重点覆盖语音转写和笔记联动。',
      'I will prepare the test scope, focusing on transcription and notes.',
    ],
    [
      '先把现有功能打磨稳定，不扩展新需求。',
      'Let us keep the current features stable before adding new scope.',
    ],
  ];
  const noteItems = [
    pick('按既定范围发布新用户引导。', 'Release the agreed onboarding scope.'),
    pick('周四交付测试版本', 'Deliver the test build on Thursday'),
    pick('周五前完成内部验收', 'Complete internal acceptance by Friday'),
    pick('下周一开始小范围发布', 'Begin a limited rollout next Monday'),
  ];
  const summaryBlocks = [
    `## ${pick('会议摘要', 'Overview')}\n\n${pick('会议确认了新用户引导的上线范围。设计已完成，团队将按计划交付测试版本，并开展小范围发布。', 'The team confirmed the onboarding launch scope. The design is complete, with a test build and a limited rollout planned next.')}`,
    `## ${pick('核心结论', 'Key conclusions')}\n\n- ${noteItems[0]}\n- ${pick('本周优先稳定现有功能，不扩展新需求。', 'Prioritize stability this week without adding new scope.')}`,
    `## ${pick('已确认决定', 'Decisions')}\n\n- ${pick('决定：下周一开始小范围发布。', 'Start the limited rollout next Monday.')}\n- ${pick('确认方：会议参与者。', 'Confirmed by the meeting participants.')}`,
    `## ${pick('行动项', 'Action items')}\n\n| ${pick('任务 | 负责人 | 截止时间 | 状态', 'Task | Owner | Due | Status')} |\n| --- | --- | --- | --- |\n| ${pick('交付测试版本 | 开发团队 | 周四 | 待开始', 'Deliver test build | Engineering | Thursday | Planned')} |\n| ${pick('完成内部验收 | 产品团队 | 周五 | 待开始', 'Internal acceptance | Product | Friday | Planned')} |`,
  ];
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.documentElement.classList.toggle('is-collaboration', collaboration);
  document.body.classList.toggle('is-phone', phone);
  document.body.classList.toggle('is-compact', motionParams.has('compact'));
  const focus = ['captions', 'notes', 'full'].includes(motionParams.get('focus'))
    ? motionParams.get('focus')
    : '';
  document.body.dataset.focus = focus;

  if (collaboration) {
    renderCollaboration = await createCollaborationScene(stage, scene, locale);
  } else if (!phone) {
    const templateURL = new URL('index.html', document.querySelector('[data-app-style]').href);
    const response = await fetch(templateURL);
    if (!response.ok) throw Error(`Application template: ${response.status}`);
    const template = new DOMParser().parseFromString(await response.text(), 'text/html');
    const shell = template.querySelector('.app-shell');
    shell.removeAttribute('aria-live');
    shell
      .querySelectorAll('img')
      .forEach((image) => (image.src = new URL(image.getAttribute('src'), templateURL).href));
    const viewId =
      scene === 'live' ? 'live-view' : scene === 'summary' ? 'detail-view' : 'home-view';
    shell.querySelectorAll('.workspace > .view').forEach((view) => {
      if (view.id !== viewId && !(motionParams.has('capture') && view.id === 'prepare-view'))
        view.remove();
      else view.classList.add('active');
    });
    shell.classList.toggle('is-live-meeting', scene === 'live');
    stage.append(shell);
    const textNodes = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
    while (textNodes.nextNode()) {
      const node = textNodes.currentNode;
      const label = node.textContent.trim();
      if (label) node.textContent = node.textContent.replace(label, t(label));
    }
    shell
      .querySelectorAll('[data-interface-icon]')
      .forEach((element) => (element.innerHTML = interfaceIcon(element.dataset.interfaceIcon)));
    shell.querySelectorAll('[placeholder], [aria-label], [title]').forEach((element) => {
      for (const attribute of ['placeholder', 'aria-label', 'title'])
        if (element.hasAttribute(attribute))
          element.setAttribute(attribute, t(element.getAttribute(attribute)));
    });
    shell.querySelector('#app-version').textContent = motionParams.get('version') || 'v1.4.0';
    shell.querySelector('#theme-toggle').innerHTML = interfaceIcon('sun');
    shell.querySelector('.workspace-container').innerHTML =
      `<div class="workspace-subnav-content"><div class="workspace-heading"><h3>${t('工作区')}</h3><button class="new-workspace">${interfaceIcon('plus')}</button></div><button class="workspace-item workspace-selector">${interfaceIcon('folder')}<span class="workspace-label">${pick('产品', 'Product')}</span>${interfaceIcon('chevron-down')}</button></div>`;
    if (motionParams.has('capture'))
      renderCapture = createCaptureDemo(stage, shell, template, locale, renderLive);
    if (scene === 'live') {
      shell.querySelector('#live-name').textContent = meeting;
      shell.querySelector('#live-input-label').textContent = motionParams.has('capture')
        ? pick('手机麦克风', 'Phone microphone')
        : pick('麦克风 + 系统音频', 'Microphone + system audio');
      const notesRoot = shell.querySelector('[data-live-notes-root]');
      notesRoot.replaceChildren();
      liveNotesEditor = createNotesEditor(notesRoot);
      notesRoot.querySelector('.notes-editor').contentEditable = 'false';
    } else if (scene === 'summary') {
      const detail = shell.querySelector('#detail-view');
      detail.querySelector('h1').textContent = meeting;
      detail.querySelector('.detail-layout').classList.add('is-summary-mode');
      detail.querySelector('.detail-layout').dataset.detailMode = 'summary';
      detail.querySelector('#detail-meta').innerHTML =
        `<span>2026/10/15</span><span>${interfaceIcon('clock')} ${pick('18 分钟', '18 min')}</span><span>${interfaceIcon('person')} ${pick('2 位参与者', '2 participants')}</span><span>${interfaceIcon('folder')} ${pick('产品', 'Product')}</span>`;
      detail.querySelector('.final-transcript').innerHTML =
        `${renderDetailTabbar()}<div data-detail-panel="summary"></div>`;
      detail.append(detail.querySelector('.detail-actions'));
      detail.querySelector('#player-duration').textContent = '18:24';
    } else {
      shell.querySelector('#home-eyebrow').textContent = pick('产品', 'Product');
      shell.querySelector('#home-slogan').textContent = pick(
        '所有对话，清晰归档。',
        'Every conversation, clearly organized.',
      );
      shell.querySelector('#workspace-edit').hidden = false;
    }
  } else {
    stage.innerHTML = `<section class="motion-phone"><header class="motion-phone-header"><strong>${scene === 'phone-offline' ? pick('客户访谈', 'Customer interview') : pick('设计周会', 'Design weekly')}</strong><span class="motion-phone-meta"></span><i>${interfaceIcon('more')}</i></header><div class="motion-phone-tabs"></div><div class="motion-phone-content"></div><div class="motion-phone-sync"></div><footer class="motion-phone-controls"><button>${interfaceIcon('pause')}</button><button class="phone-bookmark">${interfaceIcon('bookmark')}</button><button class="phone-stop">${interfaceIcon('stop')}</button></footer><div class="motion-phone-toast"></div></section>`;
  }

  const cursor = document.createElement('div');
  cursor.className = 'motion-cursor';
  cursor.hidden = true;
  stage.append(cursor);

  function renderLive(time) {
    const seconds = time / 1000;
    const visible = Math.min(captions.length, Math.floor(seconds / 3) + 1);
    const lines = captions
      .slice(0, visible)
      .map((pair, index) => {
        const progress = (seconds - index * 3) / 1.8;
        return renderTranscriptSegment({
          time: timeText(index * 5),
          speaker: {},
          showSpeaker: false,
          text: reveal(pair[locale === 'en' ? 1 : 0], progress),
          translation: progress >= 1 ? pair[locale === 'en' ? 0 : 1] : '',
        });
      })
      .join('');
    write('#transcript-scroll', lines);
    // 与正式应用一致：建议先等待采纳，再通过编辑器追加普通列表项。
    const events = noteItems.map((text, index) => ({
      text,
      start: 3 + index * 4,
      accept: 5.6 + index * 4,
      type: index === 0 ? 'decision' : 'action',
    }));
    const acceptedEvents = events.filter((event) => seconds >= event.accept);
    if (acceptedEvents.length !== acceptedCount) {
      liveNotesEditor.setMarkdown('');
      acceptedEvents.forEach((event) => liveNotesEditor.appendMarkdown(`- ${event.text}`));
      acceptedCount = acceptedEvents.length;
    }
    const current = events.find((event) => seconds >= event.start && seconds < event.accept);
    const suggestion = stage.querySelector('[data-ai-suggestion]');
    suggestion.hidden = !current;
    stage.querySelector('[data-ai-assist-toggle]').classList.toggle(
      'is-analyzing',
      events.some((event) => seconds >= event.start - 1 && seconds < event.start),
    );
    cursor.hidden = !current || seconds < current.start + 0.6 || focus === 'captions';
    if (current) {
      const phase = seconds - current.start;
      write(
        '[data-ai-suggestion]',
        `<div class="ai-suggestion-card"><div class="ai-suggestion-head"><span class="ai-suggestion-star">${interfaceIcon('ai')}</span><span class="ai-suggestion-type">${t(current.type === 'decision' ? '可能的决策' : '可能的待办')}</span><span class="ai-suggestion-evidence">${t('依据 {count} 段字幕').replace('{count}', '1')}</span></div><p class="ai-suggestion-text">${escapeHtml(current.text)}</p><div class="ai-suggestion-actions"><button class="ai-suggestion-accept${phase > 2.35 ? ' motion-pressed' : ''}" data-ai-accept>${interfaceIcon('plus')} ${t('加入笔记')}</button><button class="ai-suggestion-ignore" data-ai-ignore>${t('忽略')}</button></div></div>`,
      );
      const box = suggestion.querySelector('[data-ai-accept]').getBoundingClientRect();
      const approach = (1 - clamp((phase - 0.6) / 1.5)) ** 4;
      cursor.style.transform = `translate(${box.left + box.width * 0.65 + approach * 55}px,${box.top + box.height * 0.65 - approach * 45}px) scale(${phase > 2.35 ? 0.9 : 1})`;
    }
    stage.querySelector('#timer').textContent = `00:${timeText(12 + seconds)}`;
    const transcript = stage.querySelector('#transcript-scroll');
    const target = transcript.scrollHeight - transcript.clientHeight;
    transcript.scrollTop =
      stage.dataset.running === 'true'
        ? transcript.scrollTop + (target - transcript.scrollTop) * 0.2
        : target;
  }
  function renderSummary(time) {
    const seconds = time / 1000;
    const progress = clamp((seconds - 1) / 13);
    const markdown = `# ${meeting}\n\n${reveal(summaryBlocks.join('\n\n'), progress)}`;
    const html = renderMeetingSummary({ markdown, generating: progress < 1 });
    if (rendered.get('summary') !== html) {
      rendered.set('summary', html);
      stage.querySelector('[data-detail-panel="summary"]').replaceChildren();
      stage.querySelector('.notes').innerHTML = html;
      syncDetailSummaryPanel();
    }
    const copy = stage.querySelector('[data-copy-summary]');
    if (copy && seconds >= 16)
      copy.innerHTML = `${interfaceIcon('check')}${pick('已复制', 'Copied')}`;
    const body = stage.querySelector('.summary-body');
    if (body)
      body.parentElement.scrollTop =
        seconds > 10 && seconds < 16
          ? clamp((seconds - 10) / 5) *
            (body.parentElement.scrollHeight - body.parentElement.clientHeight)
          : 0;
  }
  function renderLibrary(time) {
    const seconds = time / 1000;
    const query =
      seconds >= 3 && seconds < 10 ? reveal(pick('产品', 'Product'), (seconds - 3) / 1.5) : '';
    const search = stage.querySelector('#meeting-search');
    search.value = query;
    const titles = [
      pick('需求评审', 'Requirements review'),
      pick('项目复盘', 'Project retrospective'),
      pick('客户访谈', 'Customer interview'),
      meeting,
    ];
    const matches = titles.filter(
      (title) => !query || title.toLowerCase().includes(query.toLowerCase()),
    );
    const rows = matches
      .map((title, index) =>
        renderMeetingRow(
          {
            id: `motion-${index}`,
            title,
            meta: pick('10月15日 10:34 · 18 分钟', 'Oct 15, 10:34 · 18 min'),
            tags: [],
            status: {
              tone: 'done',
              label: pick('已整理', 'Ready'),
              detail: pick('2 位参与者 · 已生成纪要', '2 participants · Minutes ready'),
            },
            workspace: { name: pick('产品', 'Product') },
          },
          index,
        ),
      )
      .join('');
    write(
      '.meeting-list',
      `<header class="library-group"><h2>${pick('今天', 'Today')}</h2><span>${matches.length}</span></header>${rows}`,
    );
    stage.querySelectorAll('.meeting-row-checkbox').forEach((checkbox) => (checkbox.hidden = true));
    const menu = stage.querySelector('.meeting-row .meeting-menu');
    menu.hidden = !(seconds >= 12 && seconds < 16);
    stage.querySelector('.meeting-row').classList.toggle('motion-selected', seconds >= 11);
    const exportAction = menu.querySelector('[data-meeting-action="export"]');
    exportAction.classList.toggle('motion-pressed', seconds >= 14);
    let toast = stage.querySelector('.motion-export-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'motion-export-toast';
      stage.append(toast);
    }
    toast.textContent = pick('会议记录已导出', 'Meeting exported');
    toast.hidden = seconds < 16;
  }
  function renderPhone(time) {
    const seconds = time / 1000;
    const offline = scene === 'phone-offline';
    const notes = !offline && seconds >= 10 && seconds < 15;
    const elapsedLabel = timeText((offline ? 8 * 60 : 12 * 60) + seconds);
    write(
      '.motion-phone-meta',
      offline
        ? ''
        : `<span class="phone-record-dot"></span>${pick('录音中', 'Recording')} · ${elapsedLabel}`,
    );
    stage.querySelector('.motion-phone-tabs').hidden = offline;
    if (!offline)
      write(
        '.motion-phone-tabs',
        [pick('转写', 'Transcript'), pick('笔记', 'Notes'), pick('重点', 'Highlights')]
          .map(
            (label, index) =>
              `<span class="${index === (notes ? 1 : 0) ? 'active' : ''}">${label}</span>`,
          )
          .join(''),
      );
    if (offline) {
      write(
        '.motion-phone-content',
        `<div class="phone-record-focus"><span class="phone-record-dot"></span><strong>${pick('录音中', 'Recording')}</strong><time>${elapsedLabel}</time></div><div class="phone-local-note">${interfaceIcon('phone')}<div><strong>${pick('仅保存在手机', 'Saved on this phone')}</strong><p>${pick('无需连接电脑。录音保存在本机，连接后由你主动上传。', 'No computer needed. Audio stays on your phone until you choose to upload it.')}</p></div></div>`,
      );
    } else if (notes) {
      write(
        '.motion-phone-content',
        `<div class="phone-notes markdown-content">${renderMarkdown(`## ${pick('本周重点', 'This week')}\n\n- ${noteItems[1]}\n- ${noteItems[2]}\n\n## ${pick('下一步', 'Next steps')}\n\n- [ ] ${noteItems[3]}`)}</div>`,
      );
    } else {
      const count = Math.min(3, Math.floor(seconds / 3) + 1);
      write(
        '.motion-phone-content',
        captions
          .slice(0, count)
          .map(
            (pair, index) =>
              `<article class="phone-caption"><time>${timeText(index * 12)}</time><p>${escapeHtml(reveal(pair[locale === 'en' ? 1 : 0], (seconds - index * 3) / 1.7))}</p></article>`,
          )
          .join(''),
      );
    }
    stage
      .querySelector('.phone-bookmark')
      .classList.toggle('motion-pressed', seconds >= 5 && seconds < 6.5);
    const toast = stage.querySelector('.motion-phone-toast');
    toast.hidden = !(seconds >= 5.2 && seconds < 7.2);
    toast.textContent = pick('已标记重点', 'Highlight saved');
    const sync = stage.querySelector('.motion-phone-sync');
    sync.hidden = offline;
    if (!offline)
      write(
        '.motion-phone-sync',
        `<span>${interfaceIcon('phone')}<b>${pick('录音保存在本机', 'Audio saved locally')}</b><small>${elapsedLabel}</small></span><span>${interfaceIcon('laptop')}<b>${pick('已传到电脑', 'Sent to computer')}</b><small>${elapsedLabel}</small></span>`,
      );
  }
  const paint = collaboration
    ? renderCollaboration
    : scene === 'live'
      ? renderCapture || renderLive
      : scene === 'summary'
        ? renderSummary
        : scene === 'library'
          ? renderLibrary
          : renderPhone;
  function renderAt(time) {
    const phase = ((time % duration) + duration) % duration;
    stage.style.opacity = String(
      0.25 + 0.75 * Math.min(clamp(phase / 450), clamp((duration - phase) / 450)),
    );
    paint(phase);
    stage.dataset.phase = String(Math.floor(phase));
    stage.dataset.cycle = String(Math.floor(time / duration));
  }
  function tick(now) {
    if (previous) elapsed += Math.min(100, now - previous);
    previous = now;
    if (collaboration || now - lastPaint >= 16) {
      renderAt(elapsed);
      lastPaint = now;
    }
    const meter = stage.querySelector('[data-live-mic-level]');
    if (meter) {
      const speech = 0.5 + 0.5 * Math.sin(elapsed / 1100);
      const level =
        0.12 + speech * (0.4 + 0.2 * Math.sin(elapsed / 91) + 0.15 * Math.sin(elapsed / 213));
      meter.style.setProperty('--level', clamp(level));
    }
    frame = requestAnimationFrame(tick);
  }
  function schedule() {
    cancelAnimationFrame(frame);
    previous = 0;
    stage.dataset.running = String(running && !reduced && !document.hidden);
    stage.dataset.reduced = String(reduced);
    if (reduced) {
      renderAt(duration - 2500);
      stage.style.opacity = '1';
    } else if (running && !document.hidden) frame = requestAnimationFrame(tick);
  }
  addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.origin !== location.origin ||
      event.data?.type !== 'brevia-motion-state'
    )
      return;
    running = event.data.running === true;
    reduced = event.data.reduced === true;
    if (Number.isFinite(event.data.seek)) {
      elapsed = Math.max(0, Math.min(duration - 500, event.data.seek));
      renderAt(elapsed);
    }
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', () => {
    reduced = reducedMotion.matches;
    schedule();
  });
  elapsed = 1800;
  renderAt(elapsed);
  await document.fonts.ready;
  window.productMotion = {
    scene,
    duration,
    seek(time) {
      elapsed = time;
      renderAt(time);
    },
    get elapsed() {
      return elapsed;
    },
    get running() {
      return stage.dataset.running === 'true';
    },
  };
  schedule();
  parent.postMessage({ type: 'brevia-motion-ready' }, location.origin);
})().catch((error) => console.error('Brevia motion:', error));
