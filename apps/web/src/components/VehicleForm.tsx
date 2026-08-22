import {useState} from 'react';
import {
  VEHICLE_KINDS,
  VEHICLE_KIND_LABELS,
  parseVehicleEntry,
  type CsvRow,
  type Issue,
  type Vehicle,
  type VehicleKind,
} from '@pile-on/core';
import {Button, Field, IssueList, SelectField} from './ui';

interface Draft {
  readonly id: string;
  readonly name: string;
  readonly kind: VehicleKind;
  readonly deckLength: string;
  readonly deckWidth: string;
  readonly deckHeight: string;
  readonly tare: string;
  readonly maxGross: string;
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
  };
}

/**
 * Flatten the draft into the same CSV row shape the importer consumes, so the
 * form is validated by exactly the rules a CSV would be. There is no second,
 * weaker validator living in the UI.
 */
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
          before dunnage and restraint. This is the mass constraint on the load
          — axle limits are not modelled, because payload is always reached
          first.
        </p>
      ) : null}

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
