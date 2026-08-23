import {useState} from 'react';
import {
  maxRadius,
  parsePileTypeEntry,
  type CsvRow,
  type PileType,
} from '@pile-on/core';
import {Button, EntityForm, Field, useValidatedSubmit} from './ui';

interface HelixDraft {
  readonly offset: string;
  readonly diameter: string;
  readonly length: string;
}

interface Draft {
  readonly id: string;
  readonly name: string;
  readonly length: string;
  readonly shaftDiameter: string;
  readonly mass: string;
  readonly helices: readonly HelixDraft[];
}

const BLANK: Draft = {
  id: '',
  name: '',
  length: '',
  shaftDiameter: '',
  mass: '',
  helices: [{offset: '', diameter: '', length: ''}],
};

/** The geometry stores radii; the form takes and shows diameters. */
function toDraft(type: PileType): Draft {
  return {
    id: type.id,
    name: type.name,
    length: String(type.length),
    shaftDiameter: String(type.shaftRadius * 2),
    mass: String(type.mass),
    helices: type.helices.map(helix => ({
      offset: String(helix.offsetFromButt),
      diameter: String(helix.radius * 2),
      length: String(helix.length),
    })),
  };
}

/** Flatten the draft into the CSV row shape the importer's validator consumes. */
export function draftToRow(draft: Draft): CsvRow {
  const row: Record<string, string> = {
    id: draft.id,
    name: draft.name,
    length: draft.length,
    shaft_diameter: draft.shaftDiameter,
    mass: draft.mass,
  };
  draft.helices.forEach((helix, index) => {
    row[`helix${index + 1}_offset`] = helix.offset;
    row[`helix${index + 1}_diameter`] = helix.diameter;
    row[`helix${index + 1}_length`] = helix.length;
  });
  return row;
}

export function PileTypeForm({
  editing,
  onSave,
  onCancel,
}: {
  readonly editing?: PileType | undefined;
  readonly onSave: (pileType: PileType) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(editing ? toDraft(editing) : BLANK);
  const {issues, submit} = useValidatedSubmit(
    () => parsePileTypeEntry(draftToRow(draft)),
    onSave,
  );

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({...current, [key]: value}));
  }

  function setHelix(index: number, patch: Partial<HelixDraft>) {
    setDraft(current => ({
      ...current,
      helices: current.helices.map((helix, i) =>
        i === index ? {...helix, ...patch} : helix,
      ),
    }));
  }

  const helixCount = draft.helices.filter(h => h.diameter.trim() !== '').length;

  return (
    <EntityForm
      title={editing ? `Edit ${editing.id}` : 'New pile type'}
      submitLabel={editing ? 'Save changes' : 'Add pile type'}
      issues={issues}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Id" value={draft.id} onChange={v => set('id', v)} />
        <Field label="Name" value={draft.name} onChange={v => set('name', v)} />
        <Field
          label="Length"
          suffix="mm"
          type="number"
          value={draft.length}
          onChange={v => set('length', v)}
        />
        <Field
          label="Shaft diameter"
          suffix="mm"
          type="number"
          value={draft.shaftDiameter}
          onChange={v => set('shaftDiameter', v)}
        />
        <Field
          label="Mass"
          suffix="kg"
          type="number"
          value={draft.mass}
          onChange={v => set('mass', v)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          Helices: {helixCount === 1 ? 'one helix.' : `${helixCount} plates.`}
          {helixCount === 1
            ? ' Its plate can interleave with another single-helix pile.'
            : ' No interleaving allowed against any neighbour.'}
        </legend>

        {draft.helices.map((helix, index) => (
          <div
            key={index}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <Field
              label={`Plate ${index + 1} offset from butt`}
              suffix="mm"
              type="number"
              value={helix.offset}
              onChange={v => setHelix(index, {offset: v})}
            />
            <Field
              label={`Plate ${index + 1} diameter`}
              suffix="mm"
              type="number"
              value={helix.diameter}
              onChange={v => setHelix(index, {diameter: v})}
            />
            <Field
              label={`Plate ${index + 1} length`}
              suffix="mm"
              type="number"
              value={helix.length}
              onChange={v => setHelix(index, {length: v})}
            />
            <div className="flex items-end pb-1">
              <Button
                variant="quiet"
                onClick={() =>
                  set(
                    'helices',
                    draft.helices.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}

        <Button
          onClick={() =>
            set('helices', [
              ...draft.helices,
              {offset: '', diameter: '', length: ''},
            ])
          }
        >
          Add a plate
        </Button>
      </fieldset>
    </EntityForm>
  );
}

/** Widest point of a pile — shown in the table because it drives lane pitch. */
export function describeWidth(type: PileType): string {
  return `${maxRadius(type) * 2} mm`;
}
