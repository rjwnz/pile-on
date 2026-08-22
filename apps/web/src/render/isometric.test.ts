import {describe, expect, it} from '@jest/globals';
import {
  boxFaces,
  cylinderAlongDeck,
  depthOrder,
  project,
  projectedBounds,
} from './isometric';

const COS30 = Math.cos(Math.PI / 6);

/** Every explicit coordinate pair in a path, in order. */
function pointsIn(path: string): {x: number; y: number}[] {
  return [...path.matchAll(/[MLA][^MLAZ]*/g)].flatMap(match => {
    const numbers = match[0]
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    // An arc carries five parameters before its endpoint.
    const pair = match[0][0] === 'A' ? numbers.slice(5) : numbers;
    return pair.length === 2 ? [{x: pair[0]!, y: pair[1]!}] : [];
  });
}

/** The rx, ry and x-axis-rotation of the first arc in a path. */
function arcIn(path: string): [number, number, number] {
  const numbers = /A\s+([^Z]+)/
    .exec(path)![1]!
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return [numbers[0]!, numbers[1]!, numbers[2]!];
}

describe('project', () => {
  it('leaves the origin at the origin', () => {
    expect(project(0, 0, 0)).toEqual({x: 0, y: 0});
  });

  it('sends the deck axis down and to the right', () => {
    const point = project(1000, 0, 0);

    expect(point.x).toBeCloseTo(1000 * COS30);
    expect(point.y).toBeCloseTo(500);
  });

  it('sends the across-deck axis down and to the left', () => {
    const point = project(0, 1000, 0);

    expect(point.x).toBeCloseTo(-1000 * COS30);
    expect(point.y).toBeCloseTo(500);
  });

  it('sends height straight up the screen', () => {
    expect(project(0, 0, 1000)).toEqual({x: 0, y: -1000});
  });

  it('puts the near corner lower on screen than the far one', () => {
    const far = project(0, 0, 0);
    const near = project(1000, 1000, 0);

    expect(near.y).toBeGreaterThan(far.y);
  });
});

describe('boxFaces', () => {
  const faces = boxFaces({x0: 0, x1: 100, y0: 0, y1: 50, z0: 0, z1: 20});

  it('gives exactly the three faces a viewer can see', () => {
    expect(Object.keys(faces).sort()).toEqual(['end', 'side', 'top']);
  });

  it('describes each face as four points', () => {
    for (const face of Object.values(faces)) {
      expect(face.split(' ')).toHaveLength(4);
    }
  });

  it('takes every corner of the top face from the top of the box', () => {
    expect(faces.top).toBe(
      [
        project(0, 0, 20),
        project(100, 0, 20),
        project(100, 50, 20),
        project(0, 50, 20),
      ]
        .map(point => `${point.x},${point.y}`)
        .join(' '),
    );
  });
});

