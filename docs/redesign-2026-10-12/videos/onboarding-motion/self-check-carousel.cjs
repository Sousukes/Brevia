const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core');
const sharp = require(process.env.SHARP_MODULE || 'sharp');

async function main() {
  const browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) =>
      assert.ok(!/^https?:/.test(request.url()), 'preview must remain local'),
    );
    const proof = [];
    const samples = Object.fromEntries(
      ['language', 'permissions', 'setup', 'ai', 'phone'].map((kind) => [
        kind,
        [0, 1.1, 2.35, 2.65, 2.85, 3.15, 3.45, 3.5, 5.35, 5.48, 5.65, 5.85, 6.18, 6.5, 8.5, 9],
      ]),
    );
    const artifacts = path.join(__dirname, '.hyperframes/artifacts/smooth-transitions');
    fs.mkdirSync(artifacts, { recursive: true });
    for (const [kind, times] of Object.entries(samples)) {
      const reference = await sharp(path.join(__dirname, 'assets', kind + '-original.png'))
        .ensureAlpha()
        .raw()
        .toBuffer();
      let maxRight = 0,
        maxTop = 0,
        count = 0;
      for (const locale of ['zh', 'en', 'es', 'ja', 'ko', 'fr', 'de', 'ru']) {
        await page.goto(
          pathToFileURL(path.join(__dirname, kind + '-left.html')).href + '?lang=' + locale,
        );
        await page.waitForFunction(() => !!window.LEFT_TIMELINE);
        assert.equal(await page.evaluate(() => window.LEFT_TIMELINE.paused()), true);
        assert.equal(
          await page.evaluate(() =>
            window.LEFT_TIMELINE.getChildren().every((t) =>
              t
                .targets()
                .every(
                  (x) =>
                    !(x instanceof Element) || document.getElementById('left-overlay').contains(x),
                ),
            ),
          ),
          true,
        );
        for (const time of times) {
          await page.evaluate((t) => {
            window.LEFT_TIMELINE.pause().seek(t);
          }, time);
          const png = await page.screenshot();
          const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
          let right = 0,
            top = 0;
          for (let y = 0; y < 800; y++)
            for (let x = 0; x < 1280; x++) {
              if (y >= 40 && x < ({ ai: 447, phone: 473 }[kind] || 527)) continue;
              const i = (y * 1280 + x) * 4;
              if (
                pixels[i] !== reference[i] ||
                pixels[i + 1] !== reference[i + 1] ||
                pixels[i + 2] !== reference[i + 2] ||
                pixels[i + 3] !== reference[i + 3]
              ) {
                if (y < 40) top++;
                if (x >= ({ ai: 447, phone: 473 }[kind] || 527)) right++;
              }
            }
          maxRight = Math.max(maxRight, right);
          maxTop = Math.max(maxTop, top);
          count++;
          if (locale === 'zh' && [0, 2.85, 3.15, 3.5, 5.65, 5.85, 6.5].includes(time))
            fs.writeFileSync(path.join(artifacts, kind + '-' + time + '.png'), png);
        }
        assert.equal(await page.$('.bom-controls,[data-motion-control]'), null);
        assert.equal(await page.evaluate(() => window.LEFT_TIMELINE.duration()), 9);
        assert.equal(
          await page.$eval('[data-motion="caption-record"] h3', (el) => el.textContent),
          await page.evaluate(
            (locale) => window.BreviaLocaleData.onboardingMotionCopy[locale].recordHeading,
            locale,
          ),
        );
        await page.evaluate(() => {
          window.LEFT_TIMELINE.seek(3.5);
        });
        assert.equal(await page.$eval('.bom-paper', (el) => el.dataset.phase), 'transcript');
        await page.evaluate(() => {
          window.LEFT_TIMELINE.seek(6.5);
        });
        assert.equal(await page.$eval('.bom-paper', (el) => el.dataset.phase), 'minutes');
        assert.equal(
          await page.evaluate(() => {
            const a = document.querySelector('[data-motion="actions"]').getBoundingClientRect();
            const p = document.querySelector('.bom-paper').getBoundingClientRect();
            return a.bottom <= p.bottom - 8;
          }),
          true,
          kind + '/' + locale + ' summary fits',
        );
        await page.evaluate(() => {
          window.LEFT_TIMELINE.seek(0);
        });
      }
      assert.equal(maxRight, 0, kind + ' right pixels');
      assert.equal(maxTop, 0, kind + ' top pixels');
      proof.push({
        kind,
        locales: 8,
        sampleCount: count,
        maxChangedRightPixels: maxRight,
        maxChangedTopPixels: maxTop,
      });
      const verify = path.join(__dirname, '.hyperframes', 'verify-' + kind);
      fs.mkdirSync(verify, { recursive: true });
      fs.copyFileSync(path.join(__dirname, kind + '-left.html'), path.join(verify, 'index.html'));
      for (const file of [
        'assets',
        'application-preview.js',
        'application-preview.css',
        'left-stories.js',
      ]) {
        const destination = path.join(verify, file);
        if (!fs.existsSync(destination)) fs.symlinkSync(path.join(__dirname, file), destination);
      }
      const assertions = [{ kind: 'staysInFrame', selector: '#left-overlay' }];
      assertions.push(
        { kind: 'appearsBy', selector: '[data-motion="transcript-one"]', bySec: 3.5 },
        { kind: 'appearsBy', selector: '[data-motion="points"]', bySec: 6.5 },
        { kind: 'staysInFrame', selector: '.bom-paper' },
      );
      fs.writeFileSync(
        path.join(verify, 'index.motion.json'),
        JSON.stringify({ duration: 9, assertions }, null, 2),
      );
      fs.writeFileSync(
        path.join(verify, 'hyperframes.json'),
        JSON.stringify({ width: 1280, height: 800, fps: 30, duration: 9 }, null, 2),
      );
    }
    assert.deepEqual(errors, []);
    // 关闭动态效果时无需暴露新的页内播放控件。
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(pathToFileURL(path.join(__dirname, 'language-left.html')).href);
    await page.waitForFunction(() => !!window.LEFT_TIMELINE);
    assert.equal(await page.evaluate(() => window.LEFT_TIMELINE.paused()), true);
    assert.equal(await page.$('.bom-controls,[data-motion-control]'), null);
    await page.emulateMediaFeatures([]);
    await page.goto(pathToFileURL(path.join(__dirname, 'preview.html')).href);
    await page.waitForFunction(() => !document.querySelector('#toggle').disabled);
    assert.equal(
      await page.$eval('[data-preview="language"]', (x) => x.getAttribute('aria-pressed')),
      'true',
    );
    for (const kind of ['permissions', 'setup', 'ai', 'phone']) {
      await page.click('[data-preview="' + kind + '"]');
      await page.waitForFunction(() => !document.querySelector('#toggle').disabled);
      assert.equal(
        await page.$eval('#composition', (x) => x.getAttribute('src').split('?')[0]),
        kind + '-left.html',
      );
    }
    fs.writeFileSync(
      path.join(__dirname, '.hyperframes/smooth-pixel-proof.json'),
      JSON.stringify(proof, null, 2),
    );
    console.log(
      `PASS: ${proof.length} previews; 8 locales; ${proof.reduce((sum, item) => sum + item.sampleCount, 0)} sampled frames; zero right/top pixel changes; record/transcript/minutes phases and fitting text; no in-page controls; finite seek and 5-step player.`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
