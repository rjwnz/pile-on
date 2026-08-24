import type {Kilograms} from '../units';
import type {Catalogue} from './catalogue';
import {findPileType} from './catalogue';

/**
 * What the job needs, as a quantity per pile type — not one row per physical
 * pile. Individual pile identity comes from placements instead: a placement
 * *is* a pile on a deck.
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

/** Set a quantity, dropping the line entirely at zero. */
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

/** Total mass of the job's piles. Dangling type references contribute nothing
 * rather than throwing — `findDanglingReferences` reports them. */
export function totalPileMass(job: Job, catalogue: Catalogue): Kilograms {
  return job.lines.reduce((total, line) => {
    const type = findPileType(catalogue, line.pileTypeId);
    return type ? total + type.mass * line.quantity : total;
  }, 0);
}
