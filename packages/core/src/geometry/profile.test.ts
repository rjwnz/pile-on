import {describe, expect, it} from '@jest/globals';
import {
  breakpoints,
  coversStation,
  helixRadiusAt,
  radiusProfile,
} from './profile';
import {
  HELIX_RADIUS,
  PILE_LENGTH,
  PLAIN,
  SHAFT_RADIUS,
  SINGLE,
  DOUBLE,
  helixAt,
  pileType,
  place,
} from './testFixtures';

describe('radiusProfile', () => {
  it('gives a plain shaft one segment spanning the whole pile', () => {
    const profile = radiusProfile(place(PLAIN, {x: 1000}));

    expect(profile).toEqual([
      {
        start: 1000,
        end: 1000 + PILE_LENGTH,
        radius: SHAFT_RADIUS,
        kind: 'shaft',
      },
    ]);
  });

  it('puts the shaft segment first so a scan can rely on index 0', () => {
    const profile = radiusProfile(place(DOUBLE));

    expect(profile[0]!.kind).toBe('shaft');
    expect(profile).toHaveLength(3);
  });

  it('centres each helix segment on the plate and spans its thickness', () => {
    const profile = radiusProfile(place(SINGLE, {x: 200}));

    expect(profile[1]).toEqual({
      start: 200 + 500 - 50,
      end: 200 + 500 + 50,
      radius: HELIX_RADIUS,
      kind: 'helix',
    });
  });

  it('measures helix offsets from the far end when the pile is flipped', () => {
    const profile = radiusProfile(place(SINGLE, {flipped: true}));

    // 500 mm from the butt, and the butt is now at the rear.
    expect(profile[1]!.start).toBe(PILE_LENGTH - 500 - 50);
    expect(profile[1]!.end).toBe(PILE_LENGTH - 500 + 50);
  });

  it('clamps a helix at the very butt to the pile extent', () => {
    const atTheButt = pileType('butt', [helixAt(0)]);
    const profile = radiusProfile(place(atTheButt));

    expect(profile[1]!.start).toBe(0);
    expect(profile[1]!.end).toBe(50);
  });

  it('clamps a helix at the very tip to the pile extent', () => {
    const atTheTip = pileType('tip', [helixAt(PILE_LENGTH)]);
    const profile = radiusProfile(place(atTheTip));

    expect(profile[1]!.start).toBe(PILE_LENGTH - 50);
    expect(profile[1]!.end).toBe(PILE_LENGTH);
  });

  it('drops a helix with no longitudinal extent', () => {
    const zeroThickness = pileType('flat', [helixAt(500, {length: 0})]);

    expect(radiusProfile(place(zeroThickness))).toHaveLength(1);
  });
});

describe('helixRadiusAt', () => {
  const profile = radiusProfile(place(SINGLE));

  it('reports the plate radius inside the helix segment', () => {
    expect(helixRadiusAt(profile, 500)).toBe(HELIX_RADIUS);
  });

  it('reports zero where the pile presents bare shaft', () => {
    expect(helixRadiusAt(profile, 3000)).toBe(0);
  });

  it('treats the segment as half open, so the end station is already clear', () => {
    expect(helixRadiusAt(profile, 450)).toBe(HELIX_RADIUS);
    expect(helixRadiusAt(profile, 550)).toBe(0);
  });

  it('takes the widest plate when helices overlap at a station', () => {
    const stacked = pileType('stacked', [
      helixAt(500, {length: 400}),
      helixAt(500, {radius: 350, length: 400}),
    ]);

    expect(helixRadiusAt(radiusProfile(place(stacked)), 500)).toBe(350);
  });
});

describe('coversStation', () => {
  const profile = radiusProfile(place(PLAIN, {x: 1000}));

  it('is true within the pile extent', () => {
    expect(coversStation(profile, 1000)).toBe(true);
    expect(coversStation(profile, 4000)).toBe(true);
  });

  it('is false outside it', () => {
    expect(coversStation(profile, 999)).toBe(false);
    expect(coversStation(profile, 1000 + PILE_LENGTH)).toBe(false);
  });
});

describe('breakpoints', () => {
  it('returns sorted, de-duplicated boundaries from both profiles', () => {
    const a = radiusProfile(place(SINGLE));
    const b = radiusProfile(place(SINGLE, {x: 0}));

    expect(breakpoints(a, b)).toEqual([0, 450, 550, PILE_LENGTH]);
  });

  it('merges boundaries from two differently placed piles', () => {
    const a = radiusProfile(place(PLAIN));
    const b = radiusProfile(place(PLAIN, {x: 2000}));

    expect(breakpoints(a, b)).toEqual([
      0,
      2000,
      PILE_LENGTH,
      2000 + PILE_LENGTH,
    ]);
  });
});
