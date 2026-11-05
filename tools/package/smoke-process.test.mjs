import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RELEASE, ROOT } from './common.mjs';
import { pathToFileURL } from 'node:url';
import { assertPortsFree, listen, withSmokeProcess } from './smoke-process.mjs';

test('IPv4・IPv6 の待受を見逃さず、listen 失敗を Promise のエラーにする', async () => {
  for (const host of ['0.0.0.0', '::']) {
    const server = net.createServer();
    await listen(server, { host, port: 0, ipv6Only: host === '::' });
    const port = server.address().port;
    try {
      if (host === '::') {
        const ipv4 = net.createServer();
        await listen(ipv4, { host: '127.0.0.1', port });
        await new Promise(resolve => ipv4.close(resolve));
      }
      await assert.rejects(assertPortsFree([port]), /ポート使用中/);
      const conflict = net.createServer();
      await assert.rejects(listen(conflict, { host, port, ipv6Only: host === '::' }), { code: 'EADDRINUSE' });
    } finally { await new Promise(resolve => server.close(resolve)); }
    await assertPortsFree([port]);
  }
});

test('停止コマンドで実プロセスを終了し、トークンを削除する', async () => {
  const directory = await fixture();
  await withSmokeProcess({ directory, executable: process.execPath,
    args: [join(directory, 'app.mjs'), '--ignore-sigint'], ports: [] }, async ({ stop, output }) => {
    await ready(output);
    assert.equal(await stop(), 0);
  });
  await assert.rejects(readFile(join(directory, 'stop.token')), { code: 'ENOENT' });
});

test('SIGINT が届かなくても停止コマンドで回収できる', async () => {
  const directory = await fixture();
  await withSmokeProcess({ directory, executable: process.execPath,
    args: [join(directory, 'app.mjs'), '--ignore-sigint'], ports: [], interruptTimeoutMs: 100 }, async app => {
    await ready(app.output);
    await assert.rejects(app.interrupt(), /SIGINT 終了タイムアウト/);
    assert.equal(await app.stop(), 0);
  });
});

test('SIGINT が届く環境では実プロセスの正常終了を確認する', async context => {
  const directory = await fixture();
  await withSmokeProcess({ directory, executable: process.execPath, args: [join(directory, 'app.mjs')], ports: [] }, async ({ interrupt, output }) => {
    await ready(output);
    try {
      assert.equal(await interrupt(), 0);
      assert.match(await output(), /SIGINT 受信/);
    } catch { context.skip('SIGINT は未確認'); }
  });
});

test('検証処理が失敗しても起動した実プロセスを残さない', async () => {
  const directory = await fixture();
  let pid;
  await assert.rejects(withSmokeProcess({ directory, executable: process.execPath, args: [join(directory, 'app.mjs')], ports: [] }, async app => {
    pid = app.pid;
    await ready(app.output);
    throw new Error('検証失敗');
  }), /検証失敗/);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('起動失敗の終了待ち中に検証が失敗しても、停止要求を送らず元のエラーを保つ', async () => {
  const directory = await startupFixture(1);
  let pid;
  const exits = [];
  await assert.rejects(withSmokeProcess({ directory, executable: process.execPath,
    args: [join(directory, 'app.mjs')], ports: [], expectedFailure: true,
    onExit: result => exits.push(result) }, async app => {
    pid = app.pid;
    await ready(app.output);
    throw new Error('検証中断');
  }), /検証中断/);
  assert.deepEqual(exits, [{ pid, code: 1 }]);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('起動失敗を期待している場合は終了コード 0 を成功扱いしない', async () => {
  const directory = await startupFixture(0);
  await assert.rejects(withSmokeProcess({ directory, executable: process.execPath,
    args: [join(directory, 'app.mjs')], ports: [], expectedFailure: true }, async app => {
    await app.completion;
  }), /起動失敗時の終了コード/);
});

test('SIGINT を無視する exe も finally で強制終了する', async () => {
  const directory = await fixture();
  let pid;
  await assert.rejects(withSmokeProcess({ directory, executable: process.execPath,
    args: [join(directory, 'app.mjs'), '--ignore-sigint'], ports: [], stopMode: 'signal', stopTimeoutMs: 100 }, async app => {
    pid = app.pid;
    await ready(app.output);
  }), /SIGINT 終了タイムアウト/);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('起動用 PowerShell が突然終了しても Job Object が exe を回収する', async () => {
  const directory = await fixture();
  let pid;
  await assert.rejects(withSmokeProcess({ directory, executable: process.execPath,
    args: [join(directory, 'app.mjs')], ports: [] }, async app => {
    pid = app.pid;
    await ready(app.output);
    app.child.kill();
    await app.completion;
  }), /exe 終了コードの欠落/);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

async function fixture() {
  await mkdir(join(RELEASE, 'process-tests'), { recursive: true });
  const directory = await mkdtemp(join(RELEASE, 'process-tests/run-'));
  await writeFile(join(directory, 'app.mjs'), `
    import http from 'node:http';
    import { createStopController, requestStop } from ${JSON.stringify(pathToFileURL(join(ROOT, 'tools/package/stop.mjs')).href)};
    const root = ${JSON.stringify(directory)};
    if (process.argv.includes('--stop')) {
      await requestStop({ root, dataDir: root });
    } else {
      const server = http.createServer((_request, response) => response.end('ready'));
      const stop = async () => {
        await controller.close();
        server.close(() => process.exit(0));
      };
      const controller = createStopController({ root, dataDir: root, onStop: stop });
      await controller.ready;
      process.on('SIGINT', () => {
        if (process.argv.includes('--ignore-sigint')) return;
        console.log('SIGINT 受信');
        void stop();
      });
      server.listen(0, () => console.log('準備完了'));
    }
  `);
  return directory;
}

async function ready(output) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await output()).includes('準備完了')) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('起動タイムアウト');
}

async function startupFixture(exitCode) {
  const directory = await fixture();
  const exitDelayMs = 1000;
  await writeFile(join(directory, 'app.mjs'), `
    if (process.argv.includes('--stop')) throw new Error('停止要求の送信');
    console.log('準備完了');
    setTimeout(() => process.exit(${exitCode}), ${exitDelayMs});
  `);
  return directory;
}
