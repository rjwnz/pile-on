import {describe, expect, it} from '@jest/globals';
import {IssueLog, fail, issue, ok, summarise} from './result';

describe('Result constructors', () => {
  it('wraps a value', () => {
    expect(ok(42)).toEqual({ok: true, value: 42});
  });

  it('wraps issues', () => {
    expect(fail([issue('a', 'b')])).toEqual({
      ok: false,
      issues: [{path: 'a', message: 'b'}],
    });
  });
});

describe('IssueLog', () => {
  it('settles to ok when nothing was logged', () => {
    const log = new IssueLog();

    expect(log.isEmpty).toBe(true);
    expect(log.settle('value')).toEqual({ok: true, value: 'value'});
  });

  it('settles to a failure once anything is logged', () => {
    const log = new IssueLog();
    log.add('field', 'is wrong');

    expect(log.isEmpty).toBe(false);
    expect(log.settle('value')).toEqual({
      ok: false,
      issues: [{path: 'field', message: 'is wrong'}],
    });
  });

  it('prefixes paths when constructed with a prefix', () => {
    const log = new IssueLog('row 3');
    log.add('mass', 'is wrong');

    expect(log.all[0]!.path).toBe('row 3 / mass');
  });

  it('omits the separator when the path is empty', () => {
    const log = new IssueLog('row 3');
    log.add('', 'the whole row is wrong');

    expect(log.all[0]!.path).toBe('row 3');
  });

  it('uses the bare path when there is no prefix', () => {
    const log = new IssueLog();
    log.add('mass', 'is wrong');

    expect(log.all[0]!.path).toBe('mass');
  });

  it('lets a child write into its parent, so the root sees everything', () => {
    const root = new IssueLog();
    const child = root.child('row 1');
    child.add('mass', 'is wrong');

    expect(root.isEmpty).toBe(false);
    expect(root.all[0]!.path).toBe('row 1 / mass');
  });

  it('nests child prefixes', () => {
    const root = new IssueLog();
    root.child('vehicles[0]').child('axles').add('axle 2', 'is wrong');

    expect(root.all[0]!.path).toBe('vehicles[0] / axles / axle 2');
  });

  it('accepts a batch of issues from elsewhere', () => {
    const log = new IssueLog();
    log.addAll([issue('a', 'one'), issue('b', 'two')]);

    expect(log.all).toHaveLength(2);
  });
});

describe('summarise', () => {
  it('joins issues into one line', () => {
    expect(summarise([issue('a', 'one'), issue('b', 'two')])).toBe(
      'a: one; b: two',
    );
  });

  it('truncates a long list and says how many are hidden', () => {
    const issues = Array.from({length: 8}, (_, i) => issue(`f${i}`, 'bad'));

    expect(summarise(issues, 2)).toBe('f0: bad; f1: bad (and 6 more)');
  });

  it('is empty for no issues', () => {
    expect(summarise([])).toBe('');
  });
});
