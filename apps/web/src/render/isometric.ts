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

/**
 * Screen-space direction perpendicular to a pile lying along the deck,
 * pointing at its lit side. (SVG y grows downward, hence the negative.)
 *
 * It is the unit normal to the projected deck axis (cos30, sin30).
 */
const UP: Point2 = {x: SIN30, y: -COS30};

/** Unit vector along a pile on screen — toward the viewer, down and right. */
const ALONG: Point2 = {x: COS30, y: SIN30};

/**
 * A circle in the deck's cross-section plane projects to an ellipse.
 *
 * Working the projection through, its major axis lands exactly along UP with
 * semi-axis r·√(1+sin30), and its minor axis is r·√(1−sin30). The major
 * semi-axis is also the cylinder's silhouette half-width, so the body and the
 * end cap are governed by the same number — which is why the cap always meets
 * the body cleanly, at any radius.
 */
const CAP_MAJOR = Math.sqrt(1 + SIN30);
const CAP_MINOR = Math.sqrt(1 - SIN30);
// Rounded: atan2 leaves float noise that would otherwise land in the markup of
// every exported or printed drawing.
const CAP_ROTATION_DEG = Number(
  ((Math.atan2(UP.y, UP.x) * 180) / Math.PI).toFixed(4),
);

export interface Cylinder {
  /** Upper, lit half of the body, as SVG path data. */
  readonly lit: string;
  /** Lower, shaded half — the two together read as round. */
  readonly shaded: string;
  /**
   * Outline of the whole body. Stroked separately from the two halves so the
   * shared edge between them does not draw a false seam down the pile's axis.
   */
  readonly silhouette: string;
  readonly capCx: number;
  readonly capCy: number;
  readonly capRx: number;
  readonly capRy: number;
  readonly capRotation: number;
}

/**
 * A cylinder lying along the deck: shaft, or — with a big radius and a short
 * length — a helix plate. Both are the same shape, so both use this.
 */
