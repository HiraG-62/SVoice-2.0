import { sendRedirect } from 'nuxt/server';
import { DISCORD_STARTING } from '../../../utils/authMessages';
import { logEvent } from '../../utils/eventLog';

export default defineOAuthDiscordEventHandler({
  config: {
    scope: ['identify'],
  },
  async onSuccess(event, { user }) {
    const config = useRuntimeConfig();
    const discordId = user.id;
    let gamerTag: string;
    let discordAuth: boolean;

    const apiHeaders = {
      'x-api-secret': config.apiSecret
    };

    try {
      gamerTag = await $fetch(`${config.public.server.api.url}/getUserName?id=${discordId}`, {
        headers: apiHeaders
      })
      discordAuth = await $fetch(`${config.public.server.api.url}/checkAdminRole?id=${discordId}`, {
        headers: apiHeaders
      })
    } catch(err) {
      const reason = err && typeof err === 'object' && 'data' in err
        && err.data && typeof err.data === 'object' && 'error' in err.data ? err.data.error : 'internal_error';
      const error = reason === 'nickname_missing' || reason === 'member_not_found' || reason === DISCORD_STARTING ? reason : 'internal_error';
      return sendRedirect(event, `/?error=${error}`)
    }

    await setUserSession(event, {
      user: { discordId, discordAuth, gamerTag },
      loggedInAt: new Date(),
    })
    logEvent(`ログイン: ${gamerTag}${discordAuth ? '（管理者）' : ''}`);
    
    return sendRedirect(event, '/');
  },

  onError(event, error) {
    console.error('Discord OAuth 失敗')
    return sendRedirect(event, '/?error=authentication_error')
  },
})
