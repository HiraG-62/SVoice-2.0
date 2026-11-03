import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import tls from 'node:tls';
import net from 'node:net';
import { RELEASE, ROOT, require } from './common.mjs';

const PORTS = { frontend: 3100, socket: 3101, game: 30100, internal: 5100, internalTls: 1334 };
const START_TIMEOUT_MS = 15_000;
const POLL_MS = 150;
const io = require(require.resolve('socket.io-client', { paths: [join(ROOT, 'backend')] })).io;
const selfsigned = require(require.resolve('selfsigned', { paths: [join(ROOT, 'backend')] }));
const methods = process.argv.slice(2);
if (!methods.length || methods.some(method => !['sea', 'bun', 'folder'].includes(method))) throw new Error('引数: sea bun folder');

async function eventually(check) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let error;
  while (Date.now() < deadline) {
    try { return await check(); } catch (value) { error = value; }
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  throw error;
}

function freePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
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

async function withProcess(directory, method, extraEnv, check) {
  const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP,
    ENV_FILE: 'app.env', ...extraEnv };
  const executable = join(directory, method === 'folder' ? 'node.exe' : 'svoice.exe');
  const child = spawn(executable, method === 'folder' ? [join(directory, 'start.cjs')] : [], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  try {
    await check(() => output, child);
  } finally {
    const exited = once(child, 'exit');
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; }
    await writeFile(join(directory, `smoke-${extraEnv.DISCORD_ENABLED ? 'discord' : extraEnv.NODE_ENV ?? 'http'}.log`), output);
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

async function httpChecks(directory, method, result) {
  await withProcess(directory, method, {}, async (output, child) => {
    const base = `http://127.0.0.1:${PORTS.frontend}`;
    await eventually(async () => {
      if (child.exitCode !== null) throw new Error(output());
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
    const assets = JSON.parse(await readFile(join(directory, 'assets.json'), 'utf8'));
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
  });
}

async function tlsChecks(directory, method, result) {
  await configuration(directory, true);
  await withProcess(directory, method, { NODE_ENV: 'production' }, async () => {
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

for (const method of methods) {
  const directory = join(RELEASE, method);
  await Promise.all(Object.values(PORTS).map(freePort));
  await mkdir(directory, { recursive: true });
  const result = { method };
  const checks = {
    http: async () => { await configuration(directory, false); await httpChecks(directory, method, result); },
    discordImportAndDummyLogin: async () => {
      await configuration(directory, false);
      await withProcess(directory, method, { DISCORD_ENABLED: 'true' }, async output => {
        await eventually(() => assert.match(output(), /Bot #0 ログイン失敗/));
      });
    },
    tlsReloadAndInvalidRetention: () => tlsChecks(directory, method, result),
  };
  for (const [name, check] of Object.entries(checks)) {
    try { await check(); result[name] = 'passed'; }
    catch (error) { result[name] = String(error); process.exitCode = 1; }
  }
  await writeFile(join(directory, 'smoke-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
