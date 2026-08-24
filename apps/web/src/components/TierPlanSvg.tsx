import {useState, type MouseEvent} from 'react';
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
import {bearerLine, packContentsLines} from './PackManifestTable';

const LABEL_BAND = 420;

/** Sawn timber, so the bearers read as timber and not as more steel. */
const BEARER_FILL = '#c9a227';
const BEARER_STROKE = '#8a6d1f';

/** How far a timber sticks out past the steel it carries, in the drawing.
 * Real bearers run a little proud of the pack; drawn flush they vanish under
 * the shafts. */
const BEARER_OVERHANG = 60;

/** How far the card sits off the pointer, so it never hides what you pointed at. */
const CARD_OFFSET = 14;

/**
 * What hovering one part of the drawing says. Native SVG `<title>` tooltips
 * were what this used to lean on, and they are the wrong tool: the browser
 * takes a second to decide to show one, renders it in a system font too small
 * to read a pack off, and drops it entirely once the pointer moves within the
 * same shape. A card we draw ourselves appears at once and can stack a pack's
 * lengths one per line, which is the whole point of pointing at a pack.
 */
interface HoverCard {
  readonly heading: string;
  readonly lines: readonly string[];
  readonly footer: string;
}

/** Where the card is, in pixels down and across the drawing's own box. */
interface HoverState {
  readonly card: HoverCard;
  readonly x: number;
  readonly y: number;
  /** Near the right edge or the bottom, the card opens back the other way. */
  readonly flip: boolean;
  readonly lift: boolean;
}

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
  const onTier = packs.filter(summary => summary.tier === tier);
  const summaryFor = (pack: number) =>
    onTier.find(summary => summary.pack === pack);

  /**
   * Every hoverable part of this tier, by the key it carries in the markup.
   * Keying beats hanging a handler on each shape: the pointer can cross from
   * a pile to the band under it to the timber beneath without the card ever
   * blinking out, because one handler on the drawing reads whatever is under
   * the pointer now.
   */
  const cards = new Map<string, HoverCard>();
  for (const summary of onTier) {
    cards.set(`pack:${summary.pack}`, {
      heading: summary.id,
      lines: packContentsLines(summary),
      footer: `${toMetres(summary.length).toFixed(2)} m × ${toMetres(summary.width).toFixed(2)} m · ${Math.round(summary.mass).toLocaleString('en-NZ')} kg · on ${bearerLine(summary)}`,
    });
    summary.bearers.forEach((bearer, index) => {
      cards.set(`bearer:${summary.pack}:${index}`, {
        heading: `${summary.id} bearer ${index + 1} of ${summary.bearers.length}`,
        lines: [
          `${bearer.thickness} mm timber`,
          `${Math.round(bearer.x)} mm along the deck`,
        ],
        footer: `under ${packContentsLines(summary).join(', ')}`,
      });
    });
  }

  const [hover, setHover] = useState<HoverState | null>(null);

  function follow(event: MouseEvent<SVGSVGElement>) {
    const key = (event.target as Element).closest?.('[data-card]');
    const card = cards.get(key?.getAttribute('data-card') ?? '');
    if (!card) {
      setHover(null);
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    setHover({
      card,
      x,
      y,
      flip: x > box.width * 0.6,
      lift: y > box.height * 0.6,
    });
  }

  return (
    <figure className="space-y-1">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-800">{title}</span>
        <span className="text-xs text-slate-500">
          {placements.length} {placements.length === 1 ? 'pile' : 'piles'}
        </span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`${-LABEL_BAND} ${-LABEL_BAND} ${vehicle.deckLength + LABEL_BAND * 2} ${vehicle.deckWidth + LABEL_BAND * 2}`}
          className="w-full rounded border border-slate-300 bg-white"
          role="img"
          aria-label={`${title}, ${placements.length} piles`}
          data-testid={`tier-plan-${tier}`}
          onMouseMove={follow}
          onMouseLeave={() => setHover(null)}
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
              const summary = summaryFor(pack);
              const width = toMetres(packWidth(inPack, catalogue)).toFixed(2);
              return (
                <g key={`pack-${pack}`}>
                  <rect
                    x={left - 40}
                    y={toSvgY(span[0]) - 40}
                    width={right - left + 80}
                    height={span[1] - span[0] + 80}
                    /* Transparent, not `none`: the band answers the pointer
                     * across its whole area, not only on its dashed edge. */
                    fill="transparent"
                    className="stroke-slate-400"
                    strokeWidth={10}
                    strokeDasharray="60 60"
                    data-card={`pack:${pack}`}
                    data-testid={`pack-outline-${pack}`}
                  />
                  <text
                    x={left + 120}
                    y={toSvgY(span[0]) - 100}
                    className="fill-slate-500"
                    fontSize={180}
                    data-card={`pack:${pack}`}
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
          {onTier.flatMap(summary =>
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
                data-card={`bearer:${summary.pack}:${index}`}
                data-testid="bearer"
              />
            )),
          )}

          {/*
            The steel. Each pile is tagged with its pack, so pointing at a
            pipe names the bundle it is banded into and everything else in it
            — the piles cover the pack's band, so without this the drawing is
            silent exactly where there is something to point at.
          */}
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
                data-card={`pack:${placement.pack}`}
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

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded border border-slate-300 bg-white/95 px-2 py-1.5 text-xs shadow-lg"
            style={{
              left: hover.x + (hover.flip ? -CARD_OFFSET : CARD_OFFSET),
              top: hover.y + (hover.lift ? -CARD_OFFSET : CARD_OFFSET),
              transform: `translate(${hover.flip ? '-100%' : '0'}, ${hover.lift ? '-100%' : '0'})`,
            }}
            data-testid="plan-hover-card"
          >
            <p className="font-medium text-slate-900">{hover.card.heading}</p>
            <ul className="mt-0.5 text-slate-700">
              {hover.card.lines.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-1 text-slate-500">{hover.card.footer}</p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
