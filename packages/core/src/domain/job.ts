import type {Kilograms} from '../units';
import type {Catalogue} from './catalogue';
import {findPileType} from './catalogue';

/**
 * What the job needs, as a quantity per pile type.
 *
 * Not one row per physical pile. Quantities are how a piling schedule actually
 * arrives, and per-pile records would have to answer an unanswerable question
 * the first time someone edits a quantity downward: which of the 400 records
 * goes, given some are already placed. Individual pile identity comes from
 * placements instead — a placement *is* a pile on a deck.
 *
 * Phases will slot in as another field on the line when they arrive. The single
 * -phase assumption is what makes quantities sufficient today.
 */
export interface JobLine {
  readonly pileTypeId: string;
  readonly quantity: number;
}

export interface Job {
  /** Free text — a job number, a site name, whatever goes on the quote. */
  readonly name: string;
  readonly lines: readonly JobLine[];
}

export const EMPTY_JOB: Job = {name: '', lines: []};

/** Quantity required of a pile type; 0 when the job does not use it. */
export function jobQuantity(job: Job, pileTypeId: string): number {
  return job.lines.find(line => line.pileTypeId === pileTypeId)?.quantity ?? 0;
}

/**
 * Set a quantity, dropping the line entirely at zero.
 *
 * Zero-quantity lines are noise: they bloat the export and make "which types
 * does this job use" a filter rather than a read.
 */
export function setJobQuantity(
  job: Job,
  pileTypeId: string,
  quantity: number,
): Job {
  const without = job.lines.filter(line => line.pileTypeId !== pileTypeId);
  if (quantity <= 0) {
    return {...job, lines: without};
  }
  const existingIndex = job.lines.findIndex(
    line => line.pileTypeId === pileTypeId,
  );
  if (existingIndex === -1) {
    return {...job, lines: [...job.lines, {pileTypeId, quantity}]};
  }
  const lines = [...job.lines];
  lines[existingIndex] = {pileTypeId, quantity};
  return {...job, lines};
}

/** Total number of piles the job requires. */
export function totalPileCount(job: Job): number {
  return job.lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * Total mass of the job's piles.
 *
 * Lines naming a pile type that is not in the catalogue contribute nothing
 * rather than throwing — `findDanglingReferences` is what reports them, and a
 * broken reference should not blank out the whole total.
 */
export function totalPileMass(job: Job, catalogue: Catalogue): Kilograms {
  return job.lines.reduce((total, line) => {
    const type = findPileType(catalogue, line.pileTypeId);
    return type ? total + type.mass * line.quantity : total;
  }, 0);
}

/** Pile types the job actually uses, in catalogue order. */
export function usedPileTypeIds(job: Job): string[] {
  return job.lines
    .filter(line => line.quantity > 0)
    .map(line => line.pileTypeId);
}
