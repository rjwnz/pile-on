/** Sort a flat list into buckets — the most repeated shape in this codebase. */
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
