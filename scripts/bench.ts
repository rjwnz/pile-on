/**
 * The solution-quality dashboard.
 *
 * Heuristics regress silently. Without a number printed next to the previous
 * number, the packer gets worse and nobody notices until a quote is wrong — so
 * this runs every fixture through the packer and through the control it exists
 * to beat, and writes the result somewhere it can be diffed.
 *
 * Every fixture runs twice more with flipping switched off, because whether the
 * yard allows a pile to be loaded tip-first has been an open question since the
 * project started (analysis §8 Q3). It stops being a matter of opinion the
 * moment there is a column showing what it is worth.
 *
 *   pnpm bench            print the table
 *   pnpm bench --save     print it and record it as the baseline to compare to
 */

import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {
  DEFAULT_PACKING_OPTIONS,
  arrangeNaively,
  balanceOffset,
  consignmentPayload,
  deckArea,
  parseAppState,
  pack,
  validatePlan,
  withoutFlips,
  type AppState,
  type LoadPlan,
  type PackingOptions,
  type Vehicle,
} from '../packages/core/src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(
  here,
  '..',
  'packages',
  'core',
  'src',
  'solver',
  'fixtures',
);
const recordPath = join(fixtureDir, 'bench.json');

interface Row {
  readonly fixture: string;
  readonly piles: number;
  readonly baselineTrucks: number;
  readonly packedTrucks: number;
  readonly noFlipTrucks: number;
  /** Percentage of the deck area actually under steel, averaged over trucks. */
  readonly deckUsed: number;
  readonly massUsed: number;
  /** Worst centroid offset on any truck, in millimetres. */
  readonly worstBalance: number;
  readonly errors: number;
  readonly millis: number;
}

function utilisation(
  plan: LoadPlan,
  state: AppState,
  options: PackingOptions,
): {deck: number; mass: number; balance: number} {
  if (plan.consignments.length === 0) {
    return {deck: 0, mass: 0, balance: 0};
  }
  let deck = 0;
  let mass = 0;
  let balance = 0;
  let decksCounted = 0;
  for (const consignment of plan.consignments) {
    const decks: {vehicle: Vehicle; role: 'truck' | 'trailer'}[] = [];
    const truck = state.catalogue.vehicles.find(
      v => v.id === consignment.vehicleId,
    );
    if (truck) {
      decks.push({vehicle: truck, role: 'truck'});
    }
    const trailer = consignment.trailerId
      ? state.catalogue.vehicles.find(v => v.id === consignment.trailerId)
      : undefined;
    if (trailer) {
      decks.push({vehicle: trailer, role: 'trailer'});
    }

    for (const {vehicle, role} of decks) {
      const on = plan.placements.filter(
        p => p.consignmentId === consignment.id && p.deck === role,
      );
      const footprint = on.reduce((total, placement) => {
        const type = state.catalogue.pileTypes.find(
          entry => entry.id === placement.pileTypeId,
        );
        return type ? total + type.length * type.shaftRadius * 2 : total;
      }, 0);
      // Against every tier's worth of deck, not one — four tiers of
      // half-covered deck is half used, not twice.
      const tiers = new Set(on.map(placement => placement.tier)).size || 1;
      deck += footprint / (deckArea(vehicle) * tiers);
      mass +=
        consignmentPayload(on, state.catalogue, options) /
        vehicle.payloadCapacity;
      const offset = balanceOffset(on, state.catalogue, vehicle);
      balance = Math.max(
        balance,
        offset
          ? Math.max(Math.abs(offset.longitudinal), Math.abs(offset.lateral))
          : 0,
      );
      decksCounted += 1;
    }
  }
  const divisor = decksCounted || 1;
  return {deck: deck / divisor, mass: mass / divisor, balance};
}

