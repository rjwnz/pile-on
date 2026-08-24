import {
  findPileType,
  layersOf,
  packLateralSpan,
  packWidth,
  radiusProfile,
  toMetres,
  type Catalogue,
  type PackSummary,
  type Placement,
  type Vehicle,
} from '@pile-on/core';
import {colourForPileType} from '../render/palette';
import {bearerLine, packContentsLine} from './PackManifestTable';

const LABEL_BAND = 420;

/** Sawn timber, so the bearers read as timber and not as more steel. */
const BEARER_FILL = '#c9a227';
const BEARER_STROKE = '#8a6d1f';

/** How far a timber sticks out past the steel it carries, in the drawing.
 * Real bearers run a little proud of the pack; drawn flush they vanish under
 * the shafts. */
const BEARER_OVERHANG = 60;

/**
 * One tier of one truck, seen from above, drawn in deck millimetres — the
 * viewBox is the deck itself, so the drawing stays exact at any size. Piles
 * come from their radius profile, so the plates appear where they actually
 * are; seeing them stagger is the point of the exploded view.
 */
export function TierPlanSvg({
  vehicle,
  catalogue,
  placements,
  tier,
  title,
  packs = [],
}: {
  readonly vehicle: Vehicle;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly tier: number;
  readonly title: string;
  /** The deck's pack manifest, so outlines carry the same ids the table
   * lists. Optional: without it the outlines fall back to widths alone. */
  readonly packs?: readonly PackSummary[];
}) {
  const halfWidth = vehicle.deckWidth / 2;
  const toSvgY = (y: number) => halfWidth + y;

  return (
    <figure className="space-y-1">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-800">{title}</span>
        <span className="text-xs text-slate-500">
          {placements.length} {placements.length === 1 ? 'pile' : 'piles'}
        </span>
      </figcaption>

      <svg
        viewBox={`${-LABEL_BAND} ${-LABEL_BAND} ${vehicle.deckLength + LABEL_BAND * 2} ${vehicle.deckWidth + LABEL_BAND * 2}`}
        className="w-full rounded border border-slate-300 bg-white"
        role="img"
        aria-label={`${title}, ${placements.length} piles`}
        data-testid={`tier-plan-${tier}`}
      >
        <rect
          x={0}
          y={0}
          width={vehicle.deckLength}
          height={vehicle.deckWidth}
          className="fill-slate-50 stroke-slate-400"
          strokeWidth={14}
        />

        {/* Headboard — the front tier is butted up against it. */}
        <rect
          x={-70}
          y={0}
          width={70}
          height={vehicle.deckWidth}
          className="fill-slate-500"
        />

        <line
          x1={0}
          y1={halfWidth}
          x2={vehicle.deckLength}
          y2={halfWidth}
          className="stroke-slate-300"
          strokeWidth={8}
          strokeDasharray="80 80"
        />

        {/* Each pack's band: the bundle that is slung and stacked as one. */}
        {[...(layersOf(placements).get(tier)?.entries() ?? [])].map(
          ([pack, inPack]) => {
            const span = packLateralSpan(inPack, catalogue);
            if (!span) {
              return null;
            }
            const resolved = inPack.filter(placement =>
              findPileType(catalogue, placement.pileTypeId),
            );
            const left = Math.min(...resolved.map(p => p.x));
            const right = Math.max(
              ...resolved.map(
                p => p.x + findPileType(catalogue, p.pileTypeId)!.length,
              ),
            );
            const summary = packs.find(
              entry => entry.tier === tier && entry.pack === pack,
            );
            const width = toMetres(packWidth(inPack, catalogue)).toFixed(2);
            return (
              <g key={`pack-${pack}`}>
                {summary ? (
                  <title>
                    {`${summary.id} — ${packContentsLine(summary)} · ${toMetres(summary.length).toFixed(2)} m × ${toMetres(summary.width).toFixed(2)} m · ${Math.round(summary.mass)} kg · on ${bearerLine(summary)}`}
                  </title>
                ) : null}
                <rect
                  x={left - 40}
                  y={toSvgY(span[0]) - 40}
                  width={right - left + 80}
                  height={span[1] - span[0] + 80}
                  fill="none"
                  className="stroke-slate-400"
                  strokeWidth={10}
                  strokeDasharray="60 60"
                  data-testid={`pack-outline-${pack}`}
                />
                <text
                  x={left + 120}
                  y={toSvgY(span[0]) - 100}
                  className="fill-slate-500"
                  fontSize={180}
                >
                  {summary ? `${summary.id} · ${width} m` : `${width} m pack`}
                </text>
              </g>
            );
          },
        )}

        {/*
          Every timber under this tier, from the same derivation the packer
          and the validator use — a pack must land on two of them, and this
          is where you can see that it does.
        */}
        {packs
          .filter(summary => summary.tier === tier)
          .flatMap(summary =>
            summary.bearers.map((bearer, index) => (
              <rect
                key={`bearer-${summary.id}-${index}`}
                x={bearer.x}
                y={toSvgY(bearer.span[0]) - BEARER_OVERHANG}
                width={bearer.width}
                height={bearer.span[1] - bearer.span[0] + BEARER_OVERHANG * 2}
                fill={BEARER_FILL}
                stroke={BEARER_STROKE}
                strokeWidth={8}
                data-testid="bearer"
              >
                <title>
                  {`${summary.id} bearer ${index + 1} of ${summary.bearers.length} — ${bearer.thickness} mm timber, ${Math.round(bearer.x)} mm along the deck`}
                </title>
              </rect>
            )),
          )}

        {placements.map(placement => {
          const type = findPileType(catalogue, placement.pileTypeId);
          if (!type) {
            return null;
          }
          const colour = colourForPileType(type.id);
          return radiusProfile({type, placement}).map((segment, index) => (
            <rect
              key={`${placement.id}-${index}`}
              x={segment.start}
              y={toSvgY(placement.y - segment.radius)}
              width={segment.end - segment.start}
              height={segment.radius * 2}
              fill={segment.kind === 'helix' ? colour.helix : colour.shaft}
              stroke={colour.outline}
              strokeWidth={8}
              data-testid={`segment-${segment.kind}`}
            />
          ));
        })}

        <text
          x={vehicle.deckLength / 2}
          y={-140}
          textAnchor="middle"
          className="fill-slate-500"
          fontSize={220}
        >
          {toMetres(vehicle.deckLength).toFixed(2)} m deck
        </text>
        <text
          x={-140}
          y={halfWidth}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-500"
          fontSize={220}
          transform={`rotate(-90 ${-140} ${halfWidth})`}
        >
          {toMetres(vehicle.deckWidth).toFixed(2)} m
        </text>
      </svg>
    </figure>
  );
}
