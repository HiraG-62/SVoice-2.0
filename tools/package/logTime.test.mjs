import assert from 'node:assert/strict';
import { Console } from 'node:console';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { formatLocalTime, installConsoleTime } from './logTime.mjs';

const FIXED_DATE = new Date('2026-11-05T16:27:31.003Z');

function capturedConsole() {
  const stdout = [];
  const stderr = [];
  const stream = output => new Writable({
    write(chunk, encoding, done) { output.push(chunk.toString()); done(); },
  });
  const target = new Console({ stdout: stream(stdout), stderr: stream(stderr) });
  return { target, stdout, stderr };
}

test('UTC より進んだ時差で日付を繰り上げ、ミリ秒を保持する', () => {
  assert.equal(formatLocalTime(FIXED_DATE, -540), '2026-11-06T01:27:31.003+09:00');
});

test('UTC より遅れた時差の時間と分を整形する', () => {
  assert.equal(formatLocalTime(new Date('2026-11-06T01:27:31.123Z'), 330), '2026-11-05T19:57:31.123-05:30');
});

test('時差が 0 の場合も UTC との時差を付ける', () => {
  assert.equal(formatLocalTime(FIXED_DATE, 0), '2026-11-05T16:27:31.003+00:00');
});

test('時差を省略すると実行環境のローカル時刻を使う', () => {
  assert.equal(formatLocalTime(FIXED_DATE), formatLocalTime(FIXED_DATE, FIXED_DATE.getTimezoneOffset()));
});

test('書式指定とオブジェクトを util.format の形式で出力する', () => {
  const { target, stdout } = capturedConsole();
  installConsoleTime(target, () => FIXED_DATE);
  target.log('%s 人', 3);
  target.info('状態:', { ready: true });
  assert.deepEqual(stdout, [
    `${formatLocalTime(FIXED_DATE)} 3 人\n`,
    `${formatLocalTime(FIXED_DATE)} 状態: { ready: true }\n`,
  ]);
});

test('複数行の先頭にだけ時刻を付ける', () => {
  const { target, stderr } = capturedConsole();
  installConsoleTime(target, () => FIXED_DATE);
  target.error('起動失敗\n    at launch');
  assert.deepEqual(stderr, [`${formatLocalTime(FIXED_DATE)} 起動失敗\n    at launch\n`]);
});

test('2 回有効にしても時刻が二重にならない', () => {
  const { target, stdout } = capturedConsole();
  installConsoleTime(target, () => FIXED_DATE);
  installConsoleTime(target, () => FIXED_DATE);
  target.log('起動');
  assert.deepEqual(stdout, [`${formatLocalTime(FIXED_DATE)} 起動\n`]);
});

test('log・info・debug は stdout、warn・error は stderr を使う', () => {
  const { target, stdout, stderr } = capturedConsole();
  installConsoleTime(target, () => FIXED_DATE);
  for (const method of ['log', 'info', 'debug', 'warn', 'error']) target[method](method);
  const line = method => `${formatLocalTime(FIXED_DATE)} ${method}\n`;
  assert.deepEqual(stdout, ['log', 'info', 'debug'].map(line));
  assert.deepEqual(stderr, ['warn', 'error'].map(line));
});

test('出力のたびに現在時刻を取得する', () => {
  const { target, stdout } = capturedConsole();
  const nextDate = new Date(FIXED_DATE.getTime() + 1000);
  const dates = [FIXED_DATE, nextDate];
  installConsoleTime(target, () => dates.shift());
  target.log('開始');
  target.log('完了');
  assert.deepEqual(stdout, [
    `${formatLocalTime(FIXED_DATE)} 開始\n`,
    `${formatLocalTime(nextDate)} 完了\n`,
  ]);
});
