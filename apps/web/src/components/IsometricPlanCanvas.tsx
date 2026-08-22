import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import type {
  Catalogue,
  LoadingOptions,
  Placement,
  Vehicle,
} from '@pile-on/core';
import {buildLoadScene, frameIsometric} from '../render/loadScene';

/**
 * The loaded truck, rendered with a depth buffer.
 *
 * All this component owns is the renderer's lifecycle. The scene itself is
 * built by a pure function so the geometry can be unit tested — jsdom has no
 * WebGL context, so nothing here can be, and pretending otherwise would give
 * coverage without confidence.
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
  xray = false,
}: {
  readonly vehicle: Vehicle;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly options: LoadingOptions;
  readonly title: string;
  readonly xray?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    } catch {
      setUnsupported(true);
      return;
    }

    setUnsupported(false);
    // Cap the pixel ratio: past 2x the extra pixels cost more than they show.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const {scene, content, dispose} = buildLoadScene({
      vehicle,
      catalogue,
      placements,
      options,
      xray,
    });

    const draw = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) {
        return;
      }
      renderer.setSize(width, height, false);
      renderer.render(scene, frameIsometric(content, width / height));
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(host);

    return () => {
      observer.disconnect();
      dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [vehicle, catalogue, placements, options, xray]);

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
        ) : null}
      </div>
    </figure>
  );
}
