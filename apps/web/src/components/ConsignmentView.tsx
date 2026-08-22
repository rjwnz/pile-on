import {Suspense, lazy, memo, useRef} from 'react';
import {
  balanceOffset,
  consignmentPayload,
  findVehicle,
  loadHeight,
  loadOverhang,
  loadWidth,
  payloadCapacity,
  tiersOf,
  toMetres,
  toTonnes,
  type Catalogue,
  type Consignment,
  type LoadingOptions,
  type Placement,
  type Violation,
} from '@pile-on/core';
/*
 * three.js is most of the bundle, and plenty of sessions never leave the
 * catalogue tabs. Loading it only when a plan is actually on screen keeps that
 * weight off everyone else.
 */
const IsometricPlanCanvas = lazy(async () => ({
  default: (await import('./IsometricPlanCanvas')).IsometricPlanCanvas,
}));
import {useInView} from '../lib/useInView';
import {TierPlanSvg} from './TierPlanSvg';

const ISOMETRIC_TITLE = 'Loaded truck';

/**
 * The box the 3D view will occupy, held open before it arrives.
 *
 * Same dimensions as the real thing, so a truck coming into view does not shove
 * the rest of the page down as it builds.
 */
function IsometricPlaceholder({note}: {readonly note: string}) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium text-slate-800">
        {ISOMETRIC_TITLE}
      </figcaption>
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded border border-slate-200 bg-white text-sm text-slate-500">
        {note}
      </div>
    </figure>
  );
}