export function cylinderAlongDeck(
  x0: Millimetres,
  x1: Millimetres,
  y: Millimetres,
  z: Millimetres,
  radius: Millimetres,
): Cylinder {
  const start = project(x0, y, z);
  const end = project(x1, y, z);
  const halfWidth = radius * CAP_MAJOR;
  const capRy = radius * CAP_MINOR;
  const offset = {x: UP.x * halfWidth, y: UP.y * halfWidth};

  const corner = (base: Point2, sign: number): Point2 => ({
    x: base.x + offset.x * sign,
    y: base.y + offset.y * sign,
  });

  /*
   * Farthest point of the far rim. The far end shows the outside of the tube
   * curving away, not a cut face, so its edge is an arc bulging past the body
   * by the cap's minor semi-axis — a square edge there makes a cylinder look
   * like a sawn plank.
   */
  const farExtreme: Point2 = {
    x: start.x - ALONG.x * capRy,
    y: start.y - ALONG.y * capRy,
  };

  /*
   * The far rim is the same ellipse as the cap, so the arcs reuse its radii and
   * rotation. Endpoints sit on the major axis, which makes the silhouette a
   * clean half ellipse and each shaded half a quarter.
   *
   * Sweep flags, reading positions off a clock face (SVG's y runs down, so
   * sweep 1 is clockwise on screen):
   *   silhouette  8 → 10 → 2 o'clock   clockwise        → 1
   *   lit         2 → 12 → 10 o'clock  anticlockwise    → 0
   *   shaded      8 → 9  → 10 o'clock  clockwise        → 1
   */
  const arcTo = (to: Point2, sweep: 0 | 1) =>
    `A ${halfWidth} ${capRy} ${CAP_ROTATION_DEG} 0 ${sweep} ${to.x} ${to.y}`;
  const move = (at: Point2) => `M ${at.x} ${at.y}`;
  const line = (to: Point2) => `L ${to.x} ${to.y}`;

  return {
    lit: [
      move(start),
      line(end),
      line(corner(end, 1)),
      line(corner(start, 1)),
      arcTo(farExtreme, 0),
      'Z',
    ].join(' '),
    shaded: [
      move(start),
      line(end),
      line(corner(end, -1)),
      line(corner(start, -1)),
      arcTo(farExtreme, 1),
      'Z',
    ].join(' '),
    silhouette: [
      move(corner(start, 1)),
      line(corner(end, 1)),
      line(corner(end, -1)),
      line(corner(start, -1)),
      arcTo(corner(start, 1), 1),
      'Z',
    ].join(' '),
    capCx: end.x,
    capCy: end.y,
    capRx: halfWidth,
    capRy,
    capRotation: CAP_ROTATION_DEG,
  };
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
 * Depth of a box's centre along the line of sight.
 *
 * The projection collapses the direction (1,1,1) — solve project(v) = 0 and
 * that is what falls out — so the eye is up the (1,1,1) diagonal and depth is
 * simply x + y + z, with larger meaning nearer.
 */
function centreDepth(box: Box): number {
  return (box.x0 + box.x1 + box.y0 + box.y1 + box.z0 + box.z1) / 2;
}

/**
 * Whether every point of `front` is nearer the eye than every point of `back`.
 *
 * Looking along (1,1,1), a ray meets larger coordinates last, so if one box
 * clears another along any single axis it is unambiguously in front. Boxes that
 * clear on no axis would have to interpenetrate — which `validatePlan` forbids,
 * since piles cannot occupy the same steel.
 */
export function isInFront(front: Box, back: Box): boolean {
  return front.x0 >= back.x1 || front.y0 >= back.y1 || front.z0 >= back.z1;
}

function overlapsOnScreen(a: Bounds, b: Bounds): boolean {
  return (
    a.minX < b.minX + b.width &&
    b.minX < a.minX + a.width &&
    a.minY < b.minY + b.height &&
    b.minY < a.minY + a.height
  );
}

/**
 * Painter's-algorithm ordering, farthest first, from pairwise occlusion.
 *
 * No single sort key can do this. Ordering on x + y lets a bottom-tier pile at
 * the rear paint a hole in the top of the load; ordering by tier lets a far,
 * high pile cover a near, low one. Both are real, and swapping between them
 * just trades one family of artefacts for the other — so instead of a key, this
 * asks "does A occlude B?" for every pair that overlaps on screen and
 * topologically sorts the answers. That is exact for our geometry.
 *
 * Pairs that overlap on screen but clear on no axis leave no constraint, and a
 * cyclic constraint set is theoretically possible; both fall back to centre
 * depth, which also keeps the output stable for a given plan.
 */
export function occlusionOrder<T extends {readonly box: Box}>(
  items: readonly T[],
): T[] {
  if (items.length < 2) {
    return [...items];
  }

  const depth = items.map(item => centreDepth(item.box));
  const screen = items.map(item => projectedBounds(item.box, 0));
  const farthestFirst = [...items.keys()].sort(
    (a, b) => depth[a]! - depth[b]! || a - b,
  );

  /** drawAfter[i] holds everything that must be drawn once i is down. */
  const drawAfter: Set<number>[] = items.map(() => new Set<number>());
  const blockedBy = new Array<number>(items.length).fill(0);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (!overlapsOnScreen(screen[i]!, screen[j]!)) {
        continue;
      }
      const iInFront = isInFront(items[i]!.box, items[j]!.box);
      const jInFront = isInFront(items[j]!.box, items[i]!.box);
      if (iInFront === jInFront) {
        continue;
      }
      const back = iInFront ? j : i;
      const front = iInFront ? i : j;
      if (!drawAfter[back]!.has(front)) {
        drawAfter[back]!.add(front);
        blockedBy[front]!++;
      }
    }
  }

  const ready = farthestFirst.filter(index => blockedBy[index] === 0);
  const ordered: T[] = [];
  const placed = new Array<boolean>(items.length).fill(false);

  while (ready.length > 0) {
    // Always take the farthest of what is free, so ties resolve the same way
    // every render.
    let choice = 0;
    for (let k = 1; k < ready.length; k++) {
      if (depth[ready[k]!]! < depth[ready[choice]!]!) {
        choice = k;
      }
    }
    const next = ready.splice(choice, 1)[0]!;
    ordered.push(items[next]!);
    placed[next] = true;
    for (const blocked of drawAfter[next]!) {
      if (--blockedBy[blocked]! === 0) {
        ready.push(blocked);
      }
    }
  }

  for (const index of farthestFirst) {
    if (!placed[index]) {
      ordered.push(items[index]!);
    }
  }

  return ordered;
}
