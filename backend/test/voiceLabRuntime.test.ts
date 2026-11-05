import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, vi } from 'vitest';
import { startVoiceLab } from '../scripts/voiceLab/runtime';
import settings from '../../frontend/settings/default.json';

test('frontend の準備待ち・定期送信・停止・ボットと HTTP の終了', async () => {
  let frontendReady = false;
  const bodies: unknown[] = [], secrets: (string | string[] | undefined)[] = [];
  const frontend = createServer(async (request, response) => {
    if (request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
      secrets.push(request.headers['x-api-secret']);
      response.end(); return;
    }
    if (!frontendReady) { response.writeHead(503).end(); return; }
    response.setHeader('content-type', 'application/json');
    response.end(request.url === '/api/getSetting' ? JSON.stringify(settings) : '{}');
  });
  await new Promise<void>(resolve => frontend.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(frontend.address() as AddressInfo).port}`;
  const close = vi.fn(async () => {});
  const launch = vi.fn(async () => ({ close, speaker: async () => {},
    inspect: async () => ({ joined: true, speaker: false, muted: false }) }));
  const lab = await startVoiceLab({ listeners: ['Alice'], bots: ['Bot'], frontend: url, endpoint: url,
    secret: 'test-secret', port: 0 }, { launch });
  try {
    expect(lab.state.frontend).toBe('frontend 待ち');
    expect(launch).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    expect(secrets[0]).toBe('test-secret');
    frontendReady = true;
    await vi.waitFor(() => expect(lab.state.find('Bot').bot?.status).toBe('joined'), { timeout: 3_000 });
    const snapshot = await (await fetch(`${lab.url}/api/state`)).text();
    expect(snapshot).not.toContain('test-secret');
    expect(JSON.parse(snapshot).decisions[0].subscribe).toBe(true);
    lab.state.sending = false;
    const count = bodies.length;
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(bodies.length).toBe(count);
  } finally {
    await lab.close();
    await new Promise<void>(resolve => frontend.close(() => resolve()));
  }
  expect(close).toHaveBeenCalledTimes(1);
  await expect(fetch(lab.url)).rejects.toThrow();
});
