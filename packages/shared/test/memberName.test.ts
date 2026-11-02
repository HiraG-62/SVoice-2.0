import { describe, expect, it } from 'vitest';
import { encodeMemberName, decodeMemberName } from '../src/memberName';

describe('SkyWay メンバー名', () => {
  it.each(['Alice', 'Alice Bob', 'a_b', '日本語😀', 'a.b-c', '....__..__._..', '_000020', '!@#$%/\\', ''])('%s を衝突せず元へ戻す', (name) => {
    const encoded = encodeMemberName(name);
    expect(encoded).toMatch(/^[A-Za-z0-9._-]*$/);
    expect(decodeMemberName(encoded)).toBe(name);
  });
  it('空白とアンダースコアを固定長で変換する', () => {
    expect(encodeMemberName('Alice Bob')).toBe('Alice_000020Bob');
    expect(encodeMemberName('a_b')).toBe('a_00005fb');
    expect(encodeMemberName('_000020')).not.toBe(encodeMemberName(' '));
  });
});
