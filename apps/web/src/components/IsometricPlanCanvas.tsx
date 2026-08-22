import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  Catalogue,
  LoadingOptions,
  Placement,
  Vehicle,
} from '@pile-on/core';
import {
  buildLoadScene,
  frameIsometric,
  type LoadScene,
} from '../render/loadScene';
import {
  acquireRenderer,
  drawToCanvas,
  hasRenderer,
  onContextRestored,
  releaseRenderer,
} from '../render/sharedRenderer';

/**
 * The loaded truck, rendered with a depth buffer.
 *
 * The scene itself is built by a pure function so the geometry can be unit
 * tested — jsdom has no WebGL context, so nothing here can be, and pretending
 * otherwise would give coverage without confidence.
 *
 * What this component owns is timing, and it is deliberately split three ways.
 * The context is shared with every other view and lasts as long as the mount;
 * the scene is rebuilt only when the load changes; the draw happens whenever
 * either of those, or the size of the box, says it should. Keeping them apart
 * is the whole trick: uploading a fresh scene to the card costs on the order of
 * 150 ms, while drawing one already up there costs two. Every dependency added
 * to the wrong effect turns the cheap case into the expensive one.
 *
 * A machine with no WebGL gets a plain message rather than a blank box. The
 * exploded tier plans above are the drawings a load is checked against, so
 * losing this one is a nuisance, not a failure.
 */
export function IsometricPlanCanvas({
  vehicle,
  catalogue,
  placements,
  options,
  title,
}: {
  readonly vehicle: Vehicle;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly options: LoadingOptions;
  readonly title: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LoadScene | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  /** Draw whatever scene is currently in hand. Cheap, and safe to repeat. */
  const draw = useCallback(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const built = sceneRef.current;
    if (!host || !canvas || !built) {
      return;
    }
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    drawToCanvas(
      canvas,
      built.scene,
      frameIsometric(built.content, width / height),
      width,
      height,
    );
  }, []);

  /*
   * The context outlives every change to the load, so it gets an effect of its
   * own with nothing in its dependencies. Tying it to the data would hand the
   * context back and take a fresh one on every edit — which is precisely the
   * cost that sharing it was meant to remove.
   */
  useEffect(() => {
    if (!acquireRenderer()) {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    return releaseRenderer;
  }, []);

  // The scene. Rebuilt when the load changes, and not otherwise — which relies
  // on the caller handing over arrays that keep their identity between renders.
  useEffect(() => {
    if (!hasRenderer()) {
      return;
    }
    const built = buildLoadScene({vehicle, catalogue, placements, options});
    sceneRef.current = built;
    draw();
    return () => {
      built.dispose();
      sceneRef.current = null;
    };
  }, [vehicle, catalogue, placements, options, draw]);

  // Redraw when the box changes size, and again if the driver takes the context
  // away and returns it. The scene is still in hand for both, so both are cheap.
  useEffect(() => {
    const host = hostRef.current;
    const stopListening = onContextRestored(draw);
    if (!host || typeof ResizeObserver === 'undefined') {
      return stopListening;
    }
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => {
      observer.disconnect();
      stopListening();
    };
  }, [draw]);

  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium text-slate-800">
        {title}
      </figcaption>
      <div
        ref={hostRef}
        role="img"
        aria-label={title}
        data-testid="isometric-plan"
        className="aspect-[16/9] w-full overflow-hidden rounded border border-slate-300 bg-white"
      >
        {unsupported ? (
          <p className="p-6 text-sm text-slate-600">
            This browser cannot show the 3D view — it has no WebGL. The tier
            plans above show the same load.
          </p>
        ) : (
          <canvas ref={canvasRef} className="block h-full w-full" />
        )}
      </div>
    </figure>
  );
}
