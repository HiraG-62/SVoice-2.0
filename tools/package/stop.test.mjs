import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { RELEASE } from './common.mjs';
import { createStopController, stopPipePath, requestStop } from './stop.mjs';

async function directory() {
  await mkdir(join(RELEASE, 'stop-tests'), { recursive: true });
  return mkdtemp(join(RELEASE, 'stop-tests/run-'));
}

function send(path, message) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path);
    let response = '';
    socket.on('connect', () => socket.end(message));
    socket.on('data', data => { response += data; });
    socket.on('error', reject);
    socket.on('close', () => resolve(response));
  });
}

test('停止パイプは exe のフォルダーとユーザーで分離する', async () => {
  const root = await directory();
  assert.equal(stopPipePath(root, 'user-a'), stopPipePath(root.toUpperCase(), 'user-a'));
  assert.notEqual(stopPipePath(root, 'user-a'), stopPipePath(root, 'user-b'));
  assert.notEqual(stopPipePath(root, 'user-a'), stopPipePath(await directory(), 'user-a'));
});

test('不一致トークンは拒否し、正しいトークンでだけ終了処理を呼ぶ', async () => {
  const root = await directory();
  let stopped = 0;
  const controller = createStopController({ root, dataDir: root, onStop: () => { stopped++; } });
  await controller.ready;
  try {
    const token = await readFile(join(root, 'stop.token'));
    assert.equal(token.length, 32);
    assert.equal(await send(controller.path, `${'0'.repeat(64)}\n`), 'denied\n');
    assert.equal(stopped, 0);
    assert.equal(await send(controller.path, `${token.toString('hex')}\n`), `stopping:${process.pid}\n`);
    assert.equal(stopped, 1);
  } finally { await controller.close(); }
  await assert.rejects(stat(join(root, 'stop.token')), { code: 'ENOENT' });
});

test('同じパイプの二重起動で実行中のトークンを上書きしない', async () => {
  const root = await directory();
  const controller = createStopController({ root, dataDir: root, onStop() {} });
  await controller.ready;
  const token = await readFile(join(root, 'stop.token'));
  const duplicate = createStopController({ root, dataDir: root, onStop() {} });
  try {
    await assert.rejects(duplicate.ready);
    await duplicate.close();
    assert.deepEqual(await readFile(join(root, 'stop.token')), token);
  } finally { await controller.close(); }
});

test('応答だけで停止完了にせず、対象プロセスの終了まで待つ', async () => {
  const root = await directory();
  const controller = createStopController({ root, dataDir: root, onStop() {} });
  await controller.ready;
  try {
    await assert.rejects(requestStop({ root, dataDir: root, timeoutMs: 100 }), /停止のタイムアウト/);
  } finally { await controller.close(); }
});

test('対象が起動していない停止要求は失敗する', async () => {
  const root = await directory();
  await assert.rejects(requestStop({ root, dataDir: root }), /停止用トークン/);
});
