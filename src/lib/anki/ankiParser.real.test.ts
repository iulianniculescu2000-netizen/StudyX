/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- tipurile node și sql.js (run/export) nu sunt în tsconfig.app
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

// În test nu există server care să servească .wasm; îl dăm direct ca binar, dar
// parserul real, SQLite-ul real și zip-ul real rulează.
vi.mock('sql.js', async () => {
  const actual = await import('sql.js');
  const wasmBinary = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
  const init = actual.default as unknown as (cfg: object) => Promise<unknown>;
  return { ...actual, default: (cfg: object) => init({ ...cfg, wasmBinary }) };
});
vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({ default: '/sql-wasm.wasm' }));

import { parseApkg } from './ankiParser';

async function buildApkg(): Promise<File> {
  const wasmBinary = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary } as never);
  const db = new SQL.Database();
  db.run('CREATE TABLE col (decks TEXT, models TEXT)');
  db.run('CREATE TABLE notes (id INTEGER, mid INTEGER, flds TEXT, tags TEXT)');
  db.run('CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, ord INTEGER)');
  db.run('INSERT INTO col VALUES (?, ?)', [
    JSON.stringify({ '1': { name: 'Cardio' } }),
    JSON.stringify({ '10': { name: 'Basic', type: 0, flds: [{ name: 'Front' }, { name: 'Back' }], tmpls: [{ name: 'C1', qfmt: '{{Front}}', afmt: '{{Back}}' }] } }),
  ]);
  const sep = String.fromCharCode(0x1f);
  db.run('INSERT INTO notes VALUES (1, 10, ?, ?)', [`Ce este HTA?${sep}≥140 mmHg`, ' cardio ']);
  db.run('INSERT INTO notes VALUES (2, 10, ?, ?)', [`β-blocant${sep}scade FC`, '']);
  db.run('INSERT INTO cards VALUES (1, 1, 1, 0)');
  db.run('INSERT INTO cards VALUES (2, 2, 1, 0)');
  const bytes = db.export();
  db.close();
  const zip = new JSZip();
  zip.file('collection.anki2', bytes);
  zip.file('media', '{}');
  const data = await zip.generateAsync({ type: 'uint8array' });
  return new File([data], 'test.apkg');
}

describe('parseApkg cu SQLite real', () => {
  beforeEach(() => { vi.useRealTimers(); });
  it('citește notele, cardurile și pachetele dintr-un .apkg valid', async () => {
    const col = await parseApkg(await buildApkg());
    expect(col.notes).toHaveLength(2);
    expect(col.notes[0].fields).toEqual(['Ce este HTA?', '≥140 mmHg']);
    expect(col.notes[0].tags).toEqual(['cardio']);
    expect(col.cards).toHaveLength(2);
    expect(col.decks.get('1')).toBe('Cardio');
    expect(col.models.get('10')?.fieldNames).toEqual(['Front', 'Back']);
  });
});
