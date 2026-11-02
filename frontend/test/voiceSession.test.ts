import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createVoiceSession } from '../composables/useVoice';
import { createVoiceRoom } from '../services/voiceRoom';
import { useCallStore } from '../stores/call';
import type { createSocketSession } from '../utils/socketSession';

vi.mock('@timephy/rnnoise-wasm', () => ({ NoiseSuppressorWorklet_Name: 'noise' }));
vi.mock('@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url', () => ({ default: 'noise-url' }));
vi.mock('../services/voiceRoom', () => ({ createVoiceRoom: vi.fn() }));
vi.mock('../services/mic', () => ({ createMicService: () => ({
  prepare: vi.fn(), update: vi.fn(), dispose: vi.fn(), ready: true,
  context: { state: 'running' }, destination: {}, media: { getAudioTracks: () => [] },
}) }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('参加処理の取り消し', () => {
  it('古い参加処理の結果で新しい一覧を上書きしない', async () => {
    setActivePinia(createPinia());
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => [] } });
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ token: 'token', memberName: 'Alice', roomName: 'test' }));
    const socket = { leave: vi.fn(), join: vi.fn(), debug: vi.fn() } as unknown as ReturnType<typeof createSocketSession>;
    let ports!: Parameters<typeof createVoiceRoom>[1];
    let complete!: (room: Awaited<ReturnType<typeof createVoiceRoom>>) => void;
    vi.mocked(createVoiceRoom).mockImplementationOnce(async (_credentials, callbacks) => {
      ports = callbacks;
      return new Promise(resolve => { complete = resolve; });
    });
    const call = useCallStore(); call.identify('Alice');
    const session = createVoiceSession(socket);
    try {
      const pending = session.join();
      await vi.waitFor(() => expect(createVoiceRoom).toHaveBeenCalledOnce());
      await session.leave();
      call.addUser('Bob');
      ports.removeUser('Bob');
      ports.addUser('Charlie');
      ports.nearby('Bob', true, 2);
      expect(call.users).toEqual([{ gamerTag: 'Bob', gain: 1 }]);
      expect(call.nearby).toEqual([]);
      const dispose = vi.fn();
      complete({ dispose } as unknown as Awaited<ReturnType<typeof createVoiceRoom>>);
      await pending;
      expect(dispose).toHaveBeenCalledOnce();
      expect(socket.join).not.toHaveBeenCalled();
    } finally { await session.dispose(); }
  });
});
