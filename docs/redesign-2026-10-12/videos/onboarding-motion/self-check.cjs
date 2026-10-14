const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core');

async function main() {
  const browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const remoteRequests = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
    });
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    assert.equal(
      await page.evaluate(() => Boolean(window.__timelines?.['brevia-onboarding'])),
      true,
    );
    const result = await page.evaluate(() => {
      const timeline = window.__timelines['brevia-onboarding'];
      const opacity = (selector) =>
        Number(getComputedStyle(document.querySelector(selector)).opacity);
      const capture = (time) => {
        timeline.pause().seek(time);
        return {
          time: timeline.time(),
          curve: document.querySelector('#curve-one').getAttribute('d'),
          line: opacity('#line-one'),
          points: opacity('#points'),
          actions: opacity('#actions'),
          record: opacity('#record-indicator'),
          pagination: ['#active-record', '#active-text', '#active-minutes'].map(opacity),
          header: document.querySelector('#record-title').textContent,
          textTitle: opacity('#caption-text'),
          minutesTitle: opacity('#caption-minutes'),
          overflow: document.documentElement.scrollWidth > 1280,
        };
      };
      const frames = [0, 1, 2.6, 3.6, 5.6, 6.6, 8.4, 9].map(capture);
      const backward = capture(3.6);
      const restart = capture(0);
      return {
        paused: timeline.paused(),
        duration: timeline.duration(),
        frames,
        backward,
        restart,
      };
    });
    assert.equal(result.duration, 9);
    assert.equal(result.paused, true);
    assert.equal(result.frames[0].record, 1);
    assert.equal(result.frames[0].line, 0);
    assert.equal(result.frames[3].line, 1);
    assert.equal(result.frames[3].textTitle, 1);
    assert.equal(result.frames[5].points, 1);
    assert.equal(result.frames[5].actions, 1);
    assert.equal(result.frames[5].minutesTitle, 1);
    assert.deepEqual(result.frames[0].pagination, [1, 0, 0]);
    assert.deepEqual(result.frames[3].pagination, [0, 1, 0]);
    assert.deepEqual(result.frames[5].pagination, [0, 0, 1]);
    assert.deepEqual(result.backward, result.frames[3]);
    assert.deepEqual(result.restart, result.frames[0]);
    assert(result.frames.every((frame) => !frame.overflow));
    assert(result.frames.every((frame) => frame.header === '产品周会'));
    assert.deepEqual(remoteRequests, []);
    const artifacts = path.join(__dirname, '.hyperframes', 'artifacts', 'self-check');
    fs.mkdirSync(artifacts, { recursive: true });
    for (const time of [1, 3.6, 6.6]) {
      await page.evaluate((value) => {
        window.__timelines['brevia-onboarding'].seek(value);
      }, time);
      await page.screenshot({ path: path.join(artifacts, `frame-${time}.png`) });
    }
    await page.goto(pathToFileURL(path.join(__dirname, 'preview.html')).href);
    await page.waitForFunction(() => !document.getElementById('toggle').disabled);
    await page.click('#toggle');
    assert.equal(await page.$eval('#toggle', (button) => button.textContent), '播放');
    await page.$eval('#time', (slider) => {
      slider.value = '6.6';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() =>
      document.getElementById('position').textContent.startsWith('6.60'),
    );
    await page.click('#toggle');
    assert.equal(await page.$eval('#toggle', (button) => button.textContent), '暂停');
    await page.waitForFunction(() => Number(document.getElementById('time').value) > 6.7);
    await page.$eval('#time', (slider) => {
      slider.value = '8.99';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() =>
      document.getElementById('position').textContent.startsWith('8.99'),
    );
    await page.click('#toggle');
    await page.waitForFunction(() => Number(document.getElementById('time').value) < 1);
    await page.setViewport({ width: 390, height: 720 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('toggle').disabled);
    assert.equal(await page.$eval('#toggle', (button) => button.textContent), '播放');
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, []);
    console.log(
      'PASS: 9s timeline; 3 capability states; backward seek; start/end match; local file playback/pause/scrub/loop; no remote requests or JS errors; no horizontal overflow at 1280px/390px; reduced motion pauses autoplay.',
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
