/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Used to
 * bound concurrent local-LLM calls — local inference is CPU/GPU-heavy per
 * call, so running many at once just makes several full inference passes
 * fight over the same compute resources instead of finishing faster.
 */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await fn(items[current]);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker)
    );

    return results;
}

export function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
}
