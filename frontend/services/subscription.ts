interface SubscriptionPorts {
  exists(): boolean;
  active(id: string): boolean;
  subscribe(): Promise<string>;
  unsubscribe(id: string): Promise<void>;
  attach(id: string): void;
  cleanup(): void;
}

export function createSubscriptionController(ports: SubscriptionPorts) {
  let id: string | undefined;
  let disposed = false;
  let wanted = false;
  let busy = false;

  function cleanup() {
    if (!id) return;
    id = undefined;
    ports.cleanup();
  }

  async function sync(shouldReceive: boolean) {
    wanted = shouldReceive;
    if (disposed || busy) return;
    busy = true;
    try {
      if (id && !ports.active(id)) cleanup();
      if (id && (!wanted || !ports.exists())) {
        const old = id;
        cleanup();
        await ports.unsubscribe(old);
      }
      if (disposed || id || !wanted || !ports.exists()) return;
      const next = await ports.subscribe();
      if (disposed || !wanted || !ports.exists() || !ports.active(next)) {
        await ports.unsubscribe(next);
        return;
      }
      id = next;
      try {
        ports.attach(next);
      } catch (error) {
        cleanup();
        await ports.unsubscribe(next);
        throw error;
      }
    } finally {
      busy = false;
    }
  }

  async function dispose() {
    disposed = true;
    wanted = false;
    const old = id;
    cleanup();
    if (old && ports.active(old)) await ports.unsubscribe(old);
  }

  return { sync, dispose, get id() { return id; }, get busy() { return busy; } };
}
