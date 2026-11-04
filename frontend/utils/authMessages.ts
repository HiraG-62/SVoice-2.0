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
      return 'Discord 接続待ち。少し待って再読み込み';
    }
  }
  return '参加ロールの確認失敗';
}

export function joinAuthMessage(result: JoinAuthResult): string {
  if (result.locked) return 'ロック中。運営に連絡';
  if (result.ok) return '';
  return `パスワードが違います（残り ${result.remaining} 回）`;
}

export function loginErrorMessage(error: unknown): string {
  if (!error) return '';
  if (error === DISCORD_STARTING) return 'Discord 接続待ち。少し待って再ログイン';
  if (error === 'nickname_missing') return 'Discordサーバーのニックネーム設定に不備があります。';
  if (error === 'member_not_found') return 'Discordサーバーに参加していません。';
  return 'ログインできませんでした。時間を空けてもう一度お試しください。';
}
