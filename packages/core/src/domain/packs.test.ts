import {
  DOUBLE,
  PILE_LENGTH,
  PLAIN,
  SINGLE,
  helixAt,
  place,
  pileType,
} from '../testFixtures';
import type {Catalogue} from './catalogue';
import {DEFAULT_LOADING_OPTIONS, axisHeightOf} from './loading';
import {
  BEARER_END_INSET,
  BEARER_WIDTH,
  DUNNAGE_INCREMENT,
  bearerStations,
  bearingGround,
  deckBearers,
  dunnageUnder,
  everyPackIsBorne,
  footprintOver,
  layerHeights,
  layerProtrusion,
  layersOf,
  packLateralSpan,
  packManifest,
  packMass,
  packWidth,
  roundUpToIncrement,
  shaftProtrusion,
} from './packs';

// Fixture geometry: shaft radius 60, helix radius 200 — protrusion 140.
const CATALOGUE: Catalogue = {
  pileTypes: [PLAIN, SINGLE, DOUBLE],
  vehicles: [],
};
const OPTIONS = DEFAULT_LOADING_OPTIONS;

describe('rounding to the bearer increment', () => {
  it.each([
    [1, DUNNAGE_INCREMENT],
    [49, 50],
    [50, 50], // an exact multiple is already a bearer size
    [51, 100],
    [166, 200],
  ])('%d mm needs a %d mm bearer', (value, expected) => {
    expect(roundUpToIncrement(value)).toBe(expected);
  });
});

describe('grouping into tiers and packs', () => {
  it('splits by tier then pack, tiers in order', () => {
    const placements = [
      place(PLAIN, {id: 'a', tier: 1, pack: 0}).placement,
      place(PLAIN, {id: 'b', tier: 0, pack: 1}).placement,
      place(PLAIN, {id: 'c', tier: 0, pack: 0}).placement,
      place(PLAIN, {id: 'd', tier: 0, pack: 1}).placement,
    ];
    const tiers = layersOf(placements);
    expect([...tiers.keys()]).toEqual([0, 1]);
    expect(
      tiers
        .get(0)!
        .get(0)!
        .map(p => p.id),
    ).toEqual(['c']);
    expect(
      tiers
        .get(0)!
        .get(1)!
        .map(p => p.id),
    ).toEqual(['b', 'd']);
    expect(
      tiers
        .get(1)!
        .get(0)!
        .map(p => p.id),
    ).toEqual(['a']);
  });
});

describe('pack measurements', () => {
  it('spans from outer edge to outer edge of the widest steel', () => {
    const pack = [
      place(SINGLE, {y: -300}).placement, // reaches -500
      place(SINGLE, {y: 300}).placement, // reaches 500
    ];
    expect(packLateralSpan(pack, CATALOGUE)).toEqual([-500, 500]);
    expect(packWidth(pack, CATALOGUE)).toBe(1000);
  });

  it('has no span when nothing resolves to the catalogue', () => {
    const ghost = place(PLAIN, {pileTypeId: 'ghost'}).placement;
    expect(packLateralSpan([ghost], CATALOGUE)).toBeNull();
    expect(packWidth([ghost], CATALOGUE)).toBe(0);
    expect(packMass([ghost], CATALOGUE)).toBe(0);
  });

  it('adds up the steel', () => {
    const pack = [place(PLAIN).placement, place(PLAIN).placement];
    expect(packMass(pack, CATALOGUE)).toBe(500);
  });
});

describe('what stands proud of the shafts', () => {
  it('is the plate reach beyond the shaft for a starter', () => {
    expect(shaftProtrusion(SINGLE)).toBe(140);
  });

  it('is zero for a plain shaft', () => {
    expect(shaftProtrusion(PLAIN)).toBe(0);
  });

  it('is the tallest protrusion across a tier', () => {
    const layer = [place(PLAIN).placement, place(SINGLE).placement];
    expect(layerProtrusion(layer, CATALOGUE)).toBe(140);
  });
});

