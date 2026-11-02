import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const payloadSchema = z.object({
  gamerTag: z.string().min(1), discordId: z.string().min(1),
  admin: z.boolean(), exp: z.number().finite(),
});
export type SocketTokenPayload = z.infer<typeof payloadSchema>;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function createSocketToken(payload: SocketTokenPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySocketToken(token: string, secret: string, now = Date.now()): SocketTokenPayload | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((part) => BASE64URL_PATTERN.test(part))) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;
  const received = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', secret).update(encoded).digest();
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  if (received.toString('base64url') !== signature) return null;
  try {
    const result = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
    if (!result.success || result.data.exp <= now) return null;
    return result.data;
  } catch {
    return null;
  }
}
