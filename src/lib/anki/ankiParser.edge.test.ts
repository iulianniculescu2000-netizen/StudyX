import { describe, expect, it } from 'vitest';
import { parseApkg, safeJsonObject } from './ankiParser';

describe('ankiParser cazuri de capăt', () => {
  it('safeJsonObject nu aruncă pe gol/corupt/array', () => {
    expect(safeJsonObject('')).toEqual({});
    expect(safeJsonObject(undefined)).toEqual({});
    expect(safeJsonObject('{"a":')).toEqual({});
    expect(safeJsonObject('[1,2]')).toEqual({});
    expect(safeJsonObject('{"1":"x.png"}')).toEqual({ 1: 'x.png' });
  });

  it('fișier gol -> mesaj în română', async () => {
    await expect(parseApkg(new File([], 'a.apkg'))).rejects.toThrow(/gol/);
  });

  it('fișier care nu e zip -> mesaj în română', async () => {
    await expect(parseApkg(new File(['not a zip at all'], 'a.apkg'))).rejects.toThrow(/corupt|Anki/);
  });
});