describe('bearers under a layer', () => {
  it('is the stated bearer for plain shafts on the bare deck', () => {
    expect(dunnageUnder([], [], CATALOGUE, OPTIONS)).toBe(100);
    expect(dunnageUnder([place(PLAIN).placement], [], CATALOGUE, OPTIONS)).toBe(
      100,
    );
  });

  it('is the stated bearer under a layer nothing resolves in', () => {
    const ghost = place(PLAIN, {pileTypeId: 'ghost'}).placement;
    expect(dunnageUnder([ghost], [], CATALOGUE, OPTIONS)).toBe(100);
  });

  it('lifts a layer with plates clear of the deck, in bearer sizes', () => {
    // The layer's own plates hang 140 below its shafts; +25 clearance = 165
    // → 200 mm bearers.
    expect(
      dunnageUnder([place(SINGLE).placement], [], CATALOGUE, OPTIONS),
    ).toBe(200);
  });

  it('lands on an exact bearer size without bumping to the next', () => {
    // Protrusion 125 + 25 clearance = 150 exactly.
    const flush = pileType('flush', [
      {offsetFromButt: 500, radius: 185, length: 100},
    ]);
    const catalogue: Catalogue = {pileTypes: [flush], vehicles: []};
    expect(dunnageUnder([place(flush).placement], [], catalogue, OPTIONS)).toBe(
      150,
    );
  });

  it('never goes below the stated bearer', () => {
    // Protrusion 10 + 25 = 35 → the 100 mm floor wins.
    const stub = pileType('stub', [
      {offsetFromButt: 500, radius: 70, length: 100},
    ]);
    const catalogue: Catalogue = {pileTypes: [stub], vehicles: []};
    expect(dunnageUnder([place(stub).placement], [], catalogue, OPTIONS)).toBe(
      100,
    );
  });

  // A SINGLE seated on the deck: 200 mm bearers, so its axis sits at 260 and
  // its shaft-top plane at 320. The cases below stack over it.
  const seatedSingle = {
    layer: [place(SINGLE, {id: 'below'}).placement],
    base: 200,
  };

  it('clears the plates below when the piles sit right on top of them', () => {
    // Plate to shaft wants 285 of axis distance straight up: the next base
    // must reach 260 + 285 − 60 = 485, which is 165 of bearer over the 320
    // shaft-top plane → 200 mm.
    expect(
      dunnageUnder(
        [place(PLAIN).placement],
        [seatedSingle],
        CATALOGUE,
        OPTIONS,
      ),
    ).toBe(200);
  });

  it('lets longitudinal stagger buy the bearers back down', () => {
    // The pile above starts past the whole pile below — no station is
    // shared, nothing to clear, standard bearers.
    expect(
      dunnageUnder(
        [place(PLAIN, {x: 6100}).placement],
        [seatedSingle],
        CATALOGUE,
        OPTIONS,
      ),
    ).toBe(100);
  });

  it('lets lateral distance buy the bearers back down', () => {
    // 300 across ≥ the 285 the plates want — cleared sideways, not upward.
    expect(
      dunnageUnder(
        [place(PLAIN, {y: 300}).placement],
        [seatedSingle],
        CATALOGUE,
        OPTIONS,
      ),
    ).toBe(100);
  });

  it('spends partial lateral distance and makes up the rest in thickness', () => {
    // 100 across of the 285 wanted: √(285² − 100²) ≈ 267 must come
    // vertically → base ≥ 467, 147 of bearer → 150 mm.
    expect(
      dunnageUnder(
        [place(PLAIN, {y: 100}).placement],
        [seatedSingle],
        CATALOGUE,
        OPTIONS,
      ),
    ).toBe(150);
  });
});

