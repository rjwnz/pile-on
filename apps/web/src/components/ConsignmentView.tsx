import {
  consignmentMass,
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
  type Violation,
} from '@pile-on/core';
import {IsometricPlanSvg} from './IsometricPlanSvg';
import {TierPlanSvg} from './TierPlanSvg';

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
export function ConsignmentView({
  consignment,
  index,
  total,
  catalogue,
  placements,
  options,
  violations,
  xray,
}: {
  readonly consignment: Consignment;
  readonly index: number;
  readonly total: number;
  readonly catalogue: Catalogue;
  readonly placements: readonly Placement[];
  readonly options: LoadingOptions;
  readonly violations: readonly Violation[];
  readonly xray: boolean;
}) {
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

  const mass = consignmentMass(placements, catalogue);
  const payload = payloadCapacity(vehicle);
  const height =
    vehicle.deckHeight + loadHeight(placements, catalogue, options);
  const width = loadWidth(placements, catalogue);
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

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
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

      <IsometricPlanSvg
        vehicle={vehicle}
        catalogue={catalogue}
        placements={placements}
        options={options}
        title="Loaded truck"
        xray={xray}
      />
    </article>
  );
}
