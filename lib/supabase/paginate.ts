/**
 * PostgREST caps every response at 1,000 rows by default and gives no signal
 * that it truncated — a query over the holdings table silently returns a third
 * of the data and looks successful. Any query that can exceed 1,000 rows must
 * page through explicitly.
 */
const PAGE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
}