function run(state: AppState, fixture: string): Row {
  if (state.catalogue.vehicles.length === 0) {
    throw new Error(`${fixture} has no vehicle to load onto`);
  }
  const options: PackingOptions = {
    ...DEFAULT_PACKING_OPTIONS,
    ...state.options,
  };

  const started = process.hrtime.bigint();
  const packed = pack(state.job, state.catalogue, options);
  const millis = Number(process.hrtime.bigint() - started) / 1e6;

  const noFlip = pack(state.job, state.catalogue, withoutFlips(options));
  const naive = arrangeNaively(state.job, state.catalogue, options);
  const used = utilisation(packed.plan, state, options);

  return {
    fixture,
    piles: packed.plan.placements.length,
    baselineTrucks: naive.plan.consignments.length,
    packedTrucks: packed.plan.consignments.length,
    noFlipTrucks: noFlip.plan.consignments.length,
    deckUsed: Math.round(used.deck * 100),
    massUsed: Math.round(used.mass * 100),
    worstBalance: Math.round(used.balance),
    errors: validatePlan(packed.plan, state.catalogue, options).filter(
      violation => violation.severity === 'error',
    ).length,
    millis: Math.round(millis),
  };
}

function table(rows: readonly Row[], previous: readonly Row[]): string {
  const was = new Map(previous.map(row => [row.fixture, row]));
  const lines = [
    'fixture                   piles  base  packed  noflip  deck%  mass%  bal  err   ms',
    '------------------------- ----- ----- ------- ------- ------ ------ ---- ---- ----',
  ];
  for (const row of rows) {
    const before = was.get(row.fixture);
    const delta =
      before && before.packedTrucks !== row.packedTrucks
        ? ` (was ${before.packedTrucks})`
        : '';
    lines.push(
      [
        row.fixture.padEnd(25),
        String(row.piles).padStart(5),
        String(row.baselineTrucks).padStart(5),
        `${row.packedTrucks}${delta}`.padStart(7),
        String(row.noFlipTrucks).padStart(7),
        String(row.deckUsed).padStart(6),
        String(row.massUsed).padStart(6),
        String(row.worstBalance).padStart(4),
        String(row.errors).padStart(4),
        String(row.millis).padStart(4),
      ].join(' '),
    );
  }
  return lines.join('\n');
}

function main(): void {
  if (!existsSync(fixtureDir)) {
    console.error(`No fixtures in ${fixtureDir}`);
    process.exitCode = 1;
    return;
  }

  const files = readdirSync(fixtureDir)
    .filter(name => name.endsWith('.json') && name !== 'bench.json')
    .sort();

  const rows: Row[] = [];
  for (const file of files) {
    const parsed = parseAppState(readFileSync(join(fixtureDir, file), 'utf8'));
    if (!parsed.ok) {
      console.error(`${file}: ${parsed.issues.map(i => i.message).join('; ')}`);
      continue;
    }
    rows.push(run(parsed.value, file.replace(/\.json$/, '')));
  }

  const previous: Row[] = existsSync(recordPath)
    ? JSON.parse(readFileSync(recordPath, 'utf8'))
    : [];

  console.log(table(rows, previous));

  const saved = rows.reduce((total, row) => total + row.baselineTrucks, 0);
  const used = rows.reduce((total, row) => total + row.packedTrucks, 0);
  const noFlip = rows.reduce((total, row) => total + row.noFlipTrucks, 0);
  console.log(
    `\n${used} trucks against the baseline's ${saved} — ${saved - used} saved.`,
  );
  console.log(
    noFlip === used
      ? `Flipping is worth nothing on these fixtures: ${noFlip} trucks either way.`
      : `Flipping is worth ${noFlip - used} truck(s): ${used} with, ${noFlip} without.`,
  );

  const broken = rows.filter(row => row.errors > 0);
  if (broken.length > 0) {
    console.error(
      `\n${broken.length} fixture(s) produced a plan the validator rejects.`,
    );
    process.exitCode = 1;
  }

  if (process.argv.includes('--save')) {
    writeFileSync(recordPath, `${JSON.stringify(rows, null, 2)}\n`);
    console.log(`\nRecorded as the baseline in ${recordPath}`);
  }
}

main();
