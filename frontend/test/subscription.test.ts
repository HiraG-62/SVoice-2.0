import { describe, expect, it, vi } from 'vitest';
import { createSubscriptionController } from '../services/subscription';

function setup() {
  const active = new Set<string>();
  let live = true;
  let next = 0;
  const subscribe = vi.fn(async () => { const id = String(++next); active.add(id); return id; });
  const unsubscribe = vi.fn(async (id: string) => { active.delete(id); });
  const attach = vi.fn(), cleanup = vi.fn();
  const controller = createSubscriptionController({
    exists: () => live, active: id => active.has(id), subscribe, unsubscribe, attach, cleanup,
  });
  return { controller, active, subscribe, unsubscribe, attach, cleanup, unpublish: () => { live = false; } };
}
describe('SkyWay の購読同期', () => {
  it('消えたsubscriptionを同じサイクルで購読し直す', async () => {
    const { controller, active, subscribe, cleanup } = setup();
    await controller.sync(true);
    active.clear();
    await controller.sync(true);
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('unpublish後に購読しない', async () => {
    const { controller, unpublish, subscribe } = setup();
    unpublish();
    await controller.sync(true);
    expect(subscribe).not.toHaveBeenCalled();
  });
  it('破棄後に遅れて完了した購読を捨てる', async () => {
    const { controller, subscribe, unsubscribe, attach } = setup();
    let complete!: (id: string) => void;
    subscribe.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const pending = controller.sync(true);
    await controller.dispose();
    complete('late');
    await pending;
    expect(unsubscribe).toHaveBeenCalledWith('late');
    expect(attach).not.toHaveBeenCalled();
  });
  it('購読中に条件がfalseになった結果を再生しない', async () => {
    const { controller, subscribe, attach, unsubscribe } = setup();
    let complete!: (id: string) => void;
    subscribe.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const pending = controller.sync(true);
    await controller.sync(false);
    complete('late');
    await pending;
    expect(attach).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledWith('late');
  });
  it('繰り返し退出しても後始末は冪等', async () => {
    const { controller, unsubscribe } = setup();
    await controller.sync(true);
    await controller.dispose();
    await controller.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
