import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './common.mjs';

const TIMEOUT_MS = 15_000;
const CONTROL = join(ROOT, 'tools/package/control.ps1');

export function listen(server, options) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

export async function deadline(operation, message, timeoutMs = TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function control(args) {
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CONTROL, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  try {
    const code = await deadline(new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    }), 'プロセス操作のタイムアウト');
    assert.equal(code, 0, errors || output);
    return output;
  } finally { if (child.exitCode === null) child.kill(); }
}

export async function assertPortsFree(ports) {
  const listeners = JSON.parse(await control(['-Action', 'Ports']));
  const occupied = listeners.filter(listener => ports.includes(listener.port));
  assert.deepEqual(occupied, [], `ポート使用中: ${occupied.map(listener => `[${listener.address}]:${listener.port}`).join(', ')}`);
}

export async function withSmokeProcess({ directory, executable = join(directory, 'svoice.exe'), args = [], env = process.env,
  ports, ignoredPorts = [], expectedFailure = false, stopMode = 'command', stopTimeoutMs = TIMEOUT_MS,
  interruptTimeoutMs = stopTimeoutMs, onExit = () => {} }, check) {
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CONTROL,
    '-Action', 'Launch', '-Directory', directory, '-WorkingDirectory', ROOT,
    '-Executable', executable, '-ArgumentsBase64', Buffer.from(JSON.stringify(args)).toString('base64')], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let messages = '';
  let pid;
  let started;
  const pidReady = new Promise(resolve => { started = resolve; });
  child.stdout.on('data', data => {
    messages += data;
    const match = messages.match(/SVOICE_PID=(\d+)/);
    if (match) { pid = Number(match[1]); started(); }
  });
  child.stderr.on('data', data => { messages += data; });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => {
      try {
        const exit = messages.match(/SVOICE_EXIT=(-?\d+)/);
        assert.ok(exit, `exe 終了コードの欠落: ${messages}`);
        assert.equal(code, Number(exit[1]), messages);
        assert.equal(alive(pid), false, `exe が残存: PID=${pid}`);
        resolve(Number(exit[1]));
      } catch (error) { reject(error); }
    });
  });
  void completion.catch(() => {});
  const output = async () => (await Promise.all(['stdout', 'stderr'].map(name => readFile(join(directory, `process-${name}.log`), 'utf8').catch(() => '')))).join('');
  const interrupt = async () => {
    if (alive(pid)) await control(['-Action', 'Interrupt', '-TargetId', String(pid)]);
    return deadline(completion, `SIGINT 終了タイムアウト: PID=${pid}`, interruptTimeoutMs);
  };
  const stopCommand = async () => {
    if (!alive(pid)) return completion;
    const stopper = spawn(executable, [...args, '--stop'], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    stopper.stdout.resume();
    stopper.stderr.on('data', data => { errors += data; });
    try {
      const code = await deadline(new Promise((resolve, reject) => {
        stopper.once('error', reject);
        stopper.once('close', resolve);
      }), '--stop のタイムアウト', stopTimeoutMs);
      assert.equal(code, 0, errors || '--stop の失敗');
      return deadline(completion, `exe 終了タイムアウト: PID=${pid}`, stopTimeoutMs);
    } finally {
      if (stopper.exitCode === null) {
        stopper.kill();
        await new Promise(resolve => stopper.once('close', resolve));
      }
    }
  };
  const stop = stopMode === 'signal' ? interrupt : stopCommand;
  try {
    await deadline(Promise.race([pidReady, completion.then(() => { throw new Error('exe 起動前の終了'); })]), 'exe 起動タイムアウト');
    await check({ pid, child, output, stop, interrupt, completion });
  } finally {
    try {
      const code = alive(pid) ? await stop() : await completion;
      assert.equal(alive(pid), false, `exe が残存: PID=${pid}`);
      if (expectedFailure) assert.notEqual(code, 0, '起動失敗時の終了コード');
      else assert.equal(code, 0, '正常停止時の終了コード');
      onExit({ pid, code });
    } finally {
      // 起動用プロセスの終了だけでは、exe の終了を保証できない。
      for (const target of [child.pid, pid]) {
        if (!alive(target)) continue;
        const killer = spawn('taskkill.exe', ['/PID', String(target), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        await deadline(new Promise((resolve, reject) => {
          killer.once('error', reject);
          killer.once('exit', resolve);
        }), '強制終了のタイムアウト');
      }
      assert.equal(alive(pid), false, `強制終了後も exe が残存: PID=${pid}`);
      await assertPortsFree(ports.filter(port => !ignoredPorts.includes(port)));
    }
  }
}
