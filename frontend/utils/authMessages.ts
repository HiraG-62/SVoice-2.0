export interface JoinAuthResult {
  ok: boolean;
  locked: boolean;
  remaining: number;
}

export function joinAuthMessage(result: JoinAuthResult): string {
  if (result.locked) return 'ロック中。運営に連絡';
  if (result.ok) return '';
  return `パスワードが違います（残り ${result.remaining} 回）`;
}

export function loginErrorMessage(error: unknown): string {
  if (!error) return '';
  if (error === 'nickname_missing') return 'Discordサーバーのニックネーム設定に不備があります。';
  if (error === 'member_not_found') return 'Discordサーバーに参加していません。';
  return 'ログインできませんでした。時間を空けてもう一度お試しください。';
}