function Metric({
  label,
  value,
  detail,
  over = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly over?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={`tabular-nums ${over ? 'font-semibold text-red-700' : 'text-slate-900'}`}
      >
        {value}
        {detail ? (
          <span className="ml-1 text-xs font-normal text-slate-500">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * One truck: the numbers, then the exploded per-tier plans, then the 3D view.
 *
 * Tiers are stacked down the page rather than literally side by side. On a
 * 12.5 m × 2.45 m deck the panels are five times wider than they are tall, so
 * placing them abreast would shrink each one past the point of being checkable
 * — the point of exploding them is that each tier gets the full width.
 */
function Truck({
  consignment,
  index,
  total,
  catalogue,
  placements,
  options,
  violations,
}: {
  readonly consignment: Consignment;
  readonly index: number;
  readonly total: number;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly options: LoadingOptions;
  readonly violations: readonly Violation[];
}) {
  /*
   * The 3D view is built only once this truck is scrolled to. A plan is a tall
   * page and only one truck is on screen at a time, so building all of them on
   * arrival is work done for nobody. Declared before the early return below,
   * because hooks cannot be conditional.
   */
  const stageRef = useRef<HTMLDivElement>(null);
  const showIsometric = useInView(stageRef);

  const vehicle = findVehicle(catalogue, consignment.vehicleId);
  if (!vehicle) {
    return (
      <div
        role="alert"
        className="rounded border border-red-300 bg-red-50 p-3 text-sm"
      >
        Truck {index + 1} uses vehicle &ldquo;{consignment.vehicleId}&rdquo;,
        which is not in the catalogue.
      </div>
    );
  }

  // Bearers and lashings included: this is the number the payload limit
  // applies to, and showing the piles alone would flatter the load.
  const mass = consignmentPayload(placements, catalogue, options);
  const payload = payloadCapacity(vehicle);
  const height =
    vehicle.deckHeight + loadHeight(placements, catalogue, options);
  const width = loadWidth(placements, catalogue);
  const offset = balanceOffset(placements, catalogue, vehicle);
  const overhang = loadOverhang(placements, catalogue, vehicle);
  /*
   * Shown only when there is something to say — either the load is hanging out
   * or the yard has said it may. A column reading "0 of 0 mm" on every truck is
   * noise, and noise is what stops the one that matters being noticed.
   */
  const showOverhang =
    overhang.front > 0 ||
    overhang.rear > 0 ||
    vehicle.maxFrontOverhang > 0 ||
    vehicle.maxRearOverhang > 0;
  const tiers = tiersOf(placements);
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  return (
    <article
      className="space-y-4 rounded-lg border border-slate-300 bg-white p-4"
      data-testid={`consignment-${consignment.id}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          Truck {index + 1} of {total}
          <span className="ml-2 font-normal text-slate-500">
            {vehicle.name} · {consignment.id}
          </span>
        </h3>
        {errors.length === 0 ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-900">
            Legal{warnings.length > 0 ? ` · ${warnings.length} to note` : ''}
          </span>
        ) : (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-900">
            {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
          </span>
        )}
      </header>

      <dl
        className={`grid grid-cols-2 gap-3 text-sm ${
          showOverhang ? 'sm:grid-cols-4 lg:grid-cols-7' : 'sm:grid-cols-6'
        }`}
      >
        <Metric label="Piles" value={String(placements.length)} />
        <Metric
          label="Load mass"
          value={`${toTonnes(mass).toFixed(2)} t`}
          detail={`of ${toTonnes(payload).toFixed(1)} t`}
          over={mass > payload}
        />
        <Metric
          label="Payload used"
          value={payload > 0 ? `${Math.round((mass / payload) * 100)}%` : '—'}
        />
        <Metric
          label="Loaded height"
          value={`${toMetres(height).toFixed(2)} m`}
          detail="of 4.3 m"
          over={height > 4300}
        />
        <Metric
          label="Loaded width"
          value={`${toMetres(width).toFixed(2)} m`}
          detail="of 2.55 m"
          over={width > 2550}
        />
        <Metric
          label="Balance"
          value={
            offset
              ? `${offset.longitudinal >= 0 ? '+' : '−'}${Math.abs(Math.round(offset.longitudinal))} mm`
              : '—'
          }
          detail={
            offset
              ? `${offset.longitudinal >= 0 ? 'aft' : 'fwd'} · ${Math.abs(Math.round(offset.lateral))} mm off centre`
              : 'nothing loaded'
          }
          over={
            offset !== null &&
            (Math.abs(offset.longitudinal) > options.balance.longitudinal ||
              Math.abs(offset.lateral) > options.balance.lateral)
          }
        />
        {showOverhang ? (
          <Metric
            label="Overhang"
            value={`${Math.round(overhang.rear)} mm`}
            detail={
              overhang.front > 0
                ? `rear, of ${vehicle.maxRearOverhang} allowed · ${Math.round(overhang.front)} mm past the headboard`
                : `rear, of ${vehicle.maxRearOverhang} mm allowed`
            }
            over={
              overhang.rear > vehicle.maxRearOverhang ||
              overhang.front > vehicle.maxFrontOverhang
            }
          />
        ) : null}
      </dl>

      {violations.length > 0 ? (
        <ul
          role="alert"
          className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm"
        >
          {violations.map((violation, position) => (
            <li key={`${violation.rule}-${position}`}>
              <span
                className={
                  violation.severity === 'error'
                    ? 'font-medium text-red-800'
                    : 'font-medium text-amber-800'
                }
              >
                {violation.severity === 'error' ? 'Error' : 'Note'}
              </span>{' '}
              <span className="text-slate-800">{violation.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-3">
        {tiers.map((tier, position) => (
          <TierPlanSvg
            key={tier}
            vehicle={vehicle}
            catalogue={catalogue}
            tier={tier}
            placements={placements.filter(p => p.tier === tier)}
            title={`Tier ${tier + 1}${position === 0 ? ' — on the deck' : ''}${
              position === tiers.length - 1 && tiers.length > 1 ? ' — top' : ''
            }`}
          />
        ))}
      </div>

      <div ref={stageRef}>
        {showIsometric ? (
          <Suspense
            fallback={<IsometricPlaceholder note="Loading the 3D view…" />}
          >
            <IsometricPlanCanvas
              vehicle={vehicle}
              catalogue={catalogue}
              placements={placements}
              options={options}
              title={ISOMETRIC_TITLE}
            />
          </Suspense>
        ) : (
          <IsometricPlaceholder note="" />
        )}
      </div>
    </article>
  );
}

/**
 * Memoised, and it earns its keep.
 *
 * Rebuilding a truck means rebuilding its 3D scene, which is the expensive
 * thing on this page. Now that the caller hands over arrays that keep their
 * identity, this stops a change elsewhere in the panel — picking a different
 * vehicle to pack onto, say — from touching trucks whose load has not moved.
 */
export const ConsignmentView = memo(Truck);
