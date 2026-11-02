export function encodeMemberName(name: string): string {
  return Array.from(name, character => /^[A-Za-z0-9.-]$/.test(character)
    ? character
    : `_${character.codePointAt(0)!.toString(16).padStart(6, '0')}`).join('');
}

export function decodeMemberName(name: string): string {
  return name.replace(/_([0-9a-f]{6})/gi, (encoded, hex: string) => {
    const point = Number.parseInt(hex, 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : encoded;
  });
}
