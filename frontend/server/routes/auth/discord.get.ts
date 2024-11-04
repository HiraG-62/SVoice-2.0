export default defineOAuthDiscordEventHandler({
  config: {
    emailRequired: true, // ユーザーのメールアドレスを取得する
  },
  async onSuccess(event, { user, tokens }) {
    const config = useRuntimeConfig();
    const discordId = user.id;
    let gamerTag: Response;
    let discordAuth: Response;
    
    try {
      gamerTag = await $fetch(`${config.public.server.api.url}/getUserName?id=${discordId}`)
      discordAuth = await $fetch(`${config.public.server.api.url}/checkAdminRole?id=${discordId}`)
    } catch(err) {
      console.log(err);
      return sendRedirect(event, '/?error=discrod_nickname_error')
    }

    await setUserSession(event, {
      user: { discordId, discordAuth, gamerTag },
      loggedInAt: new Date(),
    })
    
    return sendRedirect(event, '/');
  },

  onError(event, error) {
    console.error('Discord OAuth error:', error)
    return sendRedirect(event, '/?error=authentication_error')
  },
})