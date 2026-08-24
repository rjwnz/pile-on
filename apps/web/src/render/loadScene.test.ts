import {describe, expect, it} from '@jest/globals';
import * as THREE from 'three';
import {
  DEFAULT_LOADING_OPTIONS,
  type Catalogue,
  type Placement,
  type Vehicle,
} from '@pile-on/core';
import {buildLoadScene, frameIsometric} from './loadScene';
import {colourForPileType} from './palette';

const SP168 = {
  id: 'SP168-D6',
  name: 'SP168',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [
    {offsetFromButt: 400, radius: 225, length: 110},
    {offsetFromButt: 1100, radius: 175, length: 110},
  ],
};

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  payloadCapacity: 28200,
  towableBy: [],
};

const CATALOGUE: Catalogue = {pileTypes: [SP168], vehicles: [SEMI]};
const OPTIONS = DEFAULT_LOADING_OPTIONS;

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'PL-1',
    consignmentId: 'C1',
    deck: 'truck',
    pileTypeId: 'SP168-D6',
    tier: 0,
    pack: 0,
    x: 100,
    y: 0,
    flipped: false,
    ...overrides,
  };
}

function build(placements: Placement[] = [place()]) {
  return buildLoadScene({
    vehicle: SEMI,
    catalogue: CATALOGUE,
    placements,
    options: OPTIONS,
  });
}

function meshesNamed(content: THREE.Object3D, prefix: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  content.traverse(object => {
    if (object instanceof THREE.Mesh && object.name.startsWith(prefix)) {
      found.push(object);
    }
  });
  return found;
}

describe('buildLoadScene', () => {
  it('draws a deck and one shaft per pile', () => {
    const {content} = build([place({id: 'a'}), place({id: 'b', y: 600})]);

    expect(meshesNamed(content, 'deck')).toHaveLength(1);
    expect(meshesNamed(content, 'shaft:')).toHaveLength(2);
  });

  it('draws every helix plate as its own solid, not as decoration', () => {
    const {content} = build();

    expect(meshesNamed(content, 'helix:')).toHaveLength(2);
  });

  it('lights the scene, or every solid would be a silhouette', () => {
    const {scene} = build();
    const lights = scene.children.filter(child => child instanceof THREE.Light);

    expect(lights.length).toBeGreaterThanOrEqual(2);
  });

  it('lays each shaft along the deck, centred on its own span', () => {
    const {content} = build([place({x: 100})]);
    const shaft = meshesNamed(content, 'shaft:')[0]!;

    // 100 to 6100, so the centre is 3100.
    expect(shaft.position.x).toBeCloseTo(3100);
    expect(shaft.position.y).toBeCloseTo(0);
  });

  it('seats the pile shaft-on-bearer, its plates hanging below', () => {
    const {content} = build([place({tier: 0})]);
    const shaft = meshesNamed(content, 'shaft:')[0]!;

    // 200 mm of bearer (the pile's own 141 mm of plate must clear the deck)
    // plus the 84 mm shaft radius.
    expect(shaft.position.z).toBeCloseTo(284);
  });

  it('lifts an upper tier clear of the plates below it', () => {
    const {content} = build([
      place({id: 'a', tier: 0}),
      place({id: 'b', tier: 1}),
    ]);
    const [lower, upper] = meshesNamed(content, 'shaft:');

    // Plates aligned dead over plates want 475 mm between axes, all of it
    // vertical here: 350 mm bearers over the 368 shaft-top plane.
    expect(upper!.position.z - lower!.position.z).toBeCloseTo(518);
  });

  it('draws two bearer timbers per pack, at their derived thickness', () => {
    const {content} = build([
      place({id: 'a', tier: 0}),
      place({id: 'b', tier: 1}),
    ]);
    const timbers = meshesNamed(content, 'dunnage:');

    expect(timbers).toHaveLength(4);
    // 200 mm timbers under the deck tier (its own plates must clear the
    // deck); 350 mm under the tier whose plates sit dead over the plates
    // below.
    const thicknesses = timbers.map(
      timber => (timber.geometry as THREE.BoxGeometry).parameters.depth,
    );
    expect(thicknesses).toEqual([200, 200, 350, 350]);
  });

  it('bears every pack of a tier, not just the tier', () => {
    // Two rows head to tail in one tier: timbers drawn per tier would leave
    // one under each row, and a bundle on one timber see-saws.
    const {content} = build([
      place({id: 'a', x: 100, pack: 0}),
      place({id: 'b', x: 6300, pack: 1}),
    ]);

    expect(meshesNamed(content, 'dunnage:0:0:')).toHaveLength(2);
    expect(meshesNamed(content, 'dunnage:0:1:')).toHaveLength(2);
  });

  it('runs each timber across the pack it carries, not across the tier', () => {
    const {content} = build([
      place({id: 'a', x: 100, y: -300, pack: 0}),
      place({id: 'b', x: 6300, y: 300, pack: 1}),
    ]);
    const [first] = meshesNamed(content, 'dunnage:0:0:');

    // Pack 0 is one pile at y = −300 with a 225 mm reach: 450 mm of timber
    // centred on the pile, not 1050 mm reaching across to pack 1.
    expect((first!.geometry as THREE.BoxGeometry).parameters.height).toBe(450);
    expect(first!.position.y).toBeCloseTo(-300);
  });

  it('lands its timbers clear of the helix plates', () => {
    const {content} = build([place({x: 0})]);
    const plates = meshesNamed(content, 'helix:');
    const timbers = meshesNamed(content, 'dunnage:');

    for (const timber of timbers) {
      const [t0, t1] = [timber.position.x - 50, timber.position.x + 50];
      for (const plate of plates) {
        const half =
          (plate.geometry as THREE.CylinderGeometry).parameters.height / 2;
        const [p0, p1] = [plate.position.x - half, plate.position.x + half];
        expect(t1 <= p0 || t0 >= p1).toBe(true);
      }
    }
  });

  it('puts each plate at its own station along the shaft', () => {
    const {content} = build([place({x: 100})]);
    const plates = meshesNamed(content, 'helix:');

    expect(plates[0]!.position.x).toBeCloseTo(500);
    expect(plates[1]!.position.x).toBeCloseTo(1200);
  });

  it('follows a flipped pile, measuring plates from the far end', () => {
    const {content} = build([place({x: 0, flipped: true})]);
    const plates = meshesNamed(content, 'helix:');

    expect(plates.map(plate => plate.position.x).sort((a, b) => a - b)).toEqual(
      [4900, 5600],
    );
  });

  it('colours a pile by its type', () => {
    const {content} = build();
    const shaft = meshesNamed(content, 'shaft:')[0]!;
    const shaftMaterial = shaft.material as THREE.MeshLambertMaterial;

    expect(`#${shaftMaterial.color.getHexString()}`).toBe(
      colourForPileType('SP168-D6').shaft,
    );
  });

  it('skips a placement whose pile type has gone missing', () => {
    const {content} = build([place({pileTypeId: 'GHOST'})]);

    expect(meshesNamed(content, 'shaft:')).toHaveLength(0);
    expect(meshesNamed(content, 'deck')).toHaveLength(1);
  });

  it('renders an empty deck without complaint', () => {
    const {content} = build([]);

    expect(meshesNamed(content, 'shaft:')).toHaveLength(0);
  });
});

