import {pileName, toMetres, type PackSummary} from '@pile-on/core';

/**
 * One pack's contents, one line per length aboard: "3 × SS200 starter
 * (6.00 m)". The drawing's hover card stacks these; the table runs them
 * together.
 */
export function packContentsLines(summary: PackSummary): string[] {
  if (summary.contents.length === 0) {
    return ['nothing the catalogue recognises'];
  }
  return summary.contents.map(
    content =>
      `${content.count} × ${pileName(content.code, content.part)} (${toMetres(content.length).toFixed(2)} m)`,
  );
}

/** One pack's contents as a line of text: "3 × SS200 starter (6.00 m)". */
export function packContentsLine(summary: PackSummary): string {
  return packContentsLines(summary).join(', ');
}

/**
 * One pack's dunnage as a line of text: "2 × 200 mm". The count is the point
 * — a pack rides on two timbers at least, and the table is where a loader
 * counts them off against the drawing.
 */
export function bearerLine(summary: PackSummary): string {
  if (summary.bearers.length === 0) {
    return `no bearers — ${summary.dunnage} mm timbers will not land`;
  }
  return `${summary.bearers.length} × ${summary.dunnage} mm`;
}

/**
 * The text breakdown of one deck's packs: what travels banded with what,
 * where it rides, and what it weighs — the list the yard actually bands and
 * slings from. Ids match the labels on the tier drawings.
 */
export function PackManifestTable({
  manifest,
}: {
  readonly manifest: readonly PackSummary[];
}) {
  if (manifest.length === 0) {
    return null;
  }

  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium text-slate-800">
        Packs ({manifest.length})
      </figcaption>
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          data-testid="pack-manifest"
        >
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-medium">Pack</th>
              <th className="py-1 pr-3 font-medium">Tier</th>
              <th className="py-1 pr-3 font-medium">Contents</th>
              <th className="py-1 pr-3 font-medium">Length</th>
              <th className="py-1 pr-3 font-medium">Width</th>
              <th className="py-1 pr-3 font-medium">Mass</th>
              <th className="py-1 font-medium">Bearers</th>
            </tr>
          </thead>
          <tbody>
            {manifest.map(summary => (
              <tr
                key={summary.id}
                className="border-b border-slate-200 align-top"
              >
                <td className="py-1 pr-3 font-medium text-slate-900">
                  {summary.id}
                </td>
                <td className="py-1 pr-3 tabular-nums text-slate-700">
                  {summary.tier + 1}
                </td>
                <td className="py-1 pr-3 text-slate-700">
                  {packContentsLine(summary)}
                </td>
                <td className="py-1 pr-3 tabular-nums text-slate-700">
                  {toMetres(summary.length).toFixed(2)} m
                </td>
                <td className="py-1 pr-3 tabular-nums text-slate-700">
                  {toMetres(summary.width).toFixed(2)} m
                </td>
                <td className="py-1 pr-3 tabular-nums text-slate-700">
                  {Math.round(summary.mass).toLocaleString('en-NZ')} kg
                </td>
                <td className="py-1 tabular-nums text-slate-700">
                  {bearerLine(summary)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
