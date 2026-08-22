import {describe, expect, it} from '@jest/globals';
import {
  lateralSeparationOk,
  pilesConflict,
  requiredLateralSeparation,
  type SeparationOptions,
} from './separation';
import {
  DOUBLE,
  HELIX_RADIUS,
  PILE_LENGTH,
  PLAIN,
  SHAFT_RADIUS,
  SINGLE,
  helixAt,
  pileType,
  place,
} from './testFixtures';

const NO_CLEARANCE: SeparationOptions = {clearance: 0};

const SHAFT_TO_SHAFT = SHAFT_RADIUS * 2; // 120
const HELIX_TO_HELIX = HELIX_RADIUS * 2; // 400
const HELIX_TO_SHAFT = HELIX_RADIUS + SHAFT_RADIUS; // 260

describe('requiredLateralSeparation', () => {
  it('is zero when the piles never share a station, so they can share a lane', () => {
    const a = place(PLAIN, {x: 0});
    const b = place(PLAIN, {x: PILE_LENGTH + 1});

    expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(0);
  });

  it('is zero when the piles merely touch end to end', () => {
    const a = place(PLAIN, {x: 0});
    const b = place(PLAIN, {x: PILE_LENGTH});

    expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(0);
  });

  it('is shaft-to-shaft for two plain shafts', () => {
    const a = place(PLAIN);
    const b = place(PLAIN);

    expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(SHAFT_TO_SHAFT);
  });

  it('keeps a helix clear of a neighbouring bare shaft', () => {
    const a = place(DOUBLE);
    const b = place(PLAIN);

    expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(HELIX_TO_SHAFT);
  });

  describe('double-helix piles', () => {
    it('needs full helix-to-helix room when plates share a station', () => {
      const a = place(DOUBLE, {x: 0});
      const b = place(DOUBLE, {x: 0});

      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
        HELIX_TO_HELIX,
      );
    });

    it('drops to helix-to-shaft once the plates are staggered apart', () => {
      // A's plates sit at 500/1200, B's at 850/1550 — no station has both.
      const a = place(DOUBLE, {x: 0});
      const b = place(DOUBLE, {x: 350});

      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
        HELIX_TO_SHAFT,
      );
    });

    it('can be staggered by flipping one pile end for end', () => {
      const a = place(DOUBLE, {flipped: false});
      const b = place(DOUBLE, {flipped: true});

      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
        HELIX_TO_SHAFT,
      );
    });

    it('gets no relaxation against a single-helix neighbour', () => {
      // Both present a plate at station 500; the double-helix pile forbids
      // interleaving regardless of what its neighbour is.
      const a = place(DOUBLE);
      const b = place(SINGLE);

      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
        HELIX_TO_HELIX,
      );
    });
  });

  describe('single-helix piles', () => {
    it('lets plates overlap in plan but never over the neighbour shaft', () => {
      const a = place(SINGLE);
      const b = place(SINGLE);

      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
        HELIX_TO_SHAFT,
      );
    });

    it('is unaffected by staggering, since interleaving already relaxed it', () => {
      const a = place(SINGLE, {x: 0});
      const b = place(SINGLE, {x: 350});

      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
        HELIX_TO_SHAFT,
      );
    });

    it('uses the wider plate when the two differ', () => {
      const fat = pileType('fat', [helixAt(500, {radius: 300})]);
      const a = place(SINGLE);
      const b = place(fat);

      // max(200 + 60, 60 + 300) = 360
      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(360);
    });

    it('never relaxes below the shaft floor, even for a sub-shaft plate', () => {
      const stubby = pileType('stubby', [helixAt(500, {radius: 40})]);
      const a = place(stubby);
      const b = place(stubby);

      expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
        SHAFT_TO_SHAFT,
      );
    });
  });

  it('adds the clearance once, not once per station', () => {
    const a = place(DOUBLE);
    const b = place(DOUBLE);

    expect(requiredLateralSeparation(a, b, {clearance: 25})).toBe(
      HELIX_TO_HELIX + 25,
    );
  });

  it('only considers the overlapping span of two offset piles', () => {
    // B starts past both of A's plates, so only bare shaft is ever shared.
    const a = place(DOUBLE, {x: 0});
    const b = place(PLAIN, {x: 2000});

    expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(SHAFT_TO_SHAFT);
  });

  it('is symmetric in its arguments', () => {
    const a = place(DOUBLE, {x: 0});
    const b = place(SINGLE, {x: 350});

    expect(requiredLateralSeparation(a, b, NO_CLEARANCE)).toBe(
      requiredLateralSeparation(b, a, NO_CLEARANCE),
    );
  });
});

describe('lateralSeparationOk', () => {
  const options: SeparationOptions = {clearance: 20};

  it('accepts a gap exactly on the limit', () => {
    const a = place(PLAIN, {y: 0});
    const b = place(PLAIN, {y: SHAFT_TO_SHAFT + 20});

    expect(lateralSeparationOk(a, b, options)).toBe(true);
  });

  it('rejects a gap one millimetre short', () => {
    const a = place(PLAIN, {y: 0});
    const b = place(PLAIN, {y: SHAFT_TO_SHAFT + 19});

    expect(lateralSeparationOk(a, b, options)).toBe(false);
  });

  it('ignores the sign of the offset', () => {
    const a = place(PLAIN, {y: 500});
    const b = place(PLAIN, {y: 500 - (SHAFT_TO_SHAFT + 20)});

    expect(lateralSeparationOk(a, b, options)).toBe(true);
  });
});

describe('pilesConflict', () => {
  it('reports a conflict for overlapping piles in the same tier', () => {
    const a = place(DOUBLE, {tier: 0, y: 0});
    const b = place(DOUBLE, {tier: 0, y: 100});

    expect(pilesConflict(a, b, NO_CLEARANCE)).toBe(true);
  });

  it('never reports a conflict across tiers — dunnage carries the layer above', () => {
    const a = place(DOUBLE, {tier: 0, y: 0});
    const b = place(DOUBLE, {tier: 1, y: 0});

    expect(pilesConflict(a, b, NO_CLEARANCE)).toBe(false);
  });

  it('is happy with well-separated piles in the same tier', () => {
    const a = place(DOUBLE, {tier: 0, y: 0});
    const b = place(DOUBLE, {tier: 0, y: 500});

    expect(pilesConflict(a, b, NO_CLEARANCE)).toBe(false);
  });
});
