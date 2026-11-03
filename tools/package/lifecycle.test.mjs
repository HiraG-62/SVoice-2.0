import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createLifecycle } from './lifecycle.mjs';

test('停止シグナルで全リソースを閉じ、完了を待って正常終了する', async () => {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    const host = new EventEmitter();
    const exits = [];
    let finish;
    host.exit = code => exits.push(code);
    const lifecycle = createLifecycle(host, { timeoutMs: 100 });
    lifecycle.add(() => new Promise(resolve => { finish = resolve; }));
    host.emit(signal);
    assert.deepEqual(exits, []);
    finish();
    await lifecycle.stop();
    assert.deepEqual(exits, [0]);
  }
});

test('停止中の異常でも終了コードを失わず、閉じる処理は一度だけ行う', async () => {
  const host = new EventEmitter();
  const exits = [];
  host.exit = code => exits.push(code);
  let closed = 0;
  const lifecycle = createLifecycle(host, { logger: { error() {} } });
  lifecycle.add(async () => { closed++; throw new Error('close failed'); });
  await lifecycle.stop(1);
  await lifecycle.stop();
  assert.equal(closed, 1);
  assert.deepEqual(exits, [1]);
});

test('終了処理が完了しなければ期限で異常終了する', async () => {
  const host = new EventEmitter();
  const exits = [];
  host.exit = code => exits.push(code);
  const lifecycle = createLifecycle(host, { timeoutMs: 10, logger: { error() {} } });
  lifecycle.add(() => new Promise(() => {}));
  void lifecycle.stop();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(exits, [1]);
});

test('実行時の致命的エラーでリソースを閉じて異常終了する', async () => {
  const host = new EventEmitter();
  const exits = [];
  host.exit = code => exits.push(code);
  const lifecycle = createLifecycle(host, { logger: { error() {} } });
  let closed = false;
  lifecycle.add(async () => { closed = true; });
  host.emit('unhandledRejection', new Error('failed'));
  await lifecycle.stop();
  assert.equal(closed, true);
  assert.deepEqual(exits, [1]);
});
