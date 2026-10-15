// Run with: npx electron scripts/test-website-demos.cjs [--record]
// --record 将官网演示导出到 output/website-demos；README 使用正式应用截图。
const { app, BrowserWindow } = require('electron');
const {
  writeFileSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  cpSync,
  readdirSync,
} = require('node:fs');
const { join, resolve, extname, sep } = require('node:path');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const output = join(root, 'output/website-demos');
const record = process.argv.includes('--record');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const temp = mkdtempSync(join(tmpdir(), 'brevia-demos-'));
app.setPath('userData', join(temp, 'profile'));

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1200,
      height: 750,
      useContentSize: true,
      show: false,
      webPreferences: { backgroundThrottling: false },
    });
    const errors = [];
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message);
    });
    async function load(name, locale) {
      await win.loadFile(
        join(root, 'website', `demo-${name}${locale === 'en' ? '-en' : ''}.html`),
        { query: { manual: '1' } },
      );
      await win.webContents.executeJavaScript('document.fonts.ready');
      const shell = await win.webContents.executeJavaScript(`({
        deviceEntry: document.querySelectorAll('.sidebar #mobile-nav').length,
        deviceLabel: document.querySelector('.mobile-sidebar-heading strong')?.textContent,
        toolbar: ['app-version', 'language-toggle', 'theme-toggle'].every(id => document.getElementById(id)),
      })`);
      assert.equal(shell.deviceEntry, 1, `${locale}/${name}: device entry missing`);
      assert.equal(shell.deviceLabel, locale === 'zh' ? '设备连接' : 'Device connection');
      assert.equal(shell.toolbar, true, `${locale}/${name}: current toolbar missing`);
    }
    async function capture(file) {
      await wait(350);
      writeFileSync(file, (await win.webContents.capturePage()).resize({ width: 1200 }).toPNG());
    }
    const server = createServer((request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      const deployed = path.startsWith('/__deployed__/');
      const base = deployed ? join(temp, 'site') : root;
      const file = resolve(
        base,
        '.' + decodeURIComponent(deployed ? path.slice('/__deployed__'.length) : path),
      );
      if (!file.startsWith(base + sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        const data = readFileSync(file);
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
        };
        response
          .writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
          .end(data);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const siteURL = `http://127.0.0.1:${server.address().port}`;
    const waitForMotion = async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await win.webContents.executeJavaScript('!!window.productMotion')) return;
        await wait(50);
      }
      throw Error('Motion did not initialize');
    };
    const loadHome = async (language, directory = 'website', hash = '') => {
      await win.webContents.executeJavaScript(
        `sessionStorage.setItem('lang-selected', '${language}')`,
      );
      await win.loadURL(`${siteURL}/${directory}/index-${language}.html${hash ? '#' + hash : ''}`);
    };
    try {
      for (const locale of ['zh', 'en']) {
        const tour = join(output, 'tour', locale);
        if (record) {
          mkdirSync(tour, { recursive: true });
          mkdirSync(join(output, 'demo'), { recursive: true });
        }
        await load('home', locale);
        if (record) await capture(join(output, `home-${locale === 'zh' ? 'cn' : 'en'}.png`));
        for (const name of [
          'transcription',
          'summary',
          'voiceprint',
          'caption-bar',
          'model-library',
        ]) {
          await load(name, locale);
          const result = await win.webContents.executeJavaScript(`(async () => {
          const { engine, timeline } = window.demoDebug;
          timeline.setLoop(false);
          engine.wait = () => Promise.resolve();
          engine.moveCursor = async target => {
            const element = document.querySelector(target);
            if (!element || !element.getClientRects().length) throw new Error('Invisible target: ' + target);
            const r = element.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0 || r.top >= innerHeight || r.bottom <= 0)
              throw new Error('Clipped target: ' + target);
          };
          engine.click = engine.hover = async () => {};
          engine.scrollToBottom = async element => { element.scrollTop = element.scrollHeight; };
          for (let loop = 0; loop < 2; loop++) {
            if (loop) timeline.onRestart();
            for (const step of timeline.steps) {
              await timeline.executeStep(step);
              if (step.action === 'setState') await new Promise(r => setTimeout(r, 220));
              if (document.querySelector('#detail-view')) {
                const layout = document.querySelector('.detail-layout').getBoundingClientRect();
                const notes = document.querySelector('.notes').getBoundingClientRect();
                const player = document.querySelector('.player').getBoundingClientRect();
                if (layout.height < 200 || notes.height < 200 || layout.bottom > player.top + 1 || player.bottom > innerHeight)
                  throw new Error('Meeting notes or player clipped');
              }
            }
          }
          const control = document.querySelector('.live-control-bar');
          if (document.querySelector('#live-view') && (!control || control.getBoundingClientRect().bottom > innerHeight))
            throw new Error('Live controls missing or clipped');
          return { shell: document.querySelectorAll('.app-shell').length,
            segments: document.querySelectorAll('.segment').length,
            modal: !!document.querySelector('.summary-modal-overlay'),
            copied: document.querySelector('[data-copy-summary]')?.textContent,
            expanded: !!document.querySelector('.detail-layout.is-summary-mode') };
        })()`);
          assert.equal(result.shell, 1, `${locale}/${name}: shell`);
          if (name === 'summary') {
            assert.equal(result.modal, false);
            assert.equal(result.expanded, true);
            assert.equal(result.copied, '✓');
            // Capture the readable first state, before scrolling to the bottom.
            await win.webContents.executeJavaScript(
              "document.querySelector('.summary-preview').scrollTop = 0",
            );
          }
          if (name === 'transcription') assert.equal(result.segments, 6);
          if (name === 'voiceprint') {
            assert.equal(result.segments, 4);
            assert.equal(
              await win.webContents.executeJavaScript(
                "!!document.querySelector('#detail-view') && !document.querySelector('#live-view')",
              ),
              true,
            );
            assert.equal(
              await win.webContents.executeJavaScript(
                "document.querySelectorAll('.speaker-name:not(.provisional)').length",
              ),
              4,
            );
          }
          if (['transcription', 'caption-bar'].includes(name))
            assert.equal(
              await win.webContents.executeJavaScript(
                "document.querySelectorAll('.segment-meta b, .segment-speaker').length",
              ),
              0,
            );
          if (record) {
            const files = {
              transcription: '实时会议和翻译.png',
              summary: '多语言支持与会议纪要.png',
              voiceprint: '注册声纹识别.png',
              'model-library': '模型库.png',
            };
            if (name === 'model-library')
              await win.webContents.executeJavaScript(
                "document.querySelector('.modal-body').scrollTop = 0",
              );
            if (files[name]) await capture(join(tour, files[name]));
          }
          console.log(`PASS ${locale}/${name} (two cycles)`);
        }
        await load('ai-assist', locale);
        assert.equal(
          await win.webContents.executeJavaScript(
            "document.querySelectorAll('.live-control-bar').length",
          ),
          1,
        );
        assert.equal(
          await win.webContents.executeJavaScript(
            "document.querySelectorAll('.live-header .end-button, .segment-speaker').length",
          ),
          0,
        );
        if (record) {
          const frames = join(temp, locale);
          mkdirSync(frames);
          // Real-time capture: preserve the cursor, typing, and acceptance timings.
          const started = Date.now();
          for (let frame = 0; frame < 160; frame++) {
            await wait(Math.max(0, started + frame * 125 - Date.now()));
            writeFileSync(
              join(frames, `${String(frame).padStart(4, '0')}.png`),
              (await win.webContents.capturePage()).resize({ width: 1200 }).toPNG(),
            );
            if (frame === 84)
              writeFileSync(
                join(tour, locale === 'zh' ? 'AI辅助笔记.png' : 'AI Assist Notes.png'),
                (await win.webContents.capturePage()).resize({ width: 1200 }).toPNG(),
              );
          }
          const encoded = spawnSync(
            'ffmpeg',
            [
              '-y',
              '-loglevel',
              'error',
              '-framerate',
              '8',
              '-i',
              join(frames, '%04d.png'),
              '-filter_complex',
              '[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
              '-loop',
              '0',
              join(output, 'demo', `ai-assist-${locale}.gif`),
            ],
            { encoding: 'utf8' },
          );
          assert.equal(encoded.status, 0, encoded.stderr);
        }
        if (!record) await wait(1800);
        assert.ok(
          await win.webContents.executeJavaScript(
            "document.querySelectorAll('.segment').length > 0",
          ),
        );
        assert.equal(
          await win.webContents.executeJavaScript(
            "document.querySelectorAll('.segment-speaker').length",
          ),
          0,
        );
        console.log(`PASS ${locale}/ai-assist`);
      }
      for (const locale of ['zh', 'en']) {
        await win.loadFile(join(root, `website/demo-mobile${locale === 'en' ? '-en' : ''}.html`));
        const mobile = await win.webContents.executeJavaScript(`(() => {
          document.querySelector('#pause-story').click();
          const result = [];
          for (let cycle = 0; cycle < 2; cycle++) {
            for (let stage = 0; stage < 5; stage++) {
              mobileDemo.render(stage);
              result.push({
                stage: document.querySelector('.mobile-story').dataset.stage,
                desktop: document.querySelectorAll('.mobile-demo-caption.visible').length,
                phone: document.querySelector('.phone-transcript p').textContent,
              });
            }
          }
          return result;
        })()`);
        mobile.forEach((state, i) => {
          const stage = i % 5;
          assert.equal(state.stage, String(stage));
          assert.equal(state.desktop, stage >= 3 ? 1 : 0);
          assert.equal(Boolean(state.phone), stage === 4);
        });
        console.log(`PASS ${locale}/mobile (two cycles)`);
      }
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await win.loadFile(join(root, 'website/demo-summary.html'));
      await wait(1200);
      assert.equal(
        await win.webContents.executeJavaScript('demoDebug.timeline.loopEnabled'),
        false,
      );
      assert.equal(await win.webContents.executeJavaScript('demoDebug.timeline.isRunning'), false);
      assert.equal(
        await win.webContents.executeJavaScript(
          "!!document.querySelector('.detail-layout.is-summary-mode')",
        ),
        true,
      );
      console.log('PASS reduced motion');
      win.webContents.debugger.detach();
      for (const locale of ['zh', 'en']) {
        for (const scene of ['live', 'summary', 'library', 'phone-live', 'phone-offline']) {
          const phone = scene.startsWith('phone-');
          win.setContentSize(phone ? 390 : 1280, phone ? 844 : 800);
          await win.loadURL(
            `${siteURL}/website/product-motion.html?scene=${scene}&lang=${locale}&manual=1`,
          );
          await waitForMotion();
          const states = [];
          for (const time of [2000, 8000, 17000]) {
            states.push(
              await win.webContents.executeJavaScript(`(() => {
              productMotion.seek(${time});
              return { text: document.querySelector('#motion-stage').innerText,
                overflow: document.documentElement.scrollWidth > innerWidth,
                visible: !document.querySelector('.view') || getComputedStyle(document.querySelector('.view')).opacity === '1',
                segments: document.querySelectorAll('.segment').length,
                notes: document.querySelectorAll('.notes-editor li').length,
                rows: document.querySelectorAll('.meeting-row').length,
                search: document.querySelector('#meeting-search')?.value,
                summary: document.querySelector('.summary-body')?.innerText,
                summaryWide: !document.querySelector('.detail-layout') || document.querySelector('.final-transcript').getBoundingClientRect().width >= document.querySelector('.detail-layout').getBoundingClientRect().width - 1,
              };
            })()`),
            );
          }
          states.forEach((state) => {
            assert.equal(state.overflow, false);
            assert.equal(state.visible, true);
            assert.equal(
              state.summaryWide,
              true,
              `${locale}/${scene}: summary must use the full reading area`,
            );
          });
          assert.notEqual(
            states[0].text,
            states[1].text,
            `${locale}/${scene}: no functional motion`,
          );
          if (scene === 'live') {
            assert.equal(states[2].segments, 5);
            assert.equal(states[2].notes, 3);
          }
          if (scene === 'summary') {
            assert.ok(states[2].summary.length > states[0].summary.length);
            assert.ok(states[2].summary.includes(locale === 'zh' ? '行动项' : 'Action items'));
          }
          if (scene === 'library') {
            assert.equal(states[1].rows, 1);
            assert.equal(states[2].rows, 4);
            assert.equal(states[1].search, locale === 'zh' ? '产品' : 'Product');
          }
          const repeated = await win.webContents.executeJavaScript(
            `(() => { productMotion.seek(productMotion.duration + 2000); return document.querySelector('#motion-stage').innerText; })()`,
          );
          assert.equal(
            repeated,
            states[0].text,
            `${locale}/${scene}: loop must reset without accumulating content`,
          );
          console.log(`PASS motion ${locale}/${scene} (progress and loop)`);
        }
      }
      const captures = join(root, 'output/playwright/affine-implementation');
      mkdirSync(captures, { recursive: true });
      async function waitForPlayer(selector) {
        for (let attempt = 0; attempt < 120; attempt++) {
          if (
            await win.webContents.executeJavaScript(
              `!!document.querySelector('${selector} iframe')?.contentWindow.productMotion`,
            )
          )
            return;
          await wait(30);
        }
        throw Error(`Player did not load: ${selector}`);
      }
      for (const locale of ['zh', 'en']) {
        for (const width of [320, 390, 768, 1024, 1440]) {
          win.setContentSize(width, 900);
          await loadHome(locale);
          await win.webContents.executeJavaScript(`(async () => {
            document.querySelectorAll('img').forEach(image => image.loading = 'eager');
            await Promise.all([...document.images].map(image => image.decode()));
            await document.fonts.ready;
          })()`);
          const page = await win.webContents.executeJavaScript(`({
            overflow: document.documentElement.scrollWidth > innerWidth,
            headerFits: [...document.querySelectorAll('.header-inner > *, .header-actions > *')].filter(element => element.getClientRects().length).every(element => {const rect = element.getBoundingClientRect();return rect.left >= 0 && rect.right <= innerWidth;}),
            headings: document.querySelectorAll('h1').length,
            motions: document.querySelectorAll('[data-motion-scene]').length,
            staticApplicationImages: document.querySelectorAll('img[src*="/screenshots/"]:not(.motion-poster)').length,
            missingAnchors: [...document.querySelectorAll('a[href^="#"]')].filter(link => !document.getElementById(link.hash.slice(1))).map(link => link.hash),
            downloads: [...document.querySelectorAll('.platform-row a')].map(link => link.href),
            sticky: getComputedStyle(document.querySelector('.site-header')).position,
            featureSections: [...document.querySelectorAll('[data-story-panel]')].every(panel => panel.getBoundingClientRect().height > 0 && !panel.hasAttribute('aria-hidden')),
            softwareBrands: document.querySelectorAll('.software-group:not([aria-hidden]) .software-brand').length,
            icons: [...document.querySelectorAll('use')].every(use => use.getAttribute('href').startsWith('./icons.svg#')),
            mobileFirst: getComputedStyle(document.querySelector('#mobile-download')).order,
          })`);
          assert.equal(page.overflow, false, `${locale}/${width}: horizontal overflow`);
          assert.equal(page.headerFits, true, `${locale}/${width}: header clipped`);
          assert.equal(page.headings, 1);
          assert.equal(page.motions, 7);
          assert.equal(page.staticApplicationImages, 0);
          assert.equal(page.featureSections, true);
          assert.equal(page.softwareBrands, 8);
          assert.equal(page.icons, true);
          assert.deepEqual(page.missingAnchors, []);
          assert.ok(page.downloads.some((url) => url.endsWith('.dmg')));
          assert.ok(page.downloads.some((url) => url.endsWith('-setup.exe')));
          assert.ok(page.downloads.includes('https://apps.apple.com/app/id6819869442'));
          assert.ok(page.downloads.some((url) => url.endsWith('/android/Brevia-android.apk')));
          assert.equal(page.sticky, 'sticky');
          if (width < 640) assert.equal(page.mobileFirst, '-1');
          await waitForPlayer('.hero-visual');
          const beforeMotion = await win.webContents.executeJavaScript(
            "document.querySelector('.hero-visual iframe').contentWindow.productMotion.elapsed",
          );
          await wait(160);
          assert.ok(
            (await win.webContents.executeJavaScript(
              "document.querySelector('.hero-visual iframe').contentWindow.productMotion.elapsed",
            )) > beforeMotion,
            'Visible hero should play',
          );
          assert.equal(
            await win.webContents.executeJavaScript(
              "document.querySelectorAll('.demo-controls,.software-footer,.scene-hint,[data-motion-toggle],[data-motion-replay],[data-software-toggle]').length",
            ),
            0,
            'Demo labels and controls must be removed',
          );
          assert.equal(
            await win.webContents.executeJavaScript(
              '/示例会议|真实组件演示|暂停滚动|Sample meeting|Real interface|Pause scrolling|System-audio permission required/.test(document.body.innerText)',
            ),
            false,
            'Demo meta copy must be removed in both languages',
          );
          if ([390, 1440].includes(width)) {
            writeFileSync(
              join(captures, `${locale}-${width}-hero.png`),
              (await win.webContents.capturePage()).resize({ width }).toPNG(),
            );
          }
          await win.webContents.executeJavaScript(
            "document.querySelector('[data-story]').scrollIntoView({behavior:'instant'})",
          );
          for (const target of ['transcription', 'notes', 'minutes']) {
            await win.webContents.executeJavaScript(
              `document.querySelector('#${target}').scrollIntoView({behavior:'instant',block:'center'})`,
            );
            await wait(450);
            await waitForPlayer(`#${target}`);
            const state = await win.webContents.executeJavaScript(`(() => {
              const panel = document.querySelector('#${target}');const demo = panel.querySelector('[data-motion-scene]');
              const frame = demo.querySelector('iframe');const bounds=frame.getBoundingClientRect();
              return {visible:getComputedStyle(panel).visibility, running:frame.contentWindow.productMotion.running, noCrop:bounds.width <= demo.clientWidth + 1 && bounds.height <= demo.clientHeight + 1,
                focus: frame.contentDocument.body.dataset.focus, text:frame.contentDocument.querySelector('#motion-stage').innerText};
            })()`);
            assert.equal(
              state.visible,
              'visible',
              `${locale}/${width}/${target}: visible product section`,
            );
            assert.equal(state.running, true);
            assert.equal(state.noCrop, true);
            assert.ok(state.text.includes(locale === 'zh' ? '产品周会' : 'Product sync'));
            if (target === 'notes') {
              const effect = await win.webContents.executeJavaScript(
                `(() => {const frame=document.querySelector('#notes iframe');frame.contentWindow.productMotion.seek(8100);const d=frame.contentDocument;return {cursor:!d.querySelector('.motion-cursor').hidden,suggestion:d.querySelector('.ai-suggestion-text').textContent};})()`,
              );
              assert.equal(effect.cursor, true);
              assert.ok(effect.suggestion.includes(locale === 'zh' ? '周四' : 'Thursday'));
            }
            if ([390, 1440].includes(width))
              writeFileSync(
                join(captures, `${locale}-${width}-${target}.png`),
                (await win.webContents.capturePage()).resize({ width }).toPNG(),
              );
          }
          await win.webContents.executeJavaScript(
            "document.querySelector('.software-section').scrollIntoView({behavior:'instant',block:'center'})",
          );
          await wait(100);
          assert.equal(
            await win.webContents.executeJavaScript(
              "getComputedStyle(document.querySelector('.software-group')).animationPlayState",
            ),
            'running',
          );
          await win.webContents.executeJavaScript(
            "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
          );
          await wait(60);
          const wallPaused = await win.webContents.executeJavaScript(
            "getComputedStyle(document.querySelector('.software-group')).transform",
          );
          await wait(120);
          assert.equal(
            await win.webContents.executeJavaScript(
              "getComputedStyle(document.querySelector('.software-group')).transform",
            ),
            wallPaused,
            'Background software wall must stop motion',
          );
          await win.webContents.executeJavaScript(
            "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
          );
          await wait(100);
          assert.notEqual(
            await win.webContents.executeJavaScript(
              "getComputedStyle(document.querySelector('.software-group')).transform",
            ),
            wallPaused,
            'Visible software wall must resume motion',
          );
          for (const target of ['mobile', 'library', 'privacy', 'download']) {
            await win.webContents.executeJavaScript(
              `document.querySelector('#${target}').scrollIntoView({behavior:'instant'})`,
            );
            await wait(200);
            if ([390, 1440].includes(width))
              writeFileSync(
                join(captures, `${locale}-${width}-${target}.png`),
                (await win.webContents.capturePage()).resize({ width }).toPNG(),
              );
          }
          const pausedAt = await win.webContents.executeJavaScript(
            "document.querySelector('.hero-visual iframe').contentWindow.productMotion.elapsed",
          );
          await wait(100);
          assert.equal(
            await win.webContents.executeJavaScript(
              "document.querySelector('.hero-visual iframe').contentWindow.productMotion.elapsed",
            ),
            pausedAt,
            'Offscreen motion should pause',
          );
          if (width < 1000) {
            await win.webContents.executeJavaScript(
              "document.querySelector('.mobile-menu summary').click()",
            );
            assert.equal(
              await win.webContents.executeJavaScript(
                "document.querySelector('.mobile-menu').open",
              ),
              true,
            );
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
            await wait(30);
            assert.equal(
              await win.webContents.executeJavaScript(
                "document.querySelector('.mobile-menu').open",
              ),
              false,
            );
          }
          await win.webContents.executeJavaScript(
            "document.querySelector('.language-picker summary').click()",
          );
          assert.equal(
            await win.webContents.executeJavaScript(
              "document.querySelector('.language-picker').open",
            ),
            true,
          );
          await win.webContents.executeJavaScript("document.querySelector('h1').click()");
          assert.equal(
            await win.webContents.executeJavaScript(
              "document.querySelector('.language-picker').open",
            ),
            false,
          );
          await win.webContents.executeJavaScript(
            "document.querySelectorAll('.faq-item summary')[1].click()",
          );
          assert.equal(
            await win.webContents.executeJavaScript(
              "document.querySelectorAll('.faq-item')[1].open",
            ),
            true,
          );
          console.log(`PASS homepage ${locale}/${width}: autoplay, sections, layout, downloads`);
        }
      }
      // 自动演示到达结果后停止，离屏与后台仍暂停。
      win.setContentSize(1440, 900);
      await loadHome('zh');
      await waitForPlayer('.hero-visual');
      await win.webContents.executeJavaScript(
        "const player=document.querySelector('.hero-visual iframe').contentWindow.productMotion;player.seek(player.duration-600)",
      );
      await wait(300);
      assert.equal(
        await win.webContents.executeJavaScript(
          "document.querySelector('.hero-visual iframe').contentWindow.productMotion.running",
        ),
        false,
      );
      await loadHome('zh');
      await waitForPlayer('.hero-visual');
      await wait(80);
      assert.equal(
        await win.webContents.executeJavaScript(
          "document.querySelector('.hero-visual iframe').contentWindow.productMotion.running",
        ),
        true,
      );
      await win.webContents.executeJavaScript(
        "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
      );
      await wait(80);
      assert.equal(
        await win.webContents.executeJavaScript(
          "document.querySelector('.hero-visual iframe').contentWindow.productMotion.running",
        ),
        false,
      );
      await win.webContents.executeJavaScript(
        "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
      );
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await wait(200);
      const reduced = await win.webContents.executeJavaScript(
        `({playing:[...document.querySelectorAll('.motion-demo iframe')].some(frame=>frame.contentWindow.productMotion?.running),scroll:getComputedStyle(document.documentElement).scrollBehavior,hero:getComputedStyle(document.querySelector('.hero-window')).transform,software:getComputedStyle(document.querySelector('.software-group')).animationName,stage:getComputedStyle(document.querySelector('.scene-visual .motion-demo')).transform})`,
      );
      assert.equal(reduced.playing, false);
      assert.equal(reduced.scroll, 'auto');
      assert.equal(reduced.hero, 'none');
      assert.equal(reduced.software, 'none');
      assert.equal(reduced.stage, 'none');
      win.webContents.debugger.detach();
      console.log('PASS result hold, background pause, and reduced motion');

      const noScript = new BrowserWindow({
        show: false,
        width: 1440,
        height: 900,
        webPreferences: { javascript: false },
      });
      try {
        await noScript.loadFile(join(root, 'website/index-zh.html'));
        // 调试协议读取 DOM，不在页面执行脚本。
        noScript.webContents.debugger.attach('1.3');
        const { root: dom } = await noScript.webContents.debugger.sendCommand('DOM.getDocument');
        const { nodeId } = await noScript.webContents.debugger.sendCommand('DOM.querySelector', {
          nodeId: dom.nodeId,
          selector: '.story-panel',
        });
        const { model } = await noScript.webContents.debugger.sendCommand('DOM.getBoxModel', {
          nodeId,
        });
        assert.ok(model.width > 0 && model.height > 0);
      } finally {
        noScript.destroy();
      }
      console.log('PASS homepage without JavaScript');

      // 与 Pages 工作流使用相同的目录布局和路径替换。
      const deployed = join(temp, 'site');
      cpSync(join(root, 'website'), deployed, { recursive: true });
      cpSync(join(root, 'docs/assets'), join(deployed, 'docs/assets'), { recursive: true });
      cpSync(join(root, 'frontend'), join(deployed, 'frontend'), { recursive: true });
      for (const name of readdirSync(deployed).filter((name) => name.endsWith('.html'))) {
        const file = join(deployed, name);
        writeFileSync(
          file,
          readFileSync(file, 'utf8')
            .replaceAll('../docs/assets/', './docs/assets/')
            .replaceAll('../frontend/', './frontend/'),
        );
      }
      for (const locale of ['zh', 'en']) {
        await loadHome(locale, '__deployed__');
        const resources = await win.webContents.executeJavaScript(`(async () => {
          document.querySelectorAll('img').forEach(image => image.loading = 'eager');
          await Promise.all([...document.images].map(image => image.decode()));
          return [...document.querySelectorAll('[src], link[rel="stylesheet"]')].map(element => element.src || element.href);
        })()`);
        for (const url of resources)
          assert.ok((await fetch(url)).ok, `Missing deployed resource ${url}`);
        await wait(400);
        assert.equal(
          await win.webContents.executeJavaScript(
            "document.querySelector('.hero-visual .motion-demo').classList.contains('is-ready')",
          ),
          true,
        );
      }
      // 发布脚本相对仓库根目录读取 website/，只在临时副本验证。
      cpSync(join(root, 'website'), join(temp, 'website'), { recursive: true });
      const release = spawnSync(
        process.execPath,
        [join(root, 'scripts/update-release-links.mjs')],
        {
          cwd: temp,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VERSION: 'v9.8.7' },
          encoding: 'utf8',
        },
      );
      assert.equal(release.status, 0, release.stderr);
      for (const locale of ['zh', 'en']) {
        const html = readFileSync(join(temp, `website/index-${locale}.html`), 'utf8');
        assert.ok(html.includes('Brevia-9.8.7-arm64.dmg'));
        assert.ok(html.includes('Brevia-9.8.7-x64-setup.exe'));
        assert.ok(html.includes('>v9.8.7<'));
      }
      // 跨语言跳转保留章节，入口页沿用语言选择；存储被禁用时也能进入主页。
      await loadHome('zh', '__deployed__', 'privacy');
      await Promise.all([
        new Promise((resolve) => win.webContents.once('did-finish-load', resolve)),
        win.webContents.executeJavaScript(
          'document.querySelector(\'.language-picker [data-language="en"]\').click()',
        ),
      ]);
      assert.ok(win.webContents.getURL().endsWith('index-en.html#privacy'));
      // 入口页主动跳转会取消 Electron 的初始加载，这是正常导航。
      await win
        .loadURL(`${siteURL}/__deployed__/index.html#notes`)
        .catch((error) => assert.equal(error.code, 'ERR_ABORTED'));
      await wait(200);
      assert.ok(win.webContents.getURL().endsWith('index-en.html#notes'));
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Page.enable');
      for (const [languages, expected, entry] of [
        [['zh-HK', 'en-US'], 'zh', 'index-en.html'],
        [['fr-FR', 'en-GB'], 'en', 'index-zh.html'],
        [['fr-FR', 'zh-CN'], 'zh', 'index-en.html'],
        [['es-ES'], 'en', 'index-zh.html'],
      ]) {
        const { identifier: languageScript } = await win.webContents.debugger.sendCommand(
          'Page.addScriptToEvaluateOnNewDocument',
          {
            source: `sessionStorage.removeItem('lang-selected'); Object.defineProperty(navigator, 'languages', {get: () => ${JSON.stringify(languages)}});`,
          },
        );
        await win
          .loadURL(`${siteURL}/__deployed__/${entry}?browser=${languages[0]}-${expected}#mobile`)
          .catch((error) => assert.equal(error.code, 'ERR_ABORTED'));
        await wait(200);
        assert.ok(
          win.webContents
            .getURL()
            .endsWith(`index-${expected}.html?browser=${languages[0]}-${expected}#mobile`),
        );
        await win.webContents.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: languageScript,
        });
      }
      console.log('PASS browser language matching and unsupported-language fallback');
      const { identifier } = await win.webContents.debugger.sendCommand(
        'Page.addScriptToEvaluateOnNewDocument',
        {
          source:
            "Object.defineProperty(window, 'sessionStorage', {get() { throw new DOMException('Blocked', 'SecurityError'); }});",
        },
      );
      await win
        .loadURL(`${siteURL}/__deployed__/index.html#mobile`)
        .catch((error) => assert.equal(error.code, 'ERR_ABORTED'));
      await wait(200);
      assert.ok(/index-(en|zh)\.html#mobile$/.test(win.webContents.getURL()));
      await win.webContents.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
        identifier,
      });
      win.webContents.debugger.detach();
      console.log('PASS language navigation, saved preference, and blocked storage');
      console.log('PASS deployed assets and release-link updates');
      assert.deepEqual(errors, []);
    } finally {
      win.destroy();
      server.close();
      app.quit();
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
app.on('quit', () => rmSync(temp, { recursive: true, force: true }));
