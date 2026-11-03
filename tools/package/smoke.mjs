import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, rename, stat, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import tls from 'node:tls';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { RELEASE, ROOT, require } from './common.mjs';
import { assertPortsFree, listen, withSmokeProcess, deadline } from './smoke-process.mjs';

const PORTS = { frontend: 3100, socket: 3101, game: 30100, internal: 5100, internalTls: 1334 };
const START_TIMEOUT_MS = 15_000;
const POLL_MS = 150;
const io = require(require.resolve('socket.io-client', { paths: [join(ROOT, 'backend')] })).io;
const selfsigned = require(require.resolve('selfsigned', { paths: [join(ROOT, 'backend')] }));

async function eventually(check) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let error;
  while (Date.now() < deadline) {
    try { return await check(); } catch (value) { error = value; }
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  throw error;
}


async function configuration(directory, tls) {
  const cert = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 1, keySize: 2048 });
  await writeFile(join(directory, 'key.pem'), cert.private);
  await writeFile(join(directory, 'cert.pem'), cert.cert);
  await writeFile(join(directory, 'tokens.json'), JSON.stringify({ tokens: ['packaging-dummy-token'] }));
  await writeFile(join(directory, 'app.env'), [
    `NODE_ENV=${tls ? 'production' : 'development'}`, 'DISCORD_ENABLED=false', 'DISCORD_MEMBER_COUNT_ENABLED=false',
    'API_SECRET=packaging-dummy-api-secret', 'JOIN_PASSWORD=packaging-dummy-password',
    'NUXT_APP_SECRET=packaging-dummy-app-secret-at-least-32-characters', 'NUXT_API_SECRET=packaging-dummy-api-secret',
    `PORT=${PORTS.frontend}`, `SOCKET_PORT=${PORTS.socket}`, `GAME_RECEIVER_PORT=${PORTS.game}`,
    `DISCORD_HTTP_PORT=${PORTS.internal}`, `DISCORD_TLS_PORT=${PORTS.internalTls}`,
    'DATA_DIR=data/backend', 'NUXT_DATA_DIR=data/frontend', 'DISCORD_TOKENS_PATH=tokens.json',
    ...(tls ? ['TLS_KEY_PATH=key.pem', 'TLS_CERT_PATH=cert.pem'] : []),
  ].join('\n'));
}

const processExits = [];
async function withProcess(directory, extraEnv, check, ignoredPorts = [], expectedFailure = false) {
  const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP, ...extraEnv };
  let output = async () => '';
  try {
    await withSmokeProcess({ directory, env, ports: Object.values(PORTS), ignoredPorts, expectedFailure,
      onExit: result => { processExits.push(result); } }, async app => {
      output = app.output;
      await check(app.output, app.child, app.stop, app.completion, app.interrupt);
    });
    await assert.rejects(stat(join(directory, 'data/backend/stop.token')), { code: 'ENOENT' });
  } finally {
    await writeFile(join(directory, `smoke-${extraEnv.DISCORD_ENABLED ? 'discord' : extraEnv.NODE_ENV ?? 'http'}.log`), await output());
  }
}

function certificate(port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, () => {
      const fingerprint = socket.getPeerCertificate().fingerprint256;
      socket.end();
      resolve(fingerprint);
    });
    socket.setTimeout(2000, () => socket.destroy(new Error('TLS timeout')));
    socket.on('error', reject);
  });
}

async function httpChecks(directory, result) {
  await withProcess(directory, {}, async (output, child) => {
    const base = `http://127.0.0.1:${PORTS.frontend}`;
    await eventually(async () => {
      if (child.exitCode !== null) throw new Error(await output());
      const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 200);
    });
    const page = await (await fetch(base)).text();
    const script = page.match(/(?:src|href)="([^\"]+\.js)"/);
    assert.ok(script, 'トップページの JavaScript');
    const asset = await fetch(new URL(script[1], base));
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
    assert.ok((await asset.arrayBuffer()).byteLength > 0);
    const assets = JSON.parse(await readFile(join(RELEASE, 'build/assets.json'), 'utf8'));
    let assetCount = 0;
    for (const [key, file] of Object.entries(assets)) {
      if (!key.startsWith('public/')) continue;
      const response = await fetch(`${base}/${key.slice('public/'.length)}?probe=1`);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(file));
      assetCount++;
    }
    result.staticAssets = assetCount;
    const setting = await fetch(`${base}/api/getSetting`);
    assert.equal(setting.status, 200);
    assert.ok((await setting.json()).general);
    assert.equal((await fetch(`${base}/api/socketToken`)).status, 401);
    assert.equal((await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"gamerTag":"Probe"}' })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${PORTS.game}/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]' })).status, 200);
    result.httpAndAssetsAndApi = 'passed';
    for (const transport of ['polling', 'websocket']) {
      const socket = io(`http://127.0.0.1:${PORTS.socket}`, { transports: [transport], reconnection: false, timeout: 2000 });
      try {
        const [error] = await once(socket, 'connect_error');
        assert.equal(error.message, 'unauthorized');
        result[transport] = 'passed';
      } catch (error) { result[transport] = String(error); process.exitCode = 1; }
      finally { socket.close(); }
    }
    await stat(join(directory, 'data/frontend/setting.json'));
    assert.ok((await output()).includes(`設定ファイル: ${join(directory, 'app.env')}`));
    result.adjacentEnvironmentFromDifferentCwd = 'passed';
  });
}

