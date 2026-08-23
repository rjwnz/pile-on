/**
 * A pile-type code shown as a colour-coded lozenge. The colour is a pure
 * function of the code, so the same pile type wears the same colour in every
 * table — the pile-type list and the piling schedule — which is what ties a
 * starter to its extensions on sight.
 */

// Literal class strings, not built from the code, so Tailwind sees them. Reds,
// ambers and yellows are left out: those carry meaning elsewhere (errors,
// warnings), and a pile type is not a warning.
const PALETTE = [
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
  'bg-fuchsia-100 text-fuchsia-800',
  'bg-cyan-100 text-cyan-800',
  'bg-teal-100 text-teal-800',
  'bg-indigo-100 text-indigo-800',
  'bg-lime-100 text-lime-800',
] as const;

/** The lozenge colour classes for a pile-type code. */
export function pileTypeColor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

export function PileTypeBadge({code}: {readonly code: string}) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-medium ${pileTypeColor(
        code,
      )}`}
    >
      {code}
    </span>
  );
}
