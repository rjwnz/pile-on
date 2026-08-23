import {Suspense, lazy, memo, useRef} from 'react';
import {
  NZ_VDAM_2016,
  balanceOffset,
  combinationGross,
  consignmentPayload,
  findVehicle,
  loadHeight,
  loadWidth,
  payloadCapacity,
  tiersOf,
  toMetres,
  toTonnes,
  type Catalogue,
  type Consignment,
  type LoadingOptions,
  type Placement,
  type Vehicle,
  type Violation,
} from '@pile-on/core';
// three.js is most of the bundle; load it only when a plan is on screen.
const IsometricPlanCanvas = lazy(async () => ({
  default: (await import('./IsometricPlanCanvas')).IsometricPlanCanvas,
}));
import {useInView} from '../lib/useInView';
import {TierPlanSvg} from './TierPlanSvg';

/** The 3D view's box, held open at full size so its arrival shifts nothing. */
function IsometricPlaceholder({
  title,
  note,
}: {
  readonly title: string;
  readonly note: string;
}) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium text-slate-800">
        {title}
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
 * One deck of a movement: the numbers, the exploded per-tier plans, the 3D
 * view. `x` is deck-local, so the drawings need never know whether their deck
 * is towing or towed. Tiers stack down the page — abreast, each would be too
 * small to check.
 */
function DeckView({
  vehicle,
  placements,
  catalogue,
  options,
  heading,
}: {
  readonly vehicle: Vehicle;
  readonly placements: readonly Placement[];
  readonly catalogue: Catalogue;
  readonly options: LoadingOptions;
  /** Shown above the deck when the movement has more than one. */
  readonly heading: string | null;
}) {
  // The 3D view is built only once this deck is scrolled to.
  const stageRef = useRef<HTMLDivElement>(null);
  const showIsometric = useInView(stageRef);

  // Bearers and lashings included: this is the number the payload limit
  // applies to, and showing the piles alone would flatter the load.
  const mass = consignmentPayload(placements, catalogue, options);
  const payload = payloadCapacity(vehicle);
  const height =
    vehicle.deckHeight + loadHeight(placements, catalogue, options);
  const width = loadWidth(placements, catalogue);
  const offset = balanceOffset(placements, catalogue, vehicle);
  const tiers = tiersOf(placements);
  const isometricTitle = heading ? `Loaded ${heading}` : 'Loaded truck';

  return (
    <section className="space-y-4">
      {heading ? (
        <h4 className="border-t border-slate-200 pt-3 text-sm font-semibold text-slate-700">
          {heading}: {vehicle.name}
        </h4>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
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
      </dl>

      <div className="space-y-3">
        {tiers.map((tier, position) => (
          <TierPlanSvg
            key={tier}
            vehicle={vehicle}
            catalogue={catalogue}
            tier={tier}
            placements={placements.filter(p => p.tier === tier)}
            title={`Tier ${tier + 1}${position === 0 ? ' (on the deck)' : ''}${
              position === tiers.length - 1 && tiers.length > 1 ? ' (top)' : ''
            }`}
          />
        ))}
      </div>

      <div ref={stageRef}>
        {showIsometric ? (
          <Suspense
            fallback={
              <IsometricPlaceholder
                title={isometricTitle}
                note="Loading the 3D view…"
              />
            }
          >
            <IsometricPlanCanvas
              vehicle={vehicle}
              catalogue={catalogue}
              placements={placements}
              options={options}
              title={isometricTitle}
            />
          </Suspense>
        ) : (
          <IsometricPlaceholder title={isometricTitle} note="" />
        )}
      </div>
    </section>
  );
}

/** One movement: a truck deck, and the trailer deck behind it when there is one. */
function Movement({
  consignment,
  index,
  total,
  catalogue,
  truckPlacements,
  trailerPlacements,
  options,
  violations,
}: {
  readonly consignment: Consignment;
  readonly index: number;
  readonly total: number;
  readonly catalogue: Catalogue;
  readonly truckPlacements: readonly Placement[];
  readonly trailerPlacements: readonly Placement[];
  readonly options: LoadingOptions;
  readonly violations: readonly Violation[];
}) {
  const vehicle = findVehicle(catalogue, consignment.vehicleId);
  const trailer = consignment.trailerId
    ? findVehicle(catalogue, consignment.trailerId)
    : undefined;

  if (!vehicle || (consignment.trailerId && !trailer)) {
    const missing = !vehicle ? consignment.vehicleId : consignment.trailerId;
    return (
      <div
        role="alert"
        className="rounded border border-red-300 bg-red-50 p-3 text-sm"
      >
        Movement {index + 1} uses vehicle &ldquo;{missing}&rdquo;, which is not
        in the catalogue.
      </div>
    );
  }

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const gross = trailer
    ? combinationGross(
        vehicle,
        trailer,
        truckPlacements,
        trailerPlacements,
        catalogue,
        options,
      )
    : null;
  const truckGross =
    vehicle.tare + consignmentPayload(truckPlacements, catalogue, options);
  const trailerGross = trailer
    ? trailer.tare + consignmentPayload(trailerPlacements, catalogue, options)
    : null;

  return (
    <article
      className="space-y-4 rounded-lg border border-slate-300 bg-white p-4"
      data-testid={`consignment-${consignment.id}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          Movement {index + 1} of {total}
          <span className="ml-2 font-normal text-slate-500">
            {vehicle.name}
            {trailer ? ` + ${trailer.name}` : ''} · {consignment.id}
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

      {gross !== null && trailerGross !== null ? (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Metric
            label="Combination gross"
            value={`${toTonnes(gross).toFixed(2)} t`}
            detail={`of ${toTonnes(NZ_VDAM_2016.maxGrossMass).toFixed(0)} t route limit`}
            over={gross > NZ_VDAM_2016.maxGrossMass}
          />
          <Metric
            label="Trailer : truck"
            value={
              truckGross > 0 ? `${(trailerGross / truckGross).toFixed(2)}` : '—'
            }
            detail={`of ${NZ_VDAM_2016.maxTrailerToTruckMassRatio} allowed`}
            over={
              trailerGross >
              NZ_VDAM_2016.maxTrailerToTruckMassRatio * truckGross
            }
          />
        </dl>
      ) : null}

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

      <DeckView
        vehicle={vehicle}
        placements={truckPlacements}
        catalogue={catalogue}
        options={options}
        heading={trailer ? 'Truck deck' : null}
      />
      {trailer ? (
        <DeckView
          vehicle={trailer}
          placements={trailerPlacements}
          catalogue={catalogue}
          options={options}
          heading="Trailer deck"
        />
      ) : null}
    </article>
  );
}

// Memoised: rebuilding a movement rebuilds its 3D scenes, the expensive thing
// on this page, and unrelated panel edits must not touch unmoved loads.
export const ConsignmentView = memo(Movement);
