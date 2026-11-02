import { describe, expect, it } from 'vitest';
import { advanceScenario, createScenarioState, parseFakeGameArgs, parseReplayLines, renamePlayers, resolveFakeGameEndpoint } from '../scripts/fakeGame';

describe('偽ゲームサーバーの引数', () => {
  it('対話モードと非対話モードを選ぶ', () => {
    expect(parseFakeGameArgs(['Player One', 'Player2']).interactive).toBe(true);
    expect(parseFakeGameArgs(['--no-interactive', 'Player1']).interactive).toBe(false);
    expect(parseFakeGameArgs(['--scenario', 'sweep', 'Player1', 'Player2'])).toMatchObject({ scenario: 'sweep', interactive: false, names: ['Player1', 'Player2'] });
    expect(parseFakeGameArgs(['--replay', 'capture.jsonl', '--rename', 'Old=New', '--rename', 'Other=Another']))
      .toMatchObject({ replay: 'capture.jsonl', renames: { Old: 'New', Other: 'Another' }, interactive: false });
    expect(parseFakeGameArgs(['--scenario', 'walk', '--seed', '42', 'A']).seed).toBe(42);
  });

  it.each([[], ['--scenario', 'unknown', 'A'], ['--scenario', '', 'A'], ['--scenario', 'walk', '--replay', 'a.jsonl'],
    ['--seed', 'abc', 'A'], ['--seed', '', 'A'], ['--rename', 'bad', 'A'], ['--unknown'], ['--scenario']]
    .map((args) => ({ args })))('不正な引数を拒否する: $args', ({ args }) => {
    expect(() => parseFakeGameArgs(args)).toThrow();
  });

  it('受信ポートと上書き先から送信先を決める', () => {
    expect(resolveFakeGameEndpoint({})).toBe('http://localhost:30000/');
    expect(resolveFakeGameEndpoint({ GAME_RECEIVER_PORT: '30100' })).toBe('http://localhost:30100/');
    expect(resolveFakeGameEndpoint({ FAKE_GAME_ENDPOINT: 'http://localhost:32100/' })).toBe('http://localhost:32100/');
  });
});

describe('移動シナリオ', () => {
  it('static は全員同じ位置に置く', () => {
    const { players } = advanceScenario(createScenarioState(['A', 'B'], 1), 'static', 1000);
    expect(players.map(({ x, y, z }) => [x, y, z])).toEqual([[0, 64, 0], [0, 64, 0]]);
  });

  it('sweep は 20 秒周期で 0〜40 を往復する', () => {
    const state = createScenarioState(['A', 'B', 'C'], 1);
    for (const [elapsed, distance] of [[0, 0], [5000, 20], [10000, 40], [20000, 0]]) {
      const { players } = advanceScenario(state, 'sweep', elapsed);
      expect(players[0].x).toBe(0);
      expect(players[1].x).toBeCloseTo(distance);
      expect(players[2].x).toBeCloseTo(distance);
    }
    expect(state.players[1].x).toBe(0);
  });

  it('walk は同じ seed で再現でき、範囲から出ない', () => {
    let first = createScenarioState(['A', 'B'], 42);
    let second = createScenarioState(['A', 'B'], 42);
    for (let i = 0; i < 1000; i++) {
      first = advanceScenario(first, 'walk', i * 200);
      second = advanceScenario(second, 'walk', i * 200);
      for (const player of first.players) {
        expect(Math.abs(player.x)).toBeLessThanOrEqual(40);
        expect(Math.abs(player.z)).toBeLessThanOrEqual(40);
      }
    }
    expect(first).toEqual(second);
    expect(first.players).not.toEqual(createScenarioState(['A', 'B'], 42).players);
    expect(first).not.toEqual(advanceScenario(createScenarioState(['A', 'B'], 43), 'walk', 0));
  });
});

describe('capture の replay', () => {
  it('json を優先し、rawBody へフォールバックして受信時刻の間隔を保つ', () => {
    const frames = parseReplayLines([
      JSON.stringify({ receivedAt: '2026-11-03T00:00:00.000Z', json: [{ name: 'Old', x: 1 }], rawBody: 'ignored' }),
      '',
      JSON.stringify({ receivedAt: '2026-11-03T00:00:00.350Z', rawBody: '[{"name":"Old","x":2}]' }),
      JSON.stringify({ receivedAt: '2026-11-03T00:00:00.550Z', rawBody: 'invalid json' }),
    ].join('\n'), { Old: 'New' });
    expect(frames).toEqual([
      { delayMs: 0, body: '[{"name":"New","x":1}]' },
      { delayMs: 350, body: '[{"name":"New","x":2}]' },
      { delayMs: 200, body: 'invalid json' },
    ]);
  });

  it('名前以外の値と元の配列を保つ', () => {
    const original = [{ name: 'Old', telephone: 12 }, { name: 'Other' }, null];
    expect(renamePlayers(original, { Old: 'New' })).toEqual([{ name: 'New', telephone: 12 }, { name: 'Other' }, null]);
    expect(original[0]?.name).toBe('Old');
    expect(renamePlayers({ other: true }, {})).toEqual({ other: true });
  });

  it.each(['', 'bad json', '{}', '{"receivedAt":"invalid","json":[]}', '{"receivedAt":"2026-11-03T00:00:00Z"}',
    '{"receivedAt":"2026-11-03T00:00:01Z","json":[]}\n{"receivedAt":"2026-11-03T00:00:00Z","json":[]}'])
    ('無効な記録を拒否する: %s', (input) => {
      expect(() => parseReplayLines(input)).toThrow();
    });
});
