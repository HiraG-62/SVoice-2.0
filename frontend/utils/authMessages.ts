export interface JoinAuthResult {
  ok: boolean;
  locked: boolean;
  remaining: number;
}

export const DISCORD_STARTING = 'discord_starting';

export function joinRoleErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const status = 'statusCode' in error ? error.statusCode : 'status' in error ? error.status : undefined;
    const data = 'data' in error ? error.data : undefined;
    if (status === 503 && data && typeof data === 'object' && 'error' in data && data.error === DISCORD_STARTING) {
      return 'Discord接続待ちです。時間を空けて再読み込みしてください。';
    }
  }
  return '参加ロールの確認に失敗しました。';
}

export function joinAuthMessage(result: JoinAuthResult): string {
  if (result.locked) return 'ロックされています。運営に連絡してください。';
  if (result.ok) return '';
  return `パスワードが違います（残り ${result.remaining} 回）`;
}

export function loginErrorMessage(error: unknown): string {
  if (!error) return '';
  if (error === DISCORD_STARTING) return 'Discord接続待ちです。時間を空けて再ログインしてください。';
  if (error === 'nickname_missing') return 'Discordサーバーのニックネーム設定に不備があります。';
  if (error === 'member_not_found') return 'Discordサーバーに参加していません。';
  return 'ログインできませんでした。時間を空けてもう一度お試しください。';
}
