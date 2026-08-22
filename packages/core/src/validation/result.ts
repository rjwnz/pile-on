/**
 * A result that accumulates *every* problem rather than throwing on the first.
 *
 * This matters for the job it does: someone imports a 400-row CSV exported from
 * a piling schedule, and being told about one bad row at a time is useless. All
 * the parsers below collect issues and report them together.
 */

export interface Issue {
  /** Where the problem is, in terms the user can act on: `row 12 / shaft_radius`. */
  readonly path: string;
  readonly message: string;
}

export type Result<T> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly issues: readonly Issue[]};

export function ok<T>(value: T): Result<T> {
  return {ok: true, value};
}

export function fail<T>(issues: readonly Issue[]): Result<T> {
  return {ok: false, issues};
}

export function issue(path: string, message: string): Issue {
  return {path, message};
}

/** Collects issues while a parser works through a record. */
export class IssueLog {
  private readonly issues: Issue[];

  constructor(
    private readonly prefix = '',
    sharedWith?: IssueLog,
  ) {
    // A child shares its parent's array, so `settle` on the root sees
    // everything every nested parser recorded.
    this.issues = sharedWith ? sharedWith.issues : [];
  }

  /**
   * A view of this log that prefixes every path it records — used to tag
   * per-row problems with the row they came from.
   */
  child(prefix: string): IssueLog {
    return new IssueLog(
      this.prefix ? `${this.prefix} / ${prefix}` : prefix,
      this,
    );
  }

  add(path: string, message: string): void {
    // An empty path means "the thing itself" — don't leave a dangling separator.
    const full =
      this.prefix && path ? `${this.prefix} / ${path}` : this.prefix || path;
    this.issues.push(issue(full, message));
  }

  addAll(issues: readonly Issue[]): void {
    this.issues.push(...issues);
  }

  get isEmpty(): boolean {
    return this.issues.length === 0;
  }

  get all(): readonly Issue[] {
    return this.issues;
  }

  /** Wrap a value as a result, failing if anything was logged. */
  settle<T>(value: T): Result<T> {
    return this.isEmpty ? ok(value) : fail(this.issues);
  }
}

/** Format issues for a one-line summary. */
export function summarise(issues: readonly Issue[], limit = 5): string {
  const shown = issues
    .slice(0, limit)
    .map(i => `${i.path}: ${i.message}`)
    .join('; ');
  const rest = issues.length - limit;
  return rest > 0 ? `${shown} (and ${rest} more)` : shown;
}
