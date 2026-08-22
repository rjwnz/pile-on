import {describe, expect, it} from '@jest/globals';
import {parseCsvText} from './csv';

describe('reading a pasted block as rows', () => {
  it('lowercases and trims the headers, so Excel capitalisation imports', () => {
    expect(parseCsvText(' ID , Name \nA1,widget\n')).toEqual([
      {id: 'A1', name: 'widget'},
    ]);
  });

  it('trims the cells too', () => {
    expect(parseCsvText('id,name\n  A1  ,  widget  \n')).toEqual([
      {id: 'A1', name: 'widget'},
    ]);
  });

  it('takes tabs, because that is what pasting out of Excel gives', () => {
    expect(parseCsvText('id\tname\nA1\t widget \n')).toEqual([
      {id: 'A1', name: 'widget'},
    ]);
  });

  it('keeps a quoted comma inside its cell', () => {
    expect(parseCsvText('id,name\nA1," a, b "\n')).toEqual([
      {id: 'A1', name: 'a, b'},
    ]);
  });

  it('skips blank lines rather than reading them as empty piles', () => {
    expect(parseCsvText('id,name\n\nA1,widget\n\n')).toEqual([
      {id: 'A1', name: 'widget'},
    ]);
  });

  it('drops surplus cells from a row with too many columns', () => {
    // Papa parks these under `__parsed_extra` as an array, which would be the
    // one non-string in a shape the readers are told holds only strings.
    const rows = parseCsvText('id,name\nA1,widget,stray\n');

    expect(rows).toEqual([{id: 'A1', name: 'widget'}]);
    for (const value of Object.values(rows[0]!)) {
      expect(typeof value).toBe('string');
    }
  });
});
