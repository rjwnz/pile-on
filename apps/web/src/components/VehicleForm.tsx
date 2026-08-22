import {useState} from 'react';
import {
  TYRE_CLASSES,
  TYRE_CLASS_LABELS,
  VEHICLE_KINDS,
  VEHICLE_KIND_LABELS,
  formatAxles,
  parseVehicleEntry,
  type CsvRow,
  type Issue,
  type TyreClass,
  type Vehicle,
  type VehicleKind,
} from '@pile-on/core';
import {Button, Field, IssueList, SelectField} from './ui';

interface AxleDraft {
  readonly position: string;
  readonly tyreClass: TyreClass;
  readonly setId: string;
  readonly steering: boolean;
}

interface Draft {
  readonly id: string;
  readonly name: string;
  readonly kind: VehicleKind;
  readonly deckLength: string;
  readonly deckWidth: string;
  readonly deckHeight: string;
  readonly tare: string;
  readonly maxGross: string;
  readonly axles: readonly AxleDraft[];
}

const BLANK_AXLE: AxleDraft = {
  position: '',
  tyreClass: 'T',
  setId: '',
  steering: false,
};

const BLANK: Draft = {
  id: '',
  name: '',
  kind: 'rigid',
  deckLength: '',
  deckWidth: '2450',
  deckHeight: '',
  tare: '',
  maxGross: '',
  axles: [
    {position: '0', tyreClass: 'SL', setId: 'steer', steering: true},
    {...BLANK_AXLE, setId: 'drive'},
  ],
};

function toDraft(vehicle: Vehicle): Draft {
  return {
    id: vehicle.id,
    name: vehicle.name,
    kind: vehicle.kind,
    deckLength: String(vehicle.deckLength),
    deckWidth: String(vehicle.deckWidth),
    deckHeight: String(vehicle.deckHeight),
    tare: String(vehicle.tare),
    maxGross: String(vehicle.maxGross),
    axles: vehicle.axles.map(axle => ({
      position: String(axle.xFromFront),
      tyreClass: axle.tyreClass,
      setId: axle.setId,
      steering: axle.steering,
    })),
  };
}

/**
 * The axle editor is a row per axle, but it is serialised to the same packed
 * string the CSV importer takes and validated by the same parser — so a hand
 * built vehicle and an imported one cannot diverge.
 */
export function draftToRow(draft: Draft): CsvRow {
  const packed = draft.axles
    .map(axle =>
      [
        axle.position.trim(),
        axle.tyreClass,
        axle.setId.trim(),
        ...(axle.steering ? ['steer'] : []),
      ].join(':'),
    )
    .join('|');

  return {
    id: draft.id,
    name: draft.name,
    kind: draft.kind,
    deck_length: draft.deckLength,
    deck_width: draft.deckWidth,
    deck_height: draft.deckHeight,
    tare: draft.tare,
    max_gross: draft.maxGross,
    axles: packed,
  };
}

export function VehicleForm({
  editing,
  onSave,
  onCancel,
}: {
  readonly editing?: Vehicle | undefined;
  readonly onSave: (vehicle: Vehicle) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(editing ? toDraft(editing) : BLANK);
  const [issues, setIssues] = useState<readonly Issue[]>([]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({...current, [key]: value}));
  }

  function setAxle(index: number, patch: Partial<AxleDraft>) {
    setDraft(current => ({
      ...current,
      axles: current.axles.map((axle, i) =>
        i === index ? {...axle, ...patch} : axle,
      ),
    }));
  }

  function submit() {
    const result = parseVehicleEntry(draftToRow(draft));
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    onSave(result.value);
  }

  const payload = Number(draft.maxGross) - Number(draft.tare);

  return (
    <form
      className="space-y-4 rounded border border-sky-300 bg-sky-50/50 p-4"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="text-sm font-semibold text-slate-900">
        {editing ? `Edit ${editing.id}` : 'New vehicle'}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Id" value={draft.id} onChange={v => set('id', v)} />
        <Field label="Name" value={draft.name} onChange={v => set('name', v)} />
        <SelectField
          label="Kind"
          value={draft.kind}
          onChange={v => set('kind', v)}
          options={VEHICLE_KINDS.map(kind => ({
            value: kind,
            label: VEHICLE_KIND_LABELS[kind],
          }))}
        />
        <Field
          label="Deck length"
          suffix="mm"
          type="number"
          value={draft.deckLength}
          onChange={v => set('deckLength', v)}
        />
        <Field
          label="Deck width"
          suffix="mm"
          type="number"
          value={draft.deckWidth}
          onChange={v => set('deckWidth', v)}
        />
        <Field
          label="Deck height above road"
          suffix="mm"
          type="number"
          value={draft.deckHeight}
          onChange={v => set('deckHeight', v)}
        />
        <Field
          label="Tare"
          suffix="kg"
          type="number"
          value={draft.tare}
          onChange={v => set('tare', v)}
        />
        <Field
          label="Max gross (GVM/GCM)"
          suffix="kg"
          type="number"
          value={draft.maxGross}
          onChange={v => set('maxGross', v)}
        />
      </div>

      {Number.isFinite(payload) && payload > 0 ? (
        <p className="text-sm text-slate-600">
          Payload capacity <strong>{payload.toLocaleString('en-NZ')} kg</strong>{' '}
          before dunnage and restraint.
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          Axles — position from the front of the vehicle. Axles sharing a set
          name are treated as one group for the VDAM axle-set limits.
        </legend>

        {draft.axles.map((axle, index) => (
          <div
            key={index}
            className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
          >
            <Field
              label={`Axle ${index + 1} position`}
              suffix="mm"
              type="number"
              value={axle.position}
              onChange={v => setAxle(index, {position: v})}
            />
            <SelectField
              label="Tyres"
              value={axle.tyreClass}
              onChange={v => setAxle(index, {tyreClass: v})}
              options={TYRE_CLASSES.map(tyre => ({
                value: tyre,
                label: `${tyre} — ${TYRE_CLASS_LABELS[tyre]}`,
              }))}
            />
            <Field
              label="Axle set"
              value={axle.setId}
              placeholder="drive"
              onChange={v => setAxle(index, {setId: v})}
            />
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <input
                type="checkbox"
                checked={axle.steering}
                aria-label={`Axle ${index + 1} steering`}
                onChange={event =>
                  setAxle(index, {steering: event.target.checked})
                }
              />
              Steering
            </label>
            <div className="pb-1">
              <Button
                variant="quiet"
                onClick={() =>
                  set(
                    'axles',
                    draft.axles.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}

        <Button onClick={() => set('axles', [...draft.axles, BLANK_AXLE])}>
          Add an axle
        </Button>
      </fieldset>

      <IssueList issues={issues} />

      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          {editing ? 'Save changes' : 'Add vehicle'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export {formatAxles};
