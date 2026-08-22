import {radiusProfile, type PlacedPile} from '@pile-on/core';

export interface TierPlanSvgProps {
  /** Deck length in millimetres. */
  readonly deckLength: number;
  /** Deck width in millimetres. */
  readonly deckWidth: number;
  readonly piles: readonly PlacedPile[];
  readonly title: string;
}

/**
 * Top-down view of a single tier, drawn in deck millimetres.
 *
 * The viewBox is the deck itself, so no manual scaling is needed anywhere and
 * the drawing stays exact at any size — which matters, because this is the
 * drawing a yard hand will hold up against a real truck.
 *
 * Each pile is drawn from its radius profile rather than from a bounding box,
 * so the helices show where they actually are. That is the whole point of the
 * exploded per-tier view: you can see at a glance whether plates are staggered.
 */
export function TierPlanSvg({
  deckLength,
  deckWidth,
  piles,
  title,
}: TierPlanSvgProps) {
  const toSvgY = (y: number) => deckWidth / 2 + y;

  return (
    <figure className="w-full">
      <figcaption className="mb-1 text-sm font-medium text-slate-700">
        {title}
      </figcaption>
      <svg
        viewBox={`0 0 ${deckLength} ${deckWidth}`}
        className="w-full rounded border border-slate-300 bg-slate-50"
        role="img"
        aria-label={title}
      >
        <rect
          x={0}
          y={0}
          width={deckLength}
          height={deckWidth}
          className="fill-white stroke-slate-400"
          strokeWidth={12}
        />
        <line
          x1={0}
          y1={deckWidth / 2}
          x2={deckLength}
          y2={deckWidth / 2}
          className="stroke-slate-300"
          strokeWidth={6}
          strokeDasharray="60 60"
        />

        {piles.map(placed =>
          radiusProfile(placed).map((segment, index) => (
            <rect
              key={`${placed.placement.pileId}-${index}`}
              x={segment.start}
              y={toSvgY(placed.placement.y - segment.radius)}
              width={segment.end - segment.start}
              height={segment.radius * 2}
              className={
                segment.kind === 'helix'
                  ? 'fill-amber-400/80 stroke-amber-700'
                  : 'fill-sky-300/80 stroke-sky-800'
              }
              strokeWidth={6}
              data-testid={`segment-${segment.kind}`}
            />
          )),
        )}
      </svg>
    </figure>
  );
}
