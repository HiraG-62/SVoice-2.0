import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const MAX_JOIN_FAILURES = 5;
const lockSchema = z.object({
  id: z.string().regex(/^\d{17,20}$/), gamerTag: z.string().min(1),
  failures: z.number().int().min(1).max(MAX_JOIN_FAILURES), lockedAt: z.string().nullable(),
});
export type JoinLock = z.infer<typeof lockSchema>;

export function createJoinLockStore(file: string, now: () => Date = () => new Date()) {
  const entries = fs.existsSync(file) ? z.array(lockSchema).parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
  let locks = new Map(entries.map((entry) => [entry.id, entry]));
  const pending = new Map<string, Promise<unknown>>();
  const save = (next: Map<string, JoinLock>) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(Array.from(next.values())));
    fs.renameSync(temporary, file);
    locks = next;
  };

  return {
    get: (id: string) => locks.get(id),
    list: () => Array.from(locks.values()).filter((lock) => lock.failures >= MAX_JOIN_FAILURES),
    fail(id: string, gamerTag: string) {
      const failures = Math.min((locks.get(id)?.failures ?? 0) + 1, MAX_JOIN_FAILURES);
      const entry = { id, gamerTag, failures, lockedAt: failures === MAX_JOIN_FAILURES ? now().toISOString() : null };
      save(new Map(locks).set(id, entry));
      return entry;
    },
    clear(id: string) {
      const next = new Map(locks);
      next.delete(id);
      save(next);
    },
    async withLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
      const previous = pending.get(id) ?? Promise.resolve();
      const current = previous.catch(() => {}).then(operation);
      pending.set(id, current);
      try { return await current; }
      finally { if (pending.get(id) === current) pending.delete(id); }
    },
  };
}
