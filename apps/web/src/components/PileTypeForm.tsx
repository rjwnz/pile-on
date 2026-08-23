import {useState} from 'react';
import {
  maxRadius,
  parsePileTypeEntry,
  pilePartOf,
  pileTypeCode,
  type CsvRow,
  type PilePart,
  type PileType,
} from '@pile-on/core';
import {Button, EntityForm, Field, SelectField, useValidatedSubmit} from './ui';

/**
 * A pile ships in pieces: one starter, which carries the helices, and any
 * number of plain-shaft extensions joined to it on site. Each piece is loaded
 * separately, so each is its own catalogue entry — the model is unchanged. The
 * form groups them under a pile-type code and a part; the core parser builds
 * the id the model stores from the two.
 */
interface HelixDraft {
  readonly offset: string;
  readonly diameter: string;
  readonly length: string;
}

interface Draft {
  readonly pileType: string;
  readonly part: PilePart;
  readonly name: string;
  readonly length: string;
  readonly shaftDiameter: string;
  readonly mass: string;
  readonly helices: readonly HelixDraft[];
}

const BLANK: Draft = {
  pileType: '',
  part: 'starter',
  name: '',
  length: '',
  shaftDiameter: '',
  mass: '',
  helices: [{offset: '', diameter: '', length: ''}],
};

/** The geometry stores radii; the form takes and shows diameters. The code and
 * part come back off the stored id, so an entry opens as it was entered. */
function toDraft(type: PileType): Draft {
  return {
    pileType: pileTypeCode(type),
    part: pilePartOf(type),
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

/** Flatten the draft into the CSV row shape the importer's validator consumes,
 * so hand entry and CSV import go through exactly the same rules. */
export function draftToRow(draft: Draft): CsvRow {
  const row: Record<string, string> = {
    pile_type: draft.pileType,
    part: draft.part,
    name: draft.name,
    length: draft.length,
    shaft_diameter: draft.shaftDiameter,
    mass: draft.mass,
  };
  // Only a starter carries plates; an extension is a plain shaft.
  if (draft.part === 'starter') {
    draft.helices.forEach((helix, index) => {
      row[`helix${index + 1}_offset`] = helix.offset;
      row[`helix${index + 1}_diameter`] = helix.diameter;
      row[`helix${index + 1}_length`] = helix.length;
    });
  }
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
        <Field
          label="Pile type"
          placeholder="e.g. SP1"
          value={draft.pileType}
          onChange={v => set('pileType', v)}
        />
        <SelectField
          label="Part"
          value={draft.part}
          onChange={part => set('part', part)}
          options={[
            {value: 'starter', label: 'Starter'},
            {value: 'extension', label: 'Extension'},
          ]}
        />
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

      {draft.part === 'extension' ? (
        <p className="text-sm text-slate-600">
          An extension is a plain shaft — no helices. Add them to the starter.
        </p>
      ) : (
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
      )}
    </EntityForm>
  );
}

/** Widest point of a pile — shown in the table because it drives lane pitch. */
export function describeWidth(type: PileType): string {
  return `${maxRadius(type) * 2} mm`;
}
