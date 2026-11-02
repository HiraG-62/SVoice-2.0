import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSocketToken, verifySocketToken } from '../src/socketToken';

const secret = 'test-secret';
const payload = { gamerTag: 'Player One', discordId: '123456789012345678', admin: false, exp: 2000 };

describe('Socket 認証トークン', () => {
  it('指定形式で署名し、有効な内容を返す', () => {
    const token = createSocketToken(payload, secret);
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(token).toBe(`${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`);
    expect(verifySocketToken(token, secret, 1000)).toEqual(payload);
  });

  it.each([2000, 2001])('期限切れを拒否する: %s', (now) => {
    expect(verifySocketToken(createSocketToken(payload, secret), secret, now)).toBeNull();
  });

  it('別の秘密鍵と改ざんされた内容を拒否する', () => {
    const token = createSocketToken(payload, secret);
    expect(verifySocketToken(token, 'other', 1000)).toBeNull();
    expect(verifySocketToken(token.replace(token.split('.')[0], Buffer.from(JSON.stringify({ ...payload, admin: true })).toString('base64url')), secret, 1000)).toBeNull();
  });

  it.each(['', 'invalid', 'a.b.c', 'e30.invalid', '!.!', 'e30.'])('形式不正を拒否する: %s', (token) => {
    expect(verifySocketToken(token, secret, 1000)).toBeNull();
  });

  it.each([{ ...payload, gamerTag: '' }, { ...payload, exp: '2000' }, { ...payload, admin: 1 }, { ...payload, discordId: '' }])('署名済みでも不正な型を拒否する', (invalid) => {
    const encoded = Buffer.from(JSON.stringify(invalid)).toString('base64url');
    const token = `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
    expect(verifySocketToken(token, secret, 1000)).toBeNull();
  });
});
