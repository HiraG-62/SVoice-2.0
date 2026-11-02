import { createSocketToken } from '@svoice/shared/socket-token';
import { isAdmin, requireUser } from '../utils/user';

const SOCKET_TOKEN_LIFETIME_MS = 60_000;

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { token: createSocketToken({
    gamerTag: user.gamerTag, discordId: user.discordId,
    admin: await isAdmin(event), exp: Date.now() + SOCKET_TOKEN_LIFETIME_MS,
  }, useRuntimeConfig(event).apiSecret) };
});
