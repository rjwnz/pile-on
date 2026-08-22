import type {Millimetres} from '@pile-on/core';

/**
 * Axonometric projection for the 3D view, in SVG rather than WebGL.
 *
 * A printed loading plan has to survive being carried out to a truck, so the
 * drawing is vector: crisp at any zoom, prints cleanly, needs no GPU, and can
 * be snapshot-tested. Three.js only earns its place if the view ever needs to
 * be orbited.
 *
 * Deck coordinates in, screen units out:
 *   x — along the deck, increases to the lower right
 *   y — across the deck, increases to the lower left
 *   z — up off the deck, increases up the screen
 *
 * So the nearest corner is the rear kerb-side one, and the visible faces of any
 * box are its top, its high-y side and its high-x end.
 */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export function project(
  x: Millimetres,
  y: Millimetres,
  z: Millimetres,
): Point2 {
  return {x: (x - y) * COS30, y: (x + y) * SIN30 - z};
}

export interface Box {
  readonly x0: Millimetres;
  readonly x1: Millimetres;
  readonly y0: Millimetres;
  readonly y1: Millimetres;
  readonly z0: Millimetres;
  readonly z1: Millimetres;
}

/** The three faces of a box an isometric viewer can see, as SVG point lists. */
export interface BoxFaces {
  readonly top: string;
  readonly side: string;
  readonly end: string;
}

function points(...corners: Point2[]): string {
  return corners.map(corner => `${corner.x},${corner.y}`).join(' ');
}

export function boxFaces(box: Box): BoxFaces {
  const {x0, x1, y0, y1, z0, z1} = box;
  return {
    top: points(
      project(x0, y0, z1),
      project(x1, y0, z1),
      project(x1, y1, z1),
      project(x0, y1, z1),
    ),
    side: points(
      project(x0, y1, z1),
      project(x1, y1, z1),
      project(x1, y1, z0),
      project(x0, y1, z0),
    ),
    end: points(
      project(x1, y0, z1),
      project(x1, y1, z1),
      project(x1, y1, z0),
      project(x1, y0, z0),
    ),
  };
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

/** Bounding box of a projected volume, for the SVG viewBox. */
export function projectedBounds(box: Box, padding = 200): Bounds {
  const corners = [box.x0, box.x1].flatMap(x =>
    [box.y0, box.y1].flatMap(y => [box.z0, box.z1].map(z => project(x, y, z))),
  );
  const xs = corners.map(corner => corner.x);
  const ys = corners.map(corner => corner.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  return {
    minX,
    minY,
    width: Math.max(...xs) + padding - minX,
    height: Math.max(...ys) + padding - minY,
  };
}

/**
 * Painter's-algorithm ordering: farthest first.
 *
 * Tier is the primary key, so every tier is drawn over the one it sits on. A
 * single depth scalar cannot order overlapping boxes correctly, and sorting on
 * x + y alone lets a bottom-tier pile near the rear paint over a top-tier pile
 * further forward — which puts a hole in the top of the load. Tier-major is
 * always right for a flat stacked deck, and matches how such a drawing is read:
 * you see the top of the load.
 *
 * Within a tier, depth grows with x + y, since both axes run toward the viewer.
 */
export function depthOrder<T extends {x: number; y: number; tier: number}>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => a.tier - b.tier || a.x + a.y - (b.x + b.y));
}