async function tlsChecks(directory, result) {
  await configuration(directory, true);
  await withProcess(directory, { NODE_ENV: 'production' }, async () => {
    const ports = [PORTS.frontend, PORTS.socket, PORTS.internalTls];
    const initial = await eventually(() => Promise.all(ports.map(certificate)));
    const replacement = await selfsigned.generate([{ name: 'commonName', value: 'replacement' }], { days: 1, keySize: 2048 });
    await writeFile(join(directory, 'next-key.pem'), replacement.private);
    await writeFile(join(directory, 'next-cert.pem'), replacement.cert);
    await rename(join(directory, 'next-key.pem'), join(directory, 'key.pem'));
    await rename(join(directory, 'next-cert.pem'), join(directory, 'cert.pem'));
    let reloadError;
    try {
      await eventually(async () => {
        const updated = await Promise.all(ports.map(certificate));
        result.tlsReload = Object.fromEntries(ports.map((port, index) => [port, updated[index] !== initial[index]]));
        updated.forEach((value, index) => assert.notEqual(value, initial[index], `TLS 更新 :${ports[index]}`));
      });
    } catch (error) { reloadError = error; }
    const valid = await Promise.all(ports.map(certificate));
    await writeFile(join(directory, 'cert.pem'), 'invalid-certificate');
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.deepEqual(await Promise.all(ports.map(certificate)), valid);
    result.invalidCertificateRetention = 'passed';
    if (reloadError) throw reloadError;
  });
}

{
  const directory = join(RELEASE, 'smoke');
  await assertPortsFree(Object.values(PORTS));
  await mkdir(directory, { recursive: true });
  const delivery = join(RELEASE, 'svoice');
  assert.deepEqual((await readdir(delivery)).sort(), ['VERSION.txt', 'app.env.example', 'svoice-service.xml', 'svoice.exe'].sort());
  const version = await readFile(join(delivery, 'VERSION.txt'), 'utf8');
  const executable = await readFile(join(delivery, 'svoice.exe'));
  assert.ok(version.includes(`SHA256=${createHash('sha256').update(executable).digest('hex')}`));
  await copyFile(join(delivery, 'svoice.exe'), join(directory, 'svoice.exe'));
  const result = { processExits };
  const checks = {
    http: async () => { await configuration(directory, false); await httpChecks(directory, result); },
    discordImportAndDummyLogin: async () => {
      await configuration(directory, false);
      await withProcess(directory, { DISCORD_ENABLED: 'true' }, async output => {
        await eventually(async () => assert.match(await output(), /Bot #0 ログイン失敗/));
      });
    },
    tlsReloadAndInvalidRetention: () => tlsChecks(directory, result),
    stopCommandAndPortRelease: async () => {
      await configuration(directory, false);
      await withProcess(directory, {}, async (output, child, stop) => {
        await eventually(async () => assert.equal((await fetch(`http://127.0.0.1:${PORTS.frontend}`)).status, 200));
        const started = Date.now();
        assert.equal(await stop(), 0);
        assert.ok(Date.now() - started < START_TIMEOUT_MS);
        await assertPortsFree(Object.values(PORTS));
      });
    },
    optionalSigint: async () => {
      await configuration(directory, false);
      let status = 'passed';
      await withProcess(directory, {}, async (_output, _child, _stop, _completion, interrupt) => {
        await eventually(async () => assert.equal((await fetch(`http://127.0.0.1:${PORTS.frontend}`)).status, 200));
        try { assert.equal(await interrupt(), 0); }
        catch { status = '未確認'; }
      });
      return status;
    },
    startupFailures: async () => {
      for (const port of Object.values(PORTS)) {
        await configuration(directory, false);
        const blocker = net.createServer();
        await listen(blocker, { port, host: '::' });
        try {
          await withProcess(directory, {}, async (_output, child, _stop, completion) => {
            const code = await deadline(completion, `起動失敗で終了しない :${port}`);
            assert.notEqual(code, 0);
            assert.notEqual(code, null);
          }, [port], true);
        } finally { await new Promise(resolve => blocker.close(resolve)); }
        await assertPortsFree(Object.values(PORTS));
      }
    },
  };
  for (const [name, check] of Object.entries(checks)) {
    try { result[name] = await check() ?? 'passed'; }
    catch (error) { result[name] = String(error); process.exitCode = 1; }
  }
  await writeFile(join(directory, 'smoke-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
