import { AsyncLocalStorage } from "node:async_hooks";

// Dev-only Prisma op counter (Prisma Postgres bills per operation). Turned
// on by LOG_DB_QUERIES=1 outside production; see lib/prisma.ts.
export const queryCountEnabled = process.env.LOG_DB_QUERIES === "1" && process.env.NODE_ENV !== "production";

type Run = { label: string; ops: Map<string, number> };

const runs = new AsyncLocalStorage<Run>();

export function recordQuery(model: string | undefined, operation: string) {
    const name = model ? `${model}.${operation}` : operation;
    const run = runs.getStore();

    if (!run) {
        console.log(`[db] unscoped ${name}`);
        return;
    }

    run.ops.set(name, (run.ops.get(name) ?? 0) + 1);
}

function logRun(run: Run) {
    const total = [...run.ops.values()].reduce((sum, count) => sum + count, 0);
    const detail = [...run.ops].map(([name, count]) => `${name}×${count}`).join(", ");

    console.log(`[db] ${run.label}: ${total} ops${detail ? ` (${detail})` : ""}`);
}

// Counts the Prisma ops made while `fn` runs and logs them under `label`
// when it settles. A pass-through when counting is off.
export function countQueries<A extends unknown[], R>(
    label: string,
    fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
    if (!queryCountEnabled) return fn;

    return (...args: A) => {
        const run: Run = { label, ops: new Map() };

        // Awaited inside run(): a Prisma query is lazy and would otherwise
        // execute (from .finally) outside the store.
        return runs.run(run, async () => await fn(...args)).finally(() => logRun(run));
    };
}
