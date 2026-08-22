import * as THREE from 'three';

/**
 * One WebGL context for every load view on the page.
 *
 * A renderer per truck is where a component-shaped design lands you, and it is
 * what this app used to do. It was also the most expensive thing the loading
 * plan did: constructing a `WebGLRenderer` costs the better part of a second,
 * and it costs that whether the truck carries fifty piles or five. Six trucks
 * meant six of them, back to back, on the main thread, before anything drew.
 *
 * So the context is shared. Each view draws through it in turn and copies the
 * result into a 2D canvas of its own — the copy is a blit, and it does not
 * register against a render that takes milliseconds. What used to be a cost per
 * truck is now paid once for the page.
 *
 * Sharing also means the page holds one context rather than one per truck,
 * which matters: browsers cap how many they will keep alive, and a long plan
 * used to walk straight towards that cap.
 */

/** Past 2x the extra pixels cost more than they show. */
const MAX_PIXEL_RATIO = 2;

let renderer: THREE.WebGLRenderer | null = null;
let holders = 0;
/**
 * A machine without WebGL will not have grown it by the second view, and a
 * failed construction is not free. Ask once, then remember the answer.
 */
let unavailable = false;

/** Views to nudge when the driver takes the context away and hands it back. */
const restoreListeners = new Set<() => void>();

function handleContextLost(event: Event) {
  // Without this the context is gone for good. With it, the browser undertakes
  // to follow up with a 'restored', and the views can redraw.
  event.preventDefault();
}

function handleContextRestored() {
  for (const listener of restoreListeners) {
    listener();
  }
}

/**
 * Take a share of the renderer, creating it if this is the first caller.
 *
 * Returns false when the browser has no WebGL at all — callers are expected to
 * say so rather than show an empty box.
 */
export function acquireRenderer(): boolean {
  if (unavailable) {
    return false;
  }
  if (!renderer) {
    let created: THREE.WebGLRenderer;
    try {
      created = new THREE.WebGLRenderer({antialias: true, alpha: true});
    } catch {
      unavailable = true;
      return false;
    }
    created.setClearColor(0xffffff, 0);
    created.domElement.addEventListener('webglcontextlost', handleContextLost);
    created.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored,
    );
    renderer = created;
  }
  holders += 1;
  return true;
}

/** Give up a share. The context goes when the last view does. */
export function releaseRenderer(): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || !renderer) {
    return;
  }
  renderer.domElement.removeEventListener(
    'webglcontextlost',
    handleContextLost,
  );
  renderer.domElement.removeEventListener(
    'webglcontextrestored',
    handleContextRestored,
  );
  renderer.dispose();
  renderer = null;
}

/**
 * Whether a context is in hand — for callers deciding whether building a scene
 * is worth the work.
 */
export function hasRenderer(): boolean {
  return renderer !== null;
}

/** Ask to be told when a lost context comes back. Returns the unsubscribe. */
export function onContextRestored(listener: () => void): () => void {
  restoreListeners.add(listener);
  return () => {
    restoreListeners.delete(listener);
  };
}

/**
 * Draw a scene through the shared context and copy the result into `target`.
 *
 * `width` and `height` are CSS pixels; the backing store is sized from them so
 * the drawing stays sharp on a dense panel without paying for more than it
 * shows.
 */
export function drawToCanvas(
  target: HTMLCanvasElement,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): void {
  if (!renderer) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);

  const source = renderer.domElement;
  // Assigning either dimension clears the canvas, so only do it when the size
  // has actually moved.
  if (target.width !== source.width || target.height !== source.height) {
    target.width = source.width;
    target.height = source.height;
  }
  const context = target.getContext('2d');
  if (!context) {
    return;
  }
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0);
}