describe('where the timbers under a pack land', () => {
  const stationsFor = (piles: ReturnType<typeof place>[]) =>
    bearerStations(piles, null);

  it('puts one near each end of the pack', () => {
    // A 6 m plain shaft: 300 mm in from the lead end, 300 mm in from the
    // trailing end less the timber's own 100 mm.
    expect(stationsFor([place(PLAIN, {x: 0})])).toEqual([
      BEARER_END_INSET,
      PILE_LENGTH - BEARER_END_INSET - BEARER_WIDTH,
    ]);
  });

  it('never lands a timber on a plate', () => {
    // A plate over the preferred station: 350 mm from the butt, 100 long, so
    // it covers 300–400 — exactly where the front timber wants to be.
    const blocked = pileType('blocked', [helixAt(350)]);
    const [front, rear] = stationsFor([place(blocked, {x: 0})]);

    // Walked inward to clear the plate rather than outward toward the end.
    expect(front).toBe(400);
    expect(rear).toBe(PILE_LENGTH - BEARER_END_INSET - BEARER_WIDTH);
  });

  it('stays inside the shortest pile of a mixed pack', () => {
    const short = pileType('short', [], {length: 3000});
    const stations = stationsFor([
      place(PLAIN, {id: 'long', x: 0}),
      place(short, {id: 'short', x: 0, y: 400}),
    ]);

    expect(stations).toEqual([BEARER_END_INSET, 3000 - BEARER_END_INSET - 100]);
  });

  it('gives up rather than pretend one timber is two', () => {
    // A stub barely longer than a timber, with a plate over most of it.
    const stub = pileType('stub', [helixAt(90, {length: 100})], {length: 250});

    expect(stationsFor([place(stub, {x: 0})]).length).toBeLessThan(2);
  });
});

describe('the ground a tier offers the timbers above it', () => {
  it('does not bridge the gap between rows', () => {
    // Two rows laid end to end with a 200 mm gap: a 100 mm timber dropped in
    // that gap holds nothing, so the ground stops and restarts.
    const rows = [
      place(PLAIN, {id: 'a', x: 0}).placement,
      place(PLAIN, {id: 'b', x: PILE_LENGTH + 200, pack: 1}).placement,
    ];

    expect(bearingGround(rows, CATALOGUE)).toEqual([
      [0, PILE_LENGTH],
      [PILE_LENGTH + 200, PILE_LENGTH * 2 + 200],
    ]);
  });

  it('cuts out the plates poking up out of the tier', () => {
    // SINGLE's plate covers 450–550 of a pile laid at x = 0.
    expect(bearingGround([place(SINGLE, {x: 0}).placement], CATALOGUE)).toEqual(
      [
        [0, 450],
        [550, PILE_LENGTH],
      ],
    );
  });

  it('keeps an upper tier off the shaft the row below does not reach', () => {
    // Tier 1 spans the join between two rows below. Its timbers have to land
    // on one row or the other, never over the gap between them.
    const placements = [
      place(PLAIN, {id: 'a', tier: 0, x: 0}).placement,
      place(PLAIN, {id: 'b', tier: 0, x: PILE_LENGTH + 200, pack: 1}).placement,
      place(PLAIN, {id: 'c', tier: 1, x: PILE_LENGTH - 3000}).placement,
    ];
    const above = deckBearers(placements, CATALOGUE, OPTIONS).filter(
      bearer => bearer.tier === 1,
    );

    expect(above).toHaveLength(2);
    for (const bearer of above) {
      const overGap =
        bearer.x + bearer.width > PILE_LENGTH && bearer.x < PILE_LENGTH + 200;
      expect(overGap).toBe(false);
    }
  });
});

describe('every pack on two timbers', () => {
  it('bears each pack of a tier separately', () => {
    // The head-to-tail case: two rows in one tier. Timbers sized to the tier
    // would put one under each row; each pack needs two of its own.
    const placements = [
      place(PLAIN, {id: 'a', x: 0, pack: 0}).placement,
      place(PLAIN, {id: 'b', x: PILE_LENGTH + 200, pack: 1}).placement,
    ];
    const bearers = deckBearers(placements, CATALOGUE, OPTIONS);

    expect(bearers.filter(bearer => bearer.pack === 0)).toHaveLength(2);
    expect(bearers.filter(bearer => bearer.pack === 1)).toHaveLength(2);
    expect(everyPackIsBorne(placements, CATALOGUE, OPTIONS)).toBe(true);
  });

  it('runs each timber the width of the pack it carries, at the tier thickness', () => {
    const placements = [
      place(SINGLE, {id: 'a', x: 0, y: -300}).placement,
      place(SINGLE, {id: 'b', x: 0, y: 300}).placement,
    ];
    const [bearer] = deckBearers(placements, CATALOGUE, OPTIONS);

    // Steel from −500 to 500 (helix radius 200 either side of the outer
    // axes), on the 200 mm timbers the fixture's 140 mm protrusion demands.
    expect(bearer!.span).toEqual([-500, 500]);
    expect(bearer!.thickness).toBe(200);
    expect(bearer!.top).toBe(200);
  });

  it('says no when a pack cannot be borne where it stands', () => {
    const stub = pileType('stub', [helixAt(90, {length: 100})], {length: 250});
    const placements = [place(stub, {x: 0}).placement];

    expect(
      everyPackIsBorne(placements, {pileTypes: [stub], vehicles: []}, OPTIONS),
    ).toBe(false);
  });
});

