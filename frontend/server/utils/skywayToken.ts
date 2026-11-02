import { SkyWayAuthToken, nowInSec, uuidV4 } from '@skyway-sdk/token';
import { encodeMemberName } from '@svoice/shared';

const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

export function issueSkywayToken(appId: string, secret: string, roomName: string, gamerTag: string) {
  const memberName = encodeMemberName(gamerTag);
  const issuedAt = nowInSec();
  const token = new SkyWayAuthToken({
    jti: uuidV4(), iat: issuedAt, exp: issuedAt + TOKEN_LIFETIME_SECONDS,
    scope: { app: {
      id: appId, turn: true, actions: ['read'],
      channels: [{
        name: roomName, actions: ['write'],
        members: [{
          name: memberName, actions: ['write'],
          publication: { actions: ['write'] }, subscription: { actions: ['write'] },
        }],
        sfuBots: [{ actions: ['write'], forwardings: [{ actions: ['write'] }] }],
      }],
    } },
  }).encode(secret);
  return { token, roomName, memberName };
}
