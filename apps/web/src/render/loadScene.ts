import * as THREE from 'three';
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
import {colourForPileType} from './palette';

/**
 * The loaded truck as a three.js scene.
 *
 * This replaced an SVG drawing that sorted shapes back to front. Painter's
 * ordering was the wrong tool: a correct order does not always exist for
 * overlapping solids, and every key or pairwise rule traded one family of
 * artefacts for another. A depth buffer resolves visibility per pixel, so the
 * question stops being "what order?" and simply does not arise.
 *
 * The cost is that this view is raster, so it no longer prints as crisply as
 * the exploded tier plans — those stay SVG, and they are the drawings a load
 * actually gets checked against.
 *
 * Coordinates stay in the domain's frame: x along the deck, y across it, z up.
 * three.js defaults to y-up, so the camera is told otherwise rather than the
 * geometry being bent to suit it.
 */

export interface LoadSceneInput {
  readonly vehicle: Vehicle;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly options: LoadingOptions;
  /** See through the load, to find a pile buried inside it. */
  readonly xray: boolean;
}

export interface LoadScene {
  readonly scene: THREE.Scene;
  /** Everything drawn, for framing and for tests. */
  readonly content: THREE.Group;
  dispose(): void;
}

const DECK_COLOUR = 0xcbd5e1;
const XRAY_OPACITY = 0.35;
/** Enough segments that a shaft reads as round at print zoom. */
const RADIAL_SEGMENTS = 20;

function material(colour: string | number, xray: boolean): THREE.Material {
  return new THREE.MeshLambertMaterial({
    color: colour,
    transparent: xray,
    opacity: xray ? XRAY_OPACITY : 1,
    // Without this, faded piles hide whatever is behind them anyway.
    depthWrite: !xray,
    side: xray ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/**
 * A cylinder lying along the deck.
 *
 * three builds cylinders along its own y axis, so the geometry is rotated once
 * at construction rather than every frame.
 */
function tube(
  x0: number,
  x1: number,
  y: number,
  z: number,
  radius: number,
  colour: string,
  xray: boolean,
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    x1 - x0,
    RADIAL_SEGMENTS,
  );
  geometry.rotateZ(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material(colour, xray));
  mesh.position.set((x0 + x1) / 2, y, z);
  return mesh;
}

export function buildLoadScene(input: LoadSceneInput): LoadScene {
  const {vehicle, catalogue, placements, options, xray} = input;
  const scene = new THREE.Scene();
  const content = new THREE.Group();
  content.name = 'load';
  scene.add(content);

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(1, 1, 1.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-1, -0.6, 0.4);
  scene.add(fill);

  const deckGeometry = new THREE.BoxGeometry(
    vehicle.deckLength,
    vehicle.deckWidth,
    120,
  );
  const deck = new THREE.Mesh(
    deckGeometry,
    new THREE.MeshLambertMaterial({color: DECK_COLOUR}),
  );
  deck.name = 'deck';
  deck.position.set(vehicle.deckLength / 2, 0, -60);
  content.add(deck);

  const heights = tierHeights(placements, catalogue, options);

  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    /*
     * The pile rests on its widest point — for a helical pile that is the
     * plates, not the shaft — so the axis sits one widest-radius above the
     * bearers. This matches how tier height is calculated.
     */
    const axisZ =
      tierBaseHeight(placement.tier, heights, options) + maxRadius(type);
    const colour = colourForPileType(type.id);

    const shaft = tube(
      placement.x,
      placement.x + type.length,
      placement.y,
      axisZ,
      type.shaftRadius,
      colour.shaft,
      xray,
    );
    shaft.name = `shaft:${placement.id}`;
    content.add(shaft);

    for (const [index, segment] of radiusProfile({type, placement})
      .filter(part => part.kind === 'helix')
      .entries()) {
      const plate = tube(
        segment.start,
        segment.end,
        placement.y,
        axisZ,
        segment.radius,
        colour.helix,
        xray,
      );
      plate.name = `helix:${placement.id}:${index}`;
      content.add(plate);
    }
  }

  return {
    scene,
    content,
    dispose() {
      content.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const used = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const entry of used) {
            entry.dispose();
          }
        }
      });
    },
  };
}

/**
 * Where the eye sits, relative to the load, in deck coordinates.
 *
 * Above the rear kerb-side corner: +x is the rear, −y is the kerb side (y runs
 * positive to the driver's right, and this is a right-hand-drive fleet), +z is
 * up. That is where someone actually stands to look at a load, and it puts the
 * headboard on the left with the deck running away to the right — the same way
 * round as the tier plans, so the two drawings can be read together.
 */
const EYE_DIRECTION = new THREE.Vector3(1, -1, 1).normalize();

/**
 * An orthographic camera framed to the load.
 *
 * Orthographic rather than perspective: this is an engineering drawing, and a
 * pile at the rear of the deck should measure the same as one at the front.
 */
export function frameIsometric(
  content: THREE.Object3D,
  aspect: number,
): THREE.OrthographicCamera {
  const bounds = new THREE.Box3().setFromObject(content);
  const centre = bounds.getCenter(new THREE.Vector3());
  const span = bounds.getSize(new THREE.Vector3()).length() || 1;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, span * 4);
  camera.up.set(0, 0, 1);
  camera.position.copy(centre).add(EYE_DIRECTION.clone().multiplyScalar(span));
  camera.lookAt(centre);
  camera.updateMatrixWorld();

  // Size the frustum from the load's own corners in camera space, so the view
  // is tight whatever the deck length and however many tiers are stacked.
  const inverse = camera.matrixWorldInverse;
  let halfWidth = 0;
  let halfHeight = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
        halfWidth = Math.max(halfWidth, Math.abs(corner.x));
        halfHeight = Math.max(halfHeight, Math.abs(corner.y));
      }
    }
  }

  const margin = 1.06;
  halfWidth *= margin;
  halfHeight *= margin;
  // Grow whichever axis the canvas has spare, never shrink — otherwise the
  // load would be cropped on a narrow viewport.
  if (halfWidth / halfHeight < aspect) {
    halfWidth = halfHeight * aspect;
  } else {
    halfHeight = halfWidth / aspect;
  }

  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  return camera;
}
