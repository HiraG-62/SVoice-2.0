import { describe, expect, it, vi } from 'vitest';
import { createVoiceRoom } from '../services/voiceRoom';

const sdk = vi.hoisted(() => ({
  context: { dispose: vi.fn() },
  room: { dispose: vi.fn(), join: vi.fn() },
  member: { leave: vi.fn(), publish: vi.fn() },
}));
vi.mock('@skyway-sdk/room', () => ({
  SkyWayContext: { Create: async () => sdk.context },
  SkyWayRoom: { FindOrCreate: async () => sdk.room },
  LocalAudioStream: class {},
}));

describe('参加失敗時の SkyWay の後始末', () => {
  it('配信とleaveが失敗してもroomとcontextを解放する', async () => {
    sdk.room.join.mockResolvedValue(sdk.member);
    sdk.member.publish.mockRejectedValue(new Error('配信失敗'));
    sdk.member.leave.mockRejectedValue(new Error('退出失敗'));
    const ports = { destination: { stream: { getAudioTracks: () => [{}] } } } as unknown as Parameters<typeof createVoiceRoom>[1];
    await expect(createVoiceRoom({ token: 'test', roomName: 'test', memberName: 'Alice' }, ports)).rejects.toThrow();
    expect(sdk.room.dispose).toHaveBeenCalledOnce();
    expect(sdk.context.dispose).toHaveBeenCalledOnce();
  });
});
