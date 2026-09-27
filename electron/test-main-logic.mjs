import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { applyPendingMove, currentDirectory, readLocation, recordingsDirectory, setFirstRunDirectories } = require('./model-location');
const modelLocationRoot = await mkdtemp(path.join(tmpdir(), 'brevia-model-location-'));
try {
  const data = path.join(modelLocationRoot, 'data');
  const oldModels = path.join(data, 'models');
  const newModels = path.join(modelLocationRoot, 'external-models');
  await mkdir(oldModels, { recursive: true });
  await mkdir(newModels);
  await writeFile(path.join(oldModels, 'model.gguf'), 'model data');
  const oldRealPath = await realpath(oldModels);
  const newRealPath = await realpath(newModels);
  const dottedChild = path.join(oldModels, '..archive');
  await mkdir(dottedChild);
  await assert.rejects(setFirstRunDirectories(data, { models: dottedChild }), /outside/);
  await rm(dottedChild, { recursive: true });
  await assert.rejects(setFirstRunDirectories(data, { models: data }), /outside/);
  await assert.rejects(setFirstRunDirectories(data, { recordings: oldModels }), /folders must be separate/);
  await setFirstRunDirectories(data, { models: newModels });
  assert.equal(currentDirectory(data), oldRealPath, 'model directory changes only after migration');
  await writeFile(path.join(newModels, 'foreign-file'), 'keep');
  await assert.rejects(applyPendingMove(data), /no longer empty/);
  assert.equal(await readFile(path.join(oldModels, 'model.gguf'), 'utf8'), 'model data');
  await rm(path.join(newModels, 'foreign-file'));
  assert.equal(readLocation(data).pending, undefined, 'failed moves cannot later commit a stale copy');
  await setFirstRunDirectories(data, { models: newModels });
  await mkdir(`${newModels}.brevia-migration`);
  await writeFile(path.join(`${newModels}.brevia-migration`, 'keep'), 'not ours');
  await assert.rejects(applyPendingMove(data), /staging folder already exists/);
  assert.equal(await readFile(path.join(`${newModels}.brevia-migration`, 'keep'), 'utf8'), 'not ours');
  await rm(`${newModels}.brevia-migration`, { recursive: true });
  await setFirstRunDirectories(data, { models: newModels });
  await applyPendingMove(data);
  assert.equal(currentDirectory(data), newRealPath);
  assert.equal(await readFile(path.join(newModels, 'model.gguf'), 'utf8'), 'model data');
  assert.deepEqual(readLocation(data), { current: newRealPath });
  await assert.rejects(readFile(path.join(oldModels, 'model.gguf')), { code: 'ENOENT' });

  const freshData = path.join(modelLocationRoot, 'fresh-data');
  const chosenModels = path.join(modelLocationRoot, 'chosen-models');
  const chosenRecordings = path.join(modelLocationRoot, 'chosen-recordings');
  await mkdir(path.join(freshData, 'models'), { recursive: true });
  await mkdir(path.join(freshData, 'meetings'));
  await mkdir(chosenModels);
  await mkdir(chosenRecordings);
  await writeFile(path.join(freshData, 'meetings', 'existing-recording'), 'keep');
  assert.equal(await setFirstRunDirectories(freshData, { models: chosenModels, recordings: chosenRecordings }), true);
  assert.equal(recordingsDirectory(freshData), await realpath(path.join(freshData, 'meetings')), 'recordings remain at the source until copied');
  await applyPendingMove(freshData);
  assert.equal(currentDirectory(freshData), await realpath(chosenModels));
  assert.equal(recordingsDirectory(freshData), await realpath(chosenRecordings));
  assert.equal(await readFile(path.join(chosenRecordings, 'existing-recording'), 'utf8'), 'keep');
  await assert.rejects(readFile(path.join(freshData, 'meetings', 'existing-recording')), { code: 'ENOENT' });

  // The other partition may be managed by an environment variable.
  const externalModels = path.join(modelLocationRoot, 'env-models');
  const nextRecordings = path.join(modelLocationRoot, 'next-recordings');
  await mkdir(externalModels);
  await mkdir(nextRecordings);
  await writeFile(path.join(externalModels, 'model'), 'external');
  await setFirstRunDirectories(freshData, { models: externalModels, recordings: nextRecordings }, { models: externalModels });
  await applyPendingMove(freshData);
  assert.equal(currentDirectory(freshData), await realpath(chosenModels));
  assert.equal(await readFile(path.join(nextRecordings, 'existing-recording'), 'utf8'), 'keep');

  // A completed but unpublished staging copy must be rebuilt from the latest source.
  const retryModels = path.join(modelLocationRoot, 'retry-models');
  await mkdir(retryModels);
  await setFirstRunDirectories(data, { models: retryModels });
  await mkdir(`${retryModels}.brevia-migration`);
  await writeFile(path.join(`${retryModels}.brevia-migration`, '.brevia-models-migration'), newRealPath);
  await writeFile(path.join(newModels, 'new-after-failure'), 'latest');
  await rm(retryModels, { recursive: true });
  await applyPendingMove(data);
  assert.equal(await readFile(path.join(retryModels, 'new-after-failure'), 'utf8'), 'latest');

  // A disconnected destination must never trigger deletion of the surviving source.
  const cleanupSource = path.join(modelLocationRoot, 'cleanup-source');
  await mkdir(cleanupSource);
  await writeFile(path.join(cleanupSource, 'keep'), 'only copy');
  await writeFile(path.join(data, 'models-location.json'), JSON.stringify({ current: path.join(modelLocationRoot, 'offline'), cleanup: cleanupSource }));
  await assert.rejects(applyPendingMove(data), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(cleanupSource, 'keep'), 'utf8'), 'only copy');

  const racingData = path.join(modelLocationRoot, 'racing-data');
  const racingTarget = path.join(modelLocationRoot, 'racing-target');
  await mkdir(path.join(racingData, 'models'), { recursive: true });
  await mkdir(racingTarget);
  await writeFile(path.join(racingData, 'models', 'model'), 'keep source');
  await setFirstRunDirectories(racingData, { models: racingTarget });
  const fsPromises = require('node:fs/promises');
  const racingModule = { exports: {} };
  runInNewContext(await readFile(new URL('./model-location.js', import.meta.url), 'utf8'), {
    module: racingModule,
    require: (name) => name === 'node:fs/promises' ? { ...fsPromises, rmdir: async (directory) => {
      await writeFile(path.join(directory, 'user-file'), 'keep target');
      return fsPromises.rmdir(directory);
    } } : require(name),
  });
  await assert.rejects(racingModule.exports.applyPendingMove(racingData), { code: 'ENOTEMPTY' });
  assert.equal(await readFile(path.join(racingTarget, 'user-file'), 'utf8'), 'keep target');
  assert.equal(await readFile(path.join(racingData, 'models', 'model'), 'utf8'), 'keep source');
} finally {
  await rm(modelLocationRoot, { recursive: true, force: true });
}
const { configureMacUpdater, createDisplayMediaHandler, isNewerVersion, registerScreenPermission, requiredModelsFrom, systemAudioSupported, workerError } = require('./main-logic');

