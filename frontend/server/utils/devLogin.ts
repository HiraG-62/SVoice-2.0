import { createHash } from 'node:crypto';

const MAX_GAMER_TAG_LENGTH = 100;
const DEV_ID_MIN = BigInt('100000000000000000');
const DEV_ID_RANGE = BigInt('900000000000000000');

export function isDevLoginEnabled(dev: boolean, enabled: unknown): boolean {
  return dev && (enabled === true || enabled === 'true');
}

export function createDevDiscordId(gamerTag: string): string {
  const hash = createHash('sha256').update(gamerTag).digest('hex');
  return String(DEV_ID_MIN + BigInt(`0x${hash}`) % DEV_ID_RANGE);
}

export function parseDevLogin(body: unknown): { gamerTag: string; admin: boolean } | null {
  if (typeof body !== 'object' || body === null) return null;
  if (!('gamerTag' in body) || typeof body.gamerTag !== 'string') return null;
  if (body.gamerTag.length === 0 || body.gamerTag.length > MAX_GAMER_TAG_LENGTH) return null;
  if (!('admin' in body) || typeof body.admin !== 'boolean') return null;
  return { gamerTag: body.gamerTag, admin: body.admin };
}