describe('the footprint a tier offers the one above', () => {
  it('bridges the gap between two packs of equal height', () => {
    const layer = [
      place(SINGLE, {pack: 0, y: -500}).placement, // span [-700, -300]
      place(SINGLE, {pack: 1, y: 500}).placement, // span [300, 700]
    ];
    expect(footprintOver(layer, CATALOGUE, OPTIONS, 0, 6000)).toEqual([
      [-700, 700],
    ]);
  });

  it('merges a starter pack with a plain pack on the same shaft size', () => {
    // Bearers rest on shafts, and these share a 60 mm shaft — level ground,
    // whatever their plates do.
    const layer = [
      place(SINGLE, {pack: 0, y: -500}).placement, // span [-700, -300]
      place(PLAIN, {pack: 1, y: 500}).placement, // span [440, 560]
    ];
    expect(footprintOver(layer, CATALOGUE, OPTIONS, 0, 6000)).toEqual([
      [-700, 560],
    ]);
  });

  it('keeps packs of different shaft sizes apart', () => {
    const fat = pileType('fat', [], {shaftRadius: 100});
    const catalogue: Catalogue = {pileTypes: [PLAIN, fat], vehicles: []};
    const layer = [
      place(fat, {pack: 0, y: -500}).placement, // shaft top 200
      place(PLAIN, {pack: 1, y: 500}).placement, // shaft top 120
    ];
    expect(footprintOver(layer, catalogue, OPTIONS, 0, 6000)).toEqual([
      [-600, -400],
      [440, 560],
    ]);
  });

  it('judges each stretch of deck on the rows that actually cover it', () => {
    // A pack forward at one side, a pack aft at the other: over the forward
    // half only the forward pack holds; across the whole run, nothing does.
    const layer = [
      place(PLAIN, {id: 'fore', pack: 0, x: 0, y: -500}).placement,
      place(PLAIN, {id: 'aft', pack: 1, x: 6300, y: 500}).placement,
    ];
    expect(footprintOver(layer, CATALOGUE, OPTIONS, 0, 6000)).toEqual([
      [-560, -440],
    ]);
    expect(footprintOver(layer, CATALOGUE, OPTIONS, 0, 12300)).toEqual([]);
  });

  it('has no verdict where nothing lies beneath at all', () => {
    const below = [place(PLAIN, {x: 0}).placement];
    expect(footprintOver(below, CATALOGUE, OPTIONS, 8000, 12000)).toBeNull();
    expect(footprintOver(below, CATALOGUE, OPTIONS, 3000, 3000)).toBeNull();
  });

  it('has no verdict when nothing resolves', () => {
    const ghost = place(PLAIN, {pileTypeId: 'ghost'}).placement;
    expect(footprintOver([ghost], CATALOGUE, OPTIONS, 0, 6000)).toBeNull();
  });
});