const screen = { id: 'screen:0:0' };
let selected;
await createDisplayMediaHandler({ getSources: async () => [screen] }, assert.fail)(null, (value) => { selected = value; });
assert.deepEqual(selected, { video: screen, audio: 'loopback' });

let logged;
await createDisplayMediaHandler({ getSources: async () => { throw new Error('denied'); } }, (...value) => { logged = value; })(null, (value) => { selected = value; });
assert.deepEqual(selected, {});
assert.equal(logged[0], 'ERROR');
assert.equal(logged[1].message, 'denied');

let calls = 0;
await assert.rejects(
  createDisplayMediaHandler({ getSources: async () => [screen] }, assert.fail)(null, () => { calls += 1; throw new Error('Electron rejected stream'); }),
  /Electron rejected stream/,
);
assert.equal(calls, 1, 'a rejected callback must not be retried');

let permissionRequest;
await registerScreenPermission({ getSources: async (options) => { permissionRequest = options; } }, assert.fail);
assert.deepEqual(permissionRequest, { types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
await registerScreenPermission({ getSources: async () => { throw new Error('not listed'); } }, (...value) => { logged = value; });
assert.deepEqual(logged, ['WARNING', 'screen permission registration: not listed']);

const updater = { setFeedURL(value) { this.feed = value; } };
configureMacUpdater(updater);
assert.equal(updater.autoDownload, false);
assert.deepEqual(updater.feed, { provider: 'generic', url: 'https://modelscope.cn/models/zyaztec/brevia-release/resolve/master' });

assert.equal(systemAudioSupported('darwin', '21.6.0'), false);
assert.equal(systemAudioSupported('darwin', '22.0.0'), true);
assert.equal(systemAudioSupported('win32', '0'), true);
assert.equal(systemAudioSupported('linux', '6.0.0'), false);
assert.equal(isNewerVersion('v1.0.6', '1.0.5'), true);
assert.equal(isNewerVersion('1.0.5', '1.0.5'), false);
assert.equal(isNewerVersion('1.0.4', '1.0.5'), false);

// 纪要配置只认 version 2：旧的 {models, active, sequence} 结构不再迁移，一律当作未配置。
const { z } = require('zod');
const mainSource = (await readFile(new URL('./main.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const workerEventBlock = mainSource.slice(mainSource.indexOf('const workerEvent ='), mainSource.indexOf('const workerMessage ='));
for (const source of ['../backend/worker_core.py', '../backend/worker_session.py', '../backend/worker_refinement.py', '../backend/worker_models.py', '../backend/worker_speakers.py', '../backend/worker_llm.py', '../backend/worker_ai_note.py', '../backend/worker_llama_sidecar.py']) {
  const workerSource = await readFile(new URL(source, import.meta.url), 'utf8');
  for (const [, type] of workerSource.matchAll(/self\.emit\(\s*['"]([^'"]+)/g)) assert.match(workerEventBlock, new RegExp(`['"]${type}['"]`), `${type} emitted by ${source} must be accepted by Electron`);
}
assert.match(mainSource, /process\.platform === 'win32'\) Menu\.setApplicationMenu\(null\)/);
assert.match(mainSource, /screen\.getDisplayMatching\(mainWindow\.getBounds\(\)\)/, 'floating captions open on the main window display');
assert.match(mainSource, /const captionWindow = floatingCaptionWindow = new BrowserWindow/, 'caption callbacks keep ownership of their own window');
assert.match(mainSource, /if \(floatingCaptionWindow !== captionWindow\) return;/, 'stale caption callbacks cannot clear a newer window');
assert.match(mainSource, /webContents\.send\('brevia:event', \{\n        type: 'update\.download-progress'/, 'update progress uses the renderer event channel');
assert.match(mainSource, /const startupAnimationMs = 1700;/, 'startup animation keeps a visible minimum duration');
assert.match(mainSource, /Promise\.race\(\[initializeWorker\(\), new Promise\(\(resolve\) => setTimeout\(resolve, startupDataWaitMs\)\)\]\)/, 'startup does not wait indefinitely for the worker');
assert.match(mainSource, /powerMonitor\.on\('suspend', \(\) => \{ void stopActiveMeetingForSleep\(\); \}\);/, 'system sleep stops an active meeting');
assert.match(mainSource, /async function stopActiveMeetingForSleep\(\)/, 'system sleep shares the normal meeting stop path');
assert.match(mainSource, /const refinementWorker = new WorkerClient\(\{ refinement: true \}\);/, 'refinement runs in an isolated worker process');
assert.match(mainSource, /BREVIA_RECOVER_INTERRUPTED: recoverInterrupted \? '1' : '0'/, 'only the first main worker recovers interrupted meetings');
assert.match(mainSource, /existsSync\(projectPython\) \? projectPython/, 'development uses the project runtime when available');
assert.match(mainSource, /refinementWorker\.request\('meeting\.refine', value\)/, 'refinement IPC uses the isolated worker');
assert.match(mainSource, /Another meeting is already being refined/, 'the isolated worker rejects concurrent meetings');
assert.doesNotMatch(mainSource, /'tts'/, 'removed TTS data is not migrated');
assert.match(mainSource, /displayHeaderFooter: true/, 'PDF export uses Chromium header space for its brand');
assert.match(mainSource, /headerTemplate: '<div style="width:100%;text-align:center;opacity:\.72"><svg width="98" height="28"/, 'PDF header uses a crisp, visible vector brand');
assert.match(mainSource, /value\.task === 'meeting\.refine' \? refinementWorker : worker/, 'refinement task controls target the isolated worker');
assert.match(mainSource, /worker\.request\('meeting\.refinement-recover', \{ meeting_id: meetingId \}\)/, 'a crashed refinement returns the meeting to a retryable state');
assert.match(mainSource, /\['meeting\.audio', 15000\]/, 'audio IPC cannot retain requests forever');
assert.match(mainSource, /stoppingForSleep \|\| worker\.active\?\.meeting_id !== value\.meeting_id\) return \{ dropped: true \}/, 'late audio frames are dropped while a sleep stop is in progress');
assert.match(mainSource, /abandonActive\(reason\)/, 'a worker that cannot resume clears its stale active meeting');
assert.match(mainSource, /'meeting\.interrupted'/, 'the renderer receives an interrupted-meeting event');
assert.match(mainSource, /worker\.active = null;\n    worker\.recycle\(\);/, 'a stopped meeting recycles native model memory');
assert.match(mainSource, /refinementWorker\.active !== active[\s\S]*refinementWorker\.active = null;\n    refinementWorker\.recycle\(\);/, 'a completed refinement releases only its own isolated worker state');
assert.match(mainSource, /speaker-profile\.enroll[\s\S]*?\.finally\(\(\) => worker\.recycle\(\)\)/, 'voice enrollment releases native speaker models while idle');
assert.match(mainSource, /segment\.speaker-profile-sample[\s\S]*?\.finally\(\(\) => worker\.recycle\(\)\)/, 'segment voice samples release native speaker models while idle');
const oneLine = (decl) => { const start = mainSource.indexOf(decl); return mainSource.slice(start, mainSource.indexOf('\n', start) + 1); };
const schemaBlock = (decl) => { const start = mainSource.indexOf(decl); return mainSource.slice(start, mainSource.indexOf('\n});', start) + 5); };
const asyncFn = (name) => { const start = mainSource.indexOf(`async function ${name}(`); return mainSource.slice(start, mainSource.indexOf('\n}\n', start) + 2); };

const activeMeeting = { meeting_id: 'meeting-1', started_at: Date.now() };
const stopContext = { worker: { active: activeMeeting, request: async () => { throw new Error('offline'); } } };
runInNewContext(`${asyncFn('stopActiveMeeting')}\nthis.stopActiveMeeting = stopActiveMeeting;`, stopContext);
await assert.rejects(stopContext.stopActiveMeeting(), /offline/);
assert.equal(stopContext.worker.active, activeMeeting, 'a failed stop remains retryable');
stopContext.worker.request = async () => ({});
await stopContext.stopActiveMeeting();
assert.equal(stopContext.worker.active, null, 'a confirmed stop clears the active meeting');

const configDir = await mkdtemp(path.join(tmpdir(), 'brevia-summary-config-'));
const configFile = path.join(configDir, 'summary-models.json');
const aiConfigFile = path.join(configDir, 'ai-assist.json');
const configContext = { z, readFile, summaryConfigPath: () => configFile, aiAssistConfigPath: () => aiConfigFile };
runInNewContext([
  oneLine('const summaryProviderIds = '),
  schemaBlock('const summaryProviderEntry = '),
  schemaBlock('const summaryConfig = '),
  asyncFn('readSummaryConfig'),
  'this.readSummaryConfig = readSummaryConfig;',
].join('\n'), configContext);
const readConfig = configContext.readSummaryConfig;
const writeConfig = (value) => writeFile(configFile, typeof value === 'string' ? value : JSON.stringify(value));

assert.equal(await readConfig(), null, 'a missing file reads as unconfigured');
const storedConfig = { version: 2, provider: 'custom-claude', providers: { 'custom-claude': { model: 'x', endpoint: 'https://example.com/v1', keyReference: 'summary-1', keyLength: 8 } } };
await writeConfig(storedConfig);
assert.deepEqual(await readConfig(), { ...storedConfig, enabled: true }, 'existing summary configs default to enabled');
await writeConfig({ ...storedConfig, enabled: false });
assert.deepEqual(await readConfig(), { ...storedConfig, enabled: false }, 'the summary switch survives a round trip');
await writeConfig({ models: [{ name: '配置-1', provider: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', format: 'openai', model: 'gpt-4.1-mini', keyReference: 'summary-1' }], active: 0, sequence: 1 });
assert.equal(await readConfig(), null, 'the pre-1.0.8 multi-config structure is not migrated');
await writeConfig({ version: 1, provider: 'openai', providers: {} });
assert.equal(await readConfig(), null, 'version 1 is rejected');
await writeConfig('{ not json');
assert.equal(await readConfig(), null, 'a corrupt file reads as unconfigured instead of throwing');
await writeConfig({ version: 2, provider: 'ollama', providers: {} });
assert.equal(await readConfig(), null, 'a removed provider id is rejected');
await writeConfig({ version: 2, provider: 'built-in', providers: {} });
assert.deepEqual(await readConfig(), { version: 2, enabled: true, provider: 'built-in', providers: {} }, 'built-in needs no provider entry');
runInNewContext([
  schemaBlock('const aiAssistConfig = '),
  schemaBlock('const aiAssistConfigV1 = '),
  asyncFn('readAiAssistConfig'),
  'this.readAiAssistConfig = readAiAssistConfig;',
].join('\n'), configContext);
await writeFile(aiConfigFile, JSON.stringify({ version: 1, enabled: true, proactivity: 'assist' }));
assert.deepEqual(JSON.parse(JSON.stringify(await configContext.readAiAssistConfig())), { version: 2, enabled: true, proactivity: 'assist', provider: 'built-in', providers: {} }, 'AI assist v1 keeps its switch and proactivity after migration');
// v1 复用纪要配置；迁移时若纪要用的是在线供应商，AI 笔记应继承它而非被切到内置模型。
await writeConfig({ version: 2, provider: 'custom-claude', providers: { 'custom-claude': { model: 'x', endpoint: 'https://example.com/v1', keyReference: 'summary-1', keyLength: 8 } } });
await writeFile(aiConfigFile, JSON.stringify({ version: 1, enabled: true, proactivity: 'auto' }));
assert.deepEqual(JSON.parse(JSON.stringify(await configContext.readAiAssistConfig())), { version: 2, enabled: true, proactivity: 'auto', provider: 'custom-claude', providers: { 'custom-claude': { model: 'x', endpoint: 'https://example.com/v1', keyReference: 'summary-1', keyLength: 8 } } }, 'AI assist v1 migration carries over the online summary provider');
await rm(configDir, { recursive: true, force: true });

// share.open-external 只放行社交网页(https)与邮件(mailto),其余 scheme 一律拒绝,
// 避免通过 IPC 触发任意协议处理器。直接复用 main.js 中的守卫正则,防止实现漂移。
const shareGuardSource = oneLine('    if (!/^(https:\\/\\/|mailto:)/i.test(value.url)) throw new Error');
assert.ok(shareGuardSource.includes('Unsupported share URL'), 'share.open-external keeps its scheme guard');
const shareGuard = new Function('url', `${shareGuardSource.trim().replace('value.url', 'url')} return true;`);
assert.equal(shareGuard('https://twitter.com/intent/tweet?text=hi'), true, 'https web share is allowed');
assert.equal(shareGuard('mailto:?subject=x&body=y'), true, 'mailto is allowed');
for (const blocked of ['file:///etc/passwd', 'http://insecure.example', 'javascript:alert(1)', 'ms-settings:privacy']) {
  assert.throws(() => shareGuard(blocked), /Unsupported share URL/, `${blocked} is rejected`);
}

console.log('Electron behavior tests passed');

// ── worker 错误 → 结构化判定 ────────────────────────────────────────────────────
// 「模型没装」由 error_code/error_models 决定，不再正则解析文本。这条同时证明：
// 无论报文里的 error 文案怎么写，判定都不受影响（改文案不会破坏下载链路）。
const structured = workerError({
  error: 'Model qwen3-asr-0.6b-int8 is not installed',
  error_code: 'model_not_installed',
  error_models: ['qwen3-asr-0.6b-int8'],
});
assert.equal(structured.message, 'Model qwen3-asr-0.6b-int8 is not installed');
assert.equal(structured.code, 'model_not_installed');
assert.deepEqual(requiredModelsFrom(structured), ['qwen3-asr-0.6b-int8']);

// 同一组模型、完全不同的文案：判定结果必须一致。
const reworded = workerError({
  error: '该模型尚未下载，请先下载后重试。',
  error_code: 'model_not_installed',
  error_models: ['qwen3-asr-0.6b-int8'],
});
assert.deepEqual(requiredModelsFrom(reworded), ['qwen3-asr-0.6b-int8'], '判定不得依赖文案');

// 多模型缺失。
assert.deepEqual(
  requiredModelsFrom(workerError({ error: 'x', error_code: 'model_not_installed', error_models: ['a', 'b'] })),
  ['a', 'b'],
);

// 普通错误不能误触发下载流程——即使文案里恰好出现了 "not installed"。
assert.equal(requiredModelsFrom(new Error('sherpa-onnx is not installed')), null, '普通错误不得被当成模型缺失');
assert.equal(requiredModelsFrom(workerError({ error: 'boom' })), null);
assert.equal(requiredModelsFrom(workerError({ error: 'boom', error_code: 'model_not_installed' })), null, '没有模型列表时不触发下载');
assert.equal(requiredModelsFrom(workerError({ error: 'boom', error_code: 'model_not_installed', error_models: [] })), null);
assert.equal(requiredModelsFrom(undefined), null);
// 非字符串 / 非数组的脏字段被过滤掉，避免把非法 id 传给下载接口。
const dirty = workerError({ error: 'x', error_code: 'model_not_installed', error_models: ['ok', 7, null] });
assert.deepEqual(requiredModelsFrom(dirty), ['ok']);
assert.equal(workerError({ error: 'x' }).code, undefined);