describe('dispose', () => {
  it('releases every geometry it made', () => {
    const {content, dispose} = build();
    const disposed: string[] = [];
    content.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.addEventListener('dispose', () =>
          disposed.push(object.name),
        );
      }
    });

    dispose();

    // Deck, two bearer timbers, one shaft and two plates.
    expect(disposed).toHaveLength(6);
  });
});

describe('frameIsometric', () => {
  it('looks from above the rear kerb-side corner, with z up', () => {
    const {content} = build();
    const camera = frameIsometric(content, 16 / 9);
    const bounds = new THREE.Box3().setFromObject(content);
    const centre = bounds.getCenter(new THREE.Vector3());
    const toCentre = centre.clone().sub(camera.position).normalize();

    expect(camera.up.toArray()).toEqual([0, 0, 1]);
    expect(toCentre.x).toBeCloseTo(-1 / Math.sqrt(3));
    expect(toCentre.y).toBeCloseTo(1 / Math.sqrt(3));
    expect(toCentre.z).toBeCloseTo(-1 / Math.sqrt(3));
  });

  it('runs the deck left to right, the same way round as the tier plans', () => {
    const {content} = build();
    const camera = frameIsometric(content, 16 / 9);

    const headboard = new THREE.Vector3(0, 0, 0).project(camera);
    const rear = new THREE.Vector3(SEMI.deckLength, 0, 0).project(camera);

    expect(rear.x).toBeGreaterThan(headboard.x);
  });

  it('puts height up the screen', () => {
    const {content} = build();
    const camera = frameIsometric(content, 16 / 9);

    const low = new THREE.Vector3(6000, 0, 0).project(camera);
    const high = new THREE.Vector3(6000, 0, 2000).project(camera);

    expect(high.y).toBeGreaterThan(low.y);
  });

  it('is orthographic, so a rear pile measures the same as a front one', () => {
    const {content} = build();

    expect(frameIsometric(content, 16 / 9).isOrthographicCamera).toBe(true);
  });

  it('fits the whole load in frame', () => {
    const {content} = build([
      place({id: 'a', x: 100}),
      place({id: 'b', x: 6200}),
    ]);
    const camera = frameIsometric(content, 16 / 9);
    const bounds = new THREE.Box3().setFromObject(content);

    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('matches the canvas aspect, so nothing is stretched', () => {
    const {content} = build();

    for (const aspect of [21 / 9, 16 / 9, 1, 3 / 4]) {
      const camera = frameIsometric(content, aspect);
      expect(
        (camera.right - camera.left) / (camera.top - camera.bottom),
      ).toBeCloseTo(aspect);
    }
  });

  it('grows the spare axis rather than cropping, at any aspect', () => {
    // A 12.5 m deck is far wider than tall in this projection, so a narrow
    // canvas has to gain height. What must never happen is losing the load.
    const {content} = build([place({id: 'a'}), place({id: 'b', tier: 1})]);
    const bounds = new THREE.Box3().setFromObject(content);

    for (const aspect of [21 / 9, 1, 3 / 4]) {
      const camera = frameIsometric(content, aspect);
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const corner = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
