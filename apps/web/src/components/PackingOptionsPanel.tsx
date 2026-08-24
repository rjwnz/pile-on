import {useState} from 'react';
import {DEFAULT_PACKING_OPTIONS, type PackingOptions} from '@pile-on/core';
import {Button, Field} from './ui';

function NumberField({
  label,
  suffix,
  value,
  onChange,
  hint,
}: {
  readonly label: string;
  readonly suffix: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Field
        label={label}
        suffix={suffix}
        type="number"
        value={String(value)}
        onChange={raw => {
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed >= 0) {
            onChange(parsed);
          }
        }}
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * The numbers a load is judged against — not preferences. They decide whether
 * a plan is legal, so they travel in the session file with the job.
 */
export function PackingOptionsPanel({
  options,
  onChange,
}: {
  readonly options: PackingOptions;
  readonly onChange: (options: PackingOptions) => void;
}) {
  const [open, setOpen] = useState(false);
  const changed =
    JSON.stringify(options) !== JSON.stringify(DEFAULT_PACKING_OPTIONS);

  const patch = (part: Partial<PackingOptions>) =>
    onChange({...options, ...part});
  const patchClearances = (part: Partial<PackingOptions['clearances']>) =>
    patch({clearances: {...options.clearances, ...part}});
  const patchBalance = (part: Partial<PackingOptions['balance']>) =>
    patch({balance: {...options.balance, ...part}});

  return (
    <div className="rounded border border-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-expanded={open}
          className="text-sm font-medium text-slate-800"
        >
          {open ? '▾' : '▸'} Loading rules
          <span className="ml-2 font-normal text-slate-500">
            {options.clearances.helixToShaft} mm helix-to-shaft ·{' '}
            {options.balance.longitudinal} mm balance
            {changed ? ' · edited' : ''}
          </span>
        </button>
        {changed ? (
          <Button onClick={() => onChange(DEFAULT_PACKING_OPTIONS)}>
            Reset to defaults
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-4 border-t border-slate-200 p-3">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-900">Clearances</h4>
            <p className="text-xs text-slate-500">
              The smallest gap allowed between two steel surfaces. Staggering
              piles along the deck mainly opens up the helix-to-shaft gap, so
              that figure decides how much the packer can save.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Shaft to shaft"
                suffix="mm"
                value={options.clearances.shaftToShaft}
                onChange={shaftToShaft => patchClearances({shaftToShaft})}
              />
              <NumberField
                label="Helix to shaft"
                suffix="mm"
                value={options.clearances.helixToShaft}
                onChange={helixToShaft => patchClearances({helixToShaft})}
              />
              <NumberField
                label="Helix to helix"
                suffix="mm"
                value={options.clearances.helixToHelix}
                onChange={helixToHelix => patchClearances({helixToHelix})}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-900">Balance</h4>
            <p className="text-xs text-slate-500">
              How far the load&rsquo;s centre of mass may sit from where the
              deck wants it. This is not a legal limit. It stands in for axle
              share and roll stability, which this model does not calculate, so
              the defaults are deliberately tight until you set real ones.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                label="Along the deck"
                suffix="mm"
                value={options.balance.longitudinal}
                onChange={longitudinal => patchBalance({longitudinal})}
              />
              <NumberField
                label="Across the deck"
                suffix="mm"
                value={options.balance.lateral}
                onChange={lateral => patchBalance({lateral})}
              />
              <NumberField
                label="Pack weight match"
                suffix="ratio"
                value={options.minPackMassRatio}
                hint="Two packs sharing a tier: the lighter must weigh at least this fraction of the heavier. 0 turns the rule off."
                onChange={minPackMassRatio => patch({minPackMassRatio})}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-900">Packing</h4>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.allowFlips}
                onChange={event => patch({allowFlips: event.target.checked})}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-slate-700">
                  Allow head-to-toe flipping
                </span>
                <span className="block text-xs text-slate-500">
                  Loading a pile tip-first moves its plates to the other end.
                  This is another way to keep them clear of a neighbour&rsquo;s
                  plates. Turn it off if the site needs every pile facing the
                  same way for unloading.
                </span>
              </span>
            </label>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-900">
              Bearers and spacing
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Dunnage thickness"
                suffix="mm"
                value={options.dunnageThickness}
                onChange={dunnageThickness => patch({dunnageThickness})}
              />
              <NumberField
                label="End gap"
                suffix="mm"
                value={options.endGap}
                onChange={endGap => patch({endGap})}
              />
              <NumberField
                label="Side margin"
                suffix="mm"
                value={options.sideMargin}
                onChange={sideMargin => patch({sideMargin})}
              />
              <NumberField
                label="Headboard gap"
                suffix="mm"
                value={options.headboardGap}
                onChange={headboardGap => patch({headboardGap})}
              />
              <NumberField
                label="Max tiers"
                suffix="count"
                value={options.maxTiers}
                onChange={maxTiers => patch({maxTiers})}
              />
              <NumberField
                label="Bearers and lashings"
                suffix="kg per tier"
                value={options.ancillaryMassPerTier}
                hint="This weight counts against the payload."
                onChange={ancillaryMassPerTier => patch({ancillaryMassPerTier})}
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