describe('tier heights with derived bearers', () => {
  it('stacks plain tiers shaft-on-bearer', () => {
    const placements = [
      place(PLAIN, {id: 'a', tier: 0}).placement,
      place(PLAIN, {id: 'b', tier: 1}).placement,
    ];
    const heights = layerHeights(placements, CATALOGUE, OPTIONS);
    // Plain shafts want only the 145 mm shaft floor between axes, and the
    // standard bearer already gives 220 — the floor never binds.
    expect(heights.get(0)).toEqual({dunnage: 100, base: 100, shaftTop: 220});
    expect(heights.get(1)).toEqual({dunnage: 100, base: 320, shaftTop: 440});
  });

  it('thickens the bearers between a starter tier and piles right above it', () => {
    const placements = [
      place(SINGLE, {id: 'a', tier: 0}).placement,
      place(PLAIN, {id: 'b', tier: 1}).placement,
    ];
    const heights = layerHeights(placements, CATALOGUE, OPTIONS);
    // Tier 0 needs 200 mm bearers for its own plates; tier 1 sits straight
    // over those plates and needs 200 mm more to clear them.
    expect(heights.get(0)).toEqual({dunnage: 200, base: 200, shaftTop: 320});
    expect(heights.get(1)).toEqual({dunnage: 200, base: 520, shaftTop: 640});
  });

  it('reads an axis height of one shaft radius for a tier the map does not know', () => {
    // A placement pointing at a tier with no layer entry — a plan mid-edit —
    // falls back to seating on the deck itself rather than crashing.
    expect(axisHeightOf(place(SINGLE, {tier: 9}), new Map())).toBe(60);
  });

  it('guards against a tall plate reaching past the tier above it', () => {
    // Tier 0 carries a 400 mm plate on a 60 mm shaft — 340 proud. Tier 1 is
    // a plain pile well off to the side, so its bearers stay standard and
    // its shafts sit low. Tier 2 comes back over the big plate: its bearers
    // must clear a plate from TWO tiers down, not just the layer beneath.
    const big = pileType('big', [
      {offsetFromButt: 500, radius: 400, length: 100},
    ]);
    const catalogue: Catalogue = {pileTypes: [PLAIN, big], vehicles: []};
    const placements = [
      place(big, {id: 'a', tier: 0}).placement,
      place(PLAIN, {id: 'b', tier: 1, y: 600}).placement,
      place(PLAIN, {id: 'c', tier: 2}).placement,
    ];
    const heights = layerHeights(placements, catalogue, OPTIONS);
    expect(heights.get(0)).toEqual({dunnage: 400, base: 400, shaftTop: 520});
    expect(heights.get(1)).toEqual({dunnage: 100, base: 620, shaftTop: 740});
    // Plate top at 860; the plate-to-shaft rule wants 485 of distance from
    // the big pile's axis at 460 → base 890, i.e. 150 mm bearers, not 100.
    expect(heights.get(2)).toEqual({dunnage: 150, base: 890, shaftTop: 1010});
  });
});

describe('the pack manifest', () => {
  it('names packs tier by tier, front to rear, left to right', () => {
    const placements = [
      // Tier 1, one pack — named last.
      place(PLAIN, {id: 'top', tier: 1, pack: 0, x: 100}).placement,
      // Tier 0: a rear row, then a front row of two packs abreast.
      place(PLAIN, {id: 'rear', tier: 0, pack: 2, x: 6300}).placement,
      place(PLAIN, {id: 'left', tier: 0, pack: 0, x: 100, y: -300}).placement,
      place(PLAIN, {id: 'right', tier: 0, pack: 1, x: 100, y: 300}).placement,
    ];
    const manifest = packManifest(placements, CATALOGUE, OPTIONS);

    expect(manifest.map(pack => pack.id)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(manifest.map(pack => pack.placements[0]!.id)).toEqual([
      'left',
      'right',
      'rear',
      'top',
    ]);
  });

  it('rolls a pack up into counts of each component', () => {
    const placements = [
      place(SINGLE, {id: 'a', y: 0}).placement,
      place(SINGLE, {id: 'b', y: 400}).placement,
      place(SINGLE, {id: 'c', y: 800}).placement,
    ];
    const [pack] = packManifest(placements, CATALOGUE, OPTIONS);

    expect(pack!.contents).toEqual([
      {code: 'single', part: 'starter', length: 6000, count: 3},
    ]);
    expect(pack!.length).toBe(6000);
    expect(pack!.width).toBe(1200);
    expect(pack!.mass).toBe(750);
    expect(pack!.dunnage).toBe(200);
  });

  it('carries the bearer size of the pack tier', () => {
    const placements = [
      place(SINGLE, {id: 'a', tier: 0}).placement,
      place(PLAIN, {id: 'b', tier: 1}).placement,
    ];
    const manifest = packManifest(placements, CATALOGUE, OPTIONS);

    expect(manifest.map(pack => pack.dunnage)).toEqual([200, 200]);
  });

  it('says nothing it cannot resolve', () => {
    const ghost = place(PLAIN, {pileTypeId: 'ghost'}).placement;
    const [pack] = packManifest([ghost], CATALOGUE, OPTIONS);

    expect(pack!.contents).toEqual([]);
    expect(pack!.mass).toBe(0);
    expect(pack!.span).toBeNull();
  });
});
