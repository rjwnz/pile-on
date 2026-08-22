/**
 * The one grouping helper.
 *
 * Sorting a flat list into buckets — placements by tier, by consignment, piles
 * by type — is the most repeated shape in this codebase. It had been written
 * out by hand seven times, and three of those spread the bucket back into a new
 * array on every item, which turns grouping n placements into O(n²) for no
 * reason a reader would ever guess at.
 */
export function groupBy<T, K>(
  items: Iterable<T>,
  key: (item: T) => K,
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const bucket = grouped.get(key(item));
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(key(item), [item]);
    }
  }
  return grouped;
}
