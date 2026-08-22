import {
  findPileType,
  radiusProfile,
  toMetres,
  type Catalogue,
  type Placement,
  type Vehicle,
} from '@pile-on/core';
import {colourForPileType} from '../render/palette';

const LABEL_BAND = 420;

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
}: {
  readonly vehicle: Vehicle;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly tier: number;
  readonly title: string;
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
