import {
  findPileType,
  maxRadius,
  tierBaseHeight,
  tierHeights,
  type Catalogue,
  type LoadingOptions,
  type Placement,
  type Vehicle,
} from '@pile-on/core';
import {boxFaces, depthOrder, projectedBounds} from '../render/isometric';
import {colourForPileType} from '../render/palette';

/**
 * The whole truck in one axonometric view.
 *
 * Piles are drawn as boxes of their widest diameter rather than as cylinders:
 * at this scale a 168 mm shaft on a 12.5 m deck is a few pixels, and the value
 * of the view is seeing how the tiers stack, not admiring the round ends.
 * The exploded top-down views are where the real geometry gets checked.
 */
export function IsometricPlanSvg({
  vehicle,
  catalogue,
  placements,
  options,
  title,
}: {
  readonly vehicle: Vehicle;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly options: LoadingOptions;
  readonly title: string;
}) {
  const heights = tierHeights(placements, catalogue, options);
  const totalHeight = [...heights.values()].reduce((sum, h) => sum + h, 0);
  const halfWidth = vehicle.deckWidth / 2;

  const bounds = projectedBounds({
    x0: 0,
    x1: vehicle.deckLength,
    y0: -halfWidth,
    y1: halfWidth,
    z0: 0,
    z1: Math.max(totalHeight, 500),
  });

  const deck = boxFaces({
    x0: 0,
    x1: vehicle.deckLength,
    y0: -halfWidth,
    y1: halfWidth,
    z0: -120,
    z1: 0,
  });

  const drawable = placements.flatMap(placement => {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      return [];
    }
    const radius = maxRadius(type);
    const base = tierBaseHeight(placement.tier, heights, options);
    return [
      {
        placement,
        x: placement.x,
        y: placement.y,
        tier: placement.tier,
        faces: boxFaces({
          x0: placement.x,
          x1: placement.x + type.length,
          y0: placement.y - radius,
          y1: placement.y + radius,
          z0: base,
          z1: base + radius * 2,
        }),
        colour: colourForPileType(type.id),
      },
    ];
  });

  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium text-slate-800">
        {title}
      </figcaption>
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        className="w-full rounded border border-slate-300 bg-white"
        role="img"
        aria-label={title}
        data-testid="isometric-plan"
      >
        <polygon
          points={deck.top}
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth={10}
        />
        <polygon
          points={deck.side}
          fill="#cbd5e1"
          stroke="#94a3b8"
          strokeWidth={10}
        />
        <polygon
          points={deck.end}
          fill="#b8c4d4"
          stroke="#94a3b8"
          strokeWidth={10}
        />

        {depthOrder(drawable).map(item => (
          <g key={item.placement.id} data-testid="iso-pile">
            <polygon
              points={item.faces.side}
              fill={item.colour.helix}
              stroke={item.colour.outline}
              strokeWidth={6}
            />
            <polygon
              points={item.faces.end}
              fill={item.colour.end}
              stroke={item.colour.outline}
              strokeWidth={6}
            />
            <polygon
              points={item.faces.top}
              fill={item.colour.shaft}
              stroke={item.colour.outline}
              strokeWidth={6}
            />
          </g>
        ))}
      </svg>
    </figure>
  );
}
