import {
  findPileType,
  maxRadius,
  radiusProfile,
  tierBaseHeight,
  tierHeights,
  type Catalogue,
  type LoadingOptions,
  type Placement,
  type Vehicle,
} from '@pile-on/core';
import {
  boxFaces,
  cylinderAlongDeck,
  depthOrder,
  projectedBounds,
  type Cylinder,
} from '../render/isometric';
import {colourForPileType} from '../render/palette';

/**
 * One cylinder: a lit upper half, a shaded lower half and an elliptical end
 * cap. Two flat tones rather than a gradient — it reads as round at a glance,
 * survives being printed in greyscale, and needs no `<defs>` plumbing.
 */
function Tube({
  cylinder,
  lit,
  shaded,
  cap,
  outline,
  testId,
}: {
  readonly cylinder: Cylinder;
  readonly lit: string;
  readonly shaded: string;
  readonly cap: string;
  readonly outline: string;
  readonly testId?: string;
}) {
  return (
    <g data-testid={testId ?? undefined}>
      <path d={cylinder.shaded} fill={shaded} />
      <path d={cylinder.lit} fill={lit} />
      <path
        d={cylinder.silhouette}
        fill="none"
        stroke={outline}
        strokeWidth={6}
      />
      <ellipse
        cx={cylinder.capCx}
        cy={cylinder.capCy}
        rx={cylinder.capRx}
        ry={cylinder.capRy}
        transform={`rotate(${cylinder.capRotation} ${cylinder.capCx} ${cylinder.capCy})`}
        fill={cap}
        stroke={outline}
        strokeWidth={6}
      />
    </g>
  );
}

/**
 * The whole truck in one axonometric view.
 *
 * Piles are drawn as what they are: a shaft cylinder with helix plates on it,
 * each plate a short fat cylinder at its own station. Drawing the plates
 * matters — the whole reason a load packs the way it does is where they sit,
 * and a stack of featureless boxes hides exactly the thing worth looking at.
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
    /*
     * The pile rests on the tier below, so its axis sits one widest-radius up.
     * Using the widest radius rather than the shaft radius keeps a helix plate
     * from cutting through the deck.
     */
    const axisZ =
      tierBaseHeight(placement.tier, heights, options) + maxRadius(type);

    return [
      {
        placement,
        x: placement.x,
        y: placement.y,
        tier: placement.tier,
        colour: colourForPileType(type.id),
        shaft: cylinderAlongDeck(
          placement.x,
          placement.x + type.length,
          placement.y,
          axisZ,
          type.shaftRadius,
        ),
        // Plates ordered along the deck, so the nearer ones are drawn last.
        plates: radiusProfile({type, placement})
          .filter(segment => segment.kind === 'helix')
          .sort((a, b) => a.start - b.start)
          .map(segment =>
            cylinderAlongDeck(
              segment.start,
              segment.end,
              placement.y,
              axisZ,
              segment.radius,
            ),
          ),
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
            <Tube
              cylinder={item.shaft}
              lit={item.colour.shaft}
              shaded={item.colour.helix}
              cap={item.colour.end}
              outline={item.colour.outline}
            />
            {item.plates.map((plate, index) => (
              <Tube
                key={index}
                cylinder={plate}
                lit={item.colour.helix}
                shaded={item.colour.end}
                cap={item.colour.end}
                outline={item.colour.outline}
                testId="iso-helix"
              />
            ))}
          </g>
        ))}
      </svg>
    </figure>
  );
}
