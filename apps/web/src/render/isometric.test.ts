import {describe, expect, it} from '@jest/globals';
import {boxFaces, depthOrder, project, projectedBounds} from './isometric';

const COS30 = Math.cos(Math.PI / 6);

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
