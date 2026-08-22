import {describe, expect, it} from '@jest/globals';
import {toMetres, toTonnes} from './units';

describe('unit conversions', () => {
  it('converts millimetres to metres for display', () => {
    expect(toMetres(12600)).toBe(12.6);
  });

  it('converts kilograms to tonnes for display', () => {
    expect(toTonnes(44000)).toBe(44);
  });
});
