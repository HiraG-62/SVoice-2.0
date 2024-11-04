export default defineOAuthDiscordEventHandler({
  config: {
    emailRequired: true, // ユーザーのメールアドレスを取得する
  },
  async onSuccess(event, { user, tokens }) {
    const discordId = user.id
    let gamerTag: Response 
    
    try {
      gamerTag = await $fetch(`http://localhost:5000/getUserName?id=${discordId}`)
    } catch(err) {
      console.log(err);
      return sendRedirect(event, '/?error=discrod_nickname_error')
    }


    await setUserSession(event, {
      user: { discordId, gamerTag },
      loggedInAt: new Date(),
    })
    
    return sendRedirect(event, '/');
  },

  onError(event, error) {
    console.error('Discord OAuth error:', error)
    return sendRedirect(event, '/?error=authentication_error')
  },
})