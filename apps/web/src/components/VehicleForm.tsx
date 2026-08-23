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
  readonly payloadCapacity: string;
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
  payloadCapacity: '',
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
    payloadCapacity: String(vehicle.payloadCapacity),
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
    payload_capacity: draft.payloadCapacity,
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

  const payload = Number(draft.payloadCapacity);

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
          label="Load capacity"
          suffix="kg"
          type="number"
          value={draft.payloadCapacity}
          onChange={v => set('payloadCapacity', v)}
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
          label="Towable by (truck ids, separated by semicolons)"
          value={draft.towableBy}
          placeholder="self-propelled"
          onChange={v => set('towableBy', v)}
        />
      </div>

      <p className="text-sm text-slate-600">
        Leave the balance point blank unless you have a figure for it. A
        semi-trailer wants its mass forward, a rigid truck does not. If you
        leave it blank, the load balances to mid-deck, which is only a guess.
      </p>

      {Number.isFinite(payload) && payload > 0 ? (
        <p className="text-sm text-slate-600">
          Load capacity <strong>{payload.toLocaleString('en-NZ')} kg</strong>{' '}
          covers everything on the deck — piles, dunnage and lashings together.
          This is the weight limit the packer holds the load to. Axle and gross
          limits are not modelled, because you reach load capacity first.
        </p>
      ) : null}
    </EntityForm>
  );
}
