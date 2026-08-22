import {useState} from 'react';
import {
  VEHICLE_KINDS,
  VEHICLE_KIND_LABELS,
  parseVehicleEntry,
  type CsvRow,
  type Vehicle,
  type VehicleKind,
} from '@pile-on/core';
import {EntityForm, Field, SelectField, useValidatedSubmit} from './ui';

interface Draft {
  readonly id: string;
  readonly name: string;
  readonly kind: VehicleKind;
  readonly deckLength: string;
  readonly deckWidth: string;
  readonly deckHeight: string;
  readonly tare: string;
  readonly maxGross: string;
  readonly maxFrontOverhang: string;
  readonly maxRearOverhang: string;
  readonly balanceTarget: string;
  readonly towableBy: string;
}

const BLANK: Draft = {
  id: '',
  name: '',
  kind: 'rigid',
  deckLength: '',
  deckWidth: '2450',
  deckHeight: '',
  tare: '',
  maxGross: '',
  maxFrontOverhang: '0',
  maxRearOverhang: '0',
  balanceTarget: '',
  towableBy: '',
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
    maxFrontOverhang: String(vehicle.maxFrontOverhang),
    maxRearOverhang: String(vehicle.maxRearOverhang),
    // Blank means unstated, which is not the same as mid-deck — it is the
    // absence of an opinion, and the form has to be able to express that.
    balanceTarget:
      vehicle.balanceTarget === null ? '' : String(vehicle.balanceTarget),
    towableBy: vehicle.towableBy.join('; '),
  };
}

/** Flatten the draft into the CSV row shape the importer's validator consumes. */
export function draftToRow(draft: Draft): CsvRow {
  return {
    id: draft.id,
    name: draft.name,
    kind: draft.kind,
    deck_length: draft.deckLength,
    deck_width: draft.deckWidth,
    deck_height: draft.deckHeight,
    tare: draft.tare,
    max_gross: draft.maxGross,
    max_front_overhang: draft.maxFrontOverhang,
    max_rear_overhang: draft.maxRearOverhang,
    balance_target: draft.balanceTarget,
    towable_by: draft.towableBy,
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
  const {issues, submit} = useValidatedSubmit(
    () => parseVehicleEntry(draftToRow(draft)),
    onSave,
  );

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({...current, [key]: value}));
  }

  const payload = Number(draft.maxGross) - Number(draft.tare);

  return (
    <EntityForm
      title={editing ? `Edit ${editing.id}` : 'New vehicle'}
      submitLabel={editing ? 'Save changes' : 'Add vehicle'}
      issues={issues}
      onSubmit={submit}
      onCancel={onCancel}
    >
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
        <Field
          label="Front overhang allowed"
          suffix="mm"
          type="number"
          value={draft.maxFrontOverhang}
          onChange={v => set('maxFrontOverhang', v)}
        />
        <Field
          label="Rear overhang allowed"
          suffix="mm"
          type="number"
          value={draft.maxRearOverhang}
          onChange={v => set('maxRearOverhang', v)}
        />
        <Field
          label="Balance point from headboard"
          suffix="mm"
          type="number"
          value={draft.balanceTarget}
          placeholder="mid-deck"
          onChange={v => set('balanceTarget', v)}
        />
        <Field
          label="Towable by — truck ids, semicolon-separated"
          value={draft.towableBy}
          placeholder="self-propelled"
          onChange={v => set('towableBy', v)}
        />
      </div>

      <p className="text-sm text-slate-600">
        Overhang allowances are what this unit will actually carry, not a rule —
        VDAM states rear overhang against axle spacing, and axles are not
        modelled. Leave the balance point blank unless the yard has a figure for
        it: a semi wants its mass forward toward the kingpin and a rigid does
        not, and mid-deck is a guess standing in for the answer.
      </p>

      {Number.isFinite(payload) && payload > 0 ? (
        <p className="text-sm text-slate-600">
          Payload capacity <strong>{payload.toLocaleString('en-NZ')} kg</strong>{' '}
          before dunnage and restraint. This is the mass constraint on the load
          — axle limits are not modelled, because payload is always reached
          first.
        </p>
      ) : null}
    </EntityForm>
  );
}
