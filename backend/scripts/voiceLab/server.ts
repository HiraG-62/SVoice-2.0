import express, { type ErrorRequestHandler } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import type { IngameSettings } from '@svoice/shared';
import type { BotManager } from './bots';
import { decisions, type LabState } from './state';
import { NUMERIC_PLAYER_FIELDS } from '../fakeGame';

export const LAB_HOST = '127.0.0.1';
export const DEFAULT_LAB_PORT = 3110;
const name = z.string().min(1).max(100);
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), name, kind: z.enum(['listener', 'bot']) }),
  z.object({ action: z.literal('remove'), name }),
  z.object({ action: z.literal('update'), name, field: z.string(), value: z.number().finite() }),
  z.object({ action: z.literal('include'), name, value: z.boolean() }),
  z.object({ action: z.literal('sending'), value: z.boolean() }),
  z.object({ action: z.literal('listener'), name }),
  z.object({ action: z.literal('speaker'), name, value: z.boolean() }),
  z.object({ action: z.literal('restart'), name }),
]);
interface LabServerOptions {
  state: LabState; bots: BotManager; settings(): IngameSettings | null; startBot(name: string): Promise<void>;
}

export async function listenLab(options: LabServerOptions, port = DEFAULT_LAB_PORT) {
  const { state, bots } = options;
  const app = express();
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const host = request.headers.host;
    const origin = request.headers.origin;
    if (!host || !/^127\.0\.0\.1:\d+$/.test(host) || (origin && origin !== `http://${host}`)) {
      response.status(403).json({ error: '操作元が不正' }); return;
    }
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/', (_request, response) => { response.type('html').send(html); });
  app.get('/api/state', (_request, response) => {
    response.json({ rows: state.rows, listener: state.listener, sending: state.sending,
      frontend: state.frontend, lastSend: state.lastSend, settingsError: state.settingsError,
      fields: NUMERIC_PLAYER_FIELDS, decisions: decisions(state, options.settings()) });
  });
  app.post('/api/action', async (request, response) => {
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: '入力が不正' }); return; }
    try {
      const action = parsed.data;
      switch (action.action) {
        case 'add':
          state.add(action.name, action.kind);
          if (action.kind === 'bot') void options.startBot(action.name);
          break;
        case 'remove': await bots.remove(action.name); break;
        case 'update': state.update(action.name, action.field, action.value); break;
        case 'include': state.include(action.name, action.value); break;
        case 'sending': state.sending = action.value; break;
        case 'listener': state.select(action.name); break;
        case 'speaker': await bots.speaker(action.name, action.value); break;
        case 'restart':
          if (state.find(action.name).kind !== 'bot') throw new Error('ボット以外は操作不可');
          void bots.restart(action.name).catch(() => {});
          break;
      }
      response.json({ ok: true });
    } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : '操作失敗' }); }
  });
  app.use((_request, response) => { response.status(404).json({ error: 'ページなし' }); });
  const onError: ErrorRequestHandler = (_error, _request, response, _next) => { response.status(400).json({ error: '入力が不正' }); };
  app.use(onError);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const server = app.listen(port, LAB_HOST, () => resolve(server));
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return { address, url: `http://${LAB_HOST}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections();
    }) };
}