describe('projectedBounds', () => {
  const box = {x0: 0, x1: 12500, y0: -1225, y1: 1225, z0: 0, z1: 2200};
  const bounds = projectedBounds(box, 200);

  it('encloses every projected corner', () => {
    const corners = [box.x0, box.x1].flatMap(x =>
      [box.y0, box.y1].flatMap(y =>
        [box.z0, box.z1].map(z => project(x, y, z)),
      ),
    );

    for (const corner of corners) {
      expect(corner.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(corner.x).toBeLessThanOrEqual(bounds.minX + bounds.width);
      expect(corner.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(corner.y).toBeLessThanOrEqual(bounds.minY + bounds.height);
    }
  });

  it('leaves the requested padding on every side', () => {
    const tight = projectedBounds(box, 0);

    expect(bounds.width).toBeCloseTo(tight.width + 400);
    expect(bounds.height).toBeCloseTo(tight.height + 400);
  });

  it('is wider than it is tall for a long deck', () => {
    expect(bounds.width).toBeGreaterThan(bounds.height);
  });
});

describe('depthOrder', () => {
  it('draws the farthest item in a tier first', () => {
    const ordered = depthOrder([
      {id: 'near', x: 6000, y: 900, tier: 0},
      {id: 'far', x: 100, y: -900, tier: 0},
      {id: 'middle', x: 3000, y: 0, tier: 0},
    ]);

    expect(ordered.map(item => item.id)).toEqual(['far', 'middle', 'near']);
  });

  it('draws a lower tier before the one stacked on it', () => {
    const ordered = depthOrder([
      {id: 'upper', x: 100, y: 0, tier: 2},
      {id: 'lower', x: 100, y: 0, tier: 0},
    ]);

    expect(ordered.map(item => item.id)).toEqual(['lower', 'upper']);
  });

  it('never lets a lower tier paint over a higher one, however near it is', () => {
    // A bottom-tier pile at the rear is closer to the viewer than a top-tier
    // pile at the front, but it must not punch a hole in the top of the load.
    const ordered = depthOrder([
      {id: 'top-far', x: 100, y: 0, tier: 3},
      {id: 'bottom-near', x: 12000, y: 900, tier: 0},
    ]);

    expect(ordered.map(item => item.id)).toEqual(['bottom-near', 'top-far']);
  });

  it('does not mutate the array it was given', () => {
    const items = [
      {id: 'a', x: 9000, y: 0, tier: 0},
      {id: 'b', x: 0, y: 0, tier: 0},
    ];
    depthOrder(items);

    expect(items[0]!.id).toBe('a');
  });
});

describe('cylinderAlongDeck', () => {
  const cylinder = cylinderAlongDeck(0, 6000, 0, 500, 100);

  it('caps the near end of the pile, not the far one', () => {
    const nearEnd = project(6000, 0, 500);

    expect(cylinder.capCx).toBeCloseTo(nearEnd.x);
    expect(cylinder.capCy).toBeCloseTo(nearEnd.y);
  });

  it('makes the cap an ellipse taller than it is wide across the view', () => {
    // A circle seen at this angle is foreshortened along the line of sight.
    expect(cylinder.capRx).toBeCloseTo(100 * Math.sqrt(1.5));
    expect(cylinder.capRy).toBeCloseTo(100 * Math.sqrt(0.5));
    expect(cylinder.capRx).toBeGreaterThan(cylinder.capRy);
  });

  it('lays the cap major axis along the screen-up direction', () => {
    // Exact, not close: float noise here ends up in every printed drawing.
    expect(cylinder.capRotation).toBe(-60);
  });

  it('splits the body into a lit and a shaded half', () => {
    // Both start on the pile axis and close back to it, so together they cover
    // the tube exactly once with no overlap and no gap.
    expect(cylinder.lit).toMatch(/^M /);
    expect(cylinder.shaded).toMatch(/^M /);
    expect(pointsIn(cylinder.lit)[0]).toEqual(pointsIn(cylinder.shaded)[0]);
  });

  it('puts the lit half above the shaded half on screen', () => {
    const topOf = (path: string) =>
      Math.min(...pointsIn(path).map(point => point.y));

    expect(topOf(cylinder.lit)).toBeLessThan(topOf(cylinder.shaded));
  });

  it('makes the body half-width match the cap, so the two meet cleanly', () => {
    // Silhouette half-width and cap major semi-axis are the same number; if
    // they ever diverge the cap either floats free of the body or bulges out.
    const axis = pointsIn(cylinder.lit)[1]!;
    const edge = pointsIn(cylinder.lit)[2]!;

    expect(Math.hypot(edge.x - axis.x, edge.y - axis.y)).toBeCloseTo(
      cylinder.capRx,
    );
  });

  describe('the far end', () => {
    it('is an arc, not a straight edge — a cylinder is not a sawn plank', () => {
      expect(cylinder.silhouette).toContain('A ');
      expect(cylinder.lit).toContain('A ');
      expect(cylinder.shaded).toContain('A ');
    });

    it('curves on the same ellipse as the cap', () => {
      const [rx, ry, rotation] = arcIn(cylinder.silhouette);

      expect(rx).toBeCloseTo(cylinder.capRx);
      expect(ry).toBeCloseTo(cylinder.capRy);
      expect(rotation).toBeCloseTo(cylinder.capRotation);
    });

    it('bulges away from the viewer, past the end of the body', () => {
      // The lit and shaded halves both end at the far rim's outermost point,
      // one minor semi-axis beyond the pile axis, directly away from the eye.
      const axisStart = pointsIn(cylinder.lit)[0]!;
      const bulge = pointsIn(cylinder.lit).at(-1)!;
      const alongDeck = {x: Math.cos(Math.PI / 6), y: 0.5};

      const outward =
        (axisStart.x - bulge.x) * alongDeck.x +
        (axisStart.y - bulge.y) * alongDeck.y;
      expect(outward).toBeCloseTo(cylinder.capRy);
    });

    it('closes the silhouette back on itself', () => {
      const corners = pointsIn(cylinder.silhouette);

      expect(corners.at(-1)).toEqual(corners[0]);
    });
  });

  it('scales with radius, so a helix plate uses the same shape as a shaft', () => {
    const plate = cylinderAlongDeck(400, 510, 0, 500, 225);

    expect(plate.capRx / cylinder.capRx).toBeCloseTo(225 / 100);
    expect(plate.capRotation).toBeCloseTo(cylinder.capRotation);
  });
});
