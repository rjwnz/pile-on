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
  readonly radius: string;
  readonly length: string;
}

interface Draft {
  readonly id: string;
  readonly name: string;
  readonly length: string;
  readonly shaftRadius: string;
  readonly mass: string;
  readonly helices: readonly HelixDraft[];
}

const BLANK: Draft = {
  id: '',
  name: '',
  length: '',
  shaftRadius: '',
  mass: '',
  helices: [{offset: '', radius: '', length: ''}],
};

function toDraft(type: PileType): Draft {
  return {
    id: type.id,
    name: type.name,
    length: String(type.length),
    shaftRadius: String(type.shaftRadius),
    mass: String(type.mass),
    helices: type.helices.map(helix => ({
      offset: String(helix.offsetFromButt),
      radius: String(helix.radius),
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
    shaft_radius: draft.shaftRadius,
    mass: draft.mass,
  };
  draft.helices.forEach((helix, index) => {
    row[`helix${index + 1}_offset`] = helix.offset;
    row[`helix${index + 1}_radius`] = helix.radius;
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

  const helixCount = draft.helices.filter(h => h.radius.trim() !== '').length;

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
          label="Shaft radius"
          suffix="mm"
          type="number"
          value={draft.shaftRadius}
          onChange={v => set('shaftRadius', v)}
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
          Helices — {helixCount === 1 ? 'single helix' : `${helixCount} plates`}
          {helixCount === 1
            ? ' (plates may interleave with another single-helix pile)'
            : ' (no interleaving allowed against any neighbour)'}
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
              label={`Plate ${index + 1} radius`}
              suffix="mm"
              type="number"
              value={helix.radius}
              onChange={v => setHelix(index, {radius: v})}
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
              {offset: '', radius: '', length: ''},
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
