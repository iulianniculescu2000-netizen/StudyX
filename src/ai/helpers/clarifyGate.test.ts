import { describe, expect, it } from 'vitest';
import { shouldClarify } from './clarifyGate';

describe('shouldClarify', () => {
  it.each([
    'explică-mi asta',
    'Explică-mi asta te rog',
    'fă-mi ceva',
    'ajută-mă',
    'rezumă',
    'fă-mi grile',
    'hai să vedem',
    '?',
  ])('cere clarificare pentru „%s” fără context', (msg) => {
    const d = shouldClarify(msg);
    expect(d.clarify).toBe(true);
    expect(d.question).toBeTruthy();
    expect(d.question!.length).toBeLessThan(120);
  });

  it('întrebarea se potrivește cerinței', () => {
    expect(shouldClarify('fă-mi grile').question).toMatch(/grilele/);
    expect(shouldClarify('rezumă').question).toMatch(/rezum/);
    expect(shouldClarify('fă-mi flashcarduri').question).toMatch(/flashcardurile/);
  });

  it.each([
    'Ce este IMA?',
    'explică-mi fibrilația atrială',
    'grile despre stenoza mitrală',
    'DZ',
    'tratamentul HTA',
    'diferența dintre ischemie și infarct',
  ])('nu deranjează cu „%s”', (msg) => {
    expect(shouldClarify(msg).clarify).toBe(false);
  });

  it('deicticele trec dacă există istoric, document țintă sau atașament', () => {
    expect(shouldClarify('explică-mi asta', { hasHistory: true }).clarify).toBe(false);
    expect(shouldClarify('explică-mi asta', { hasScopedSource: true }).reason).toBe('has-context');
    expect(shouldClarify('explică-mi asta', { hasAttachment: true }).clarify).toBe(false);
  });

  it('mesajele sociale și goale nu declanșează', () => {
    expect(shouldClarify('Salut!').reason).toBe('social');
    expect(shouldClarify('Mulțumesc mult').clarify).toBe(false);
    expect(shouldClarify('   ').reason).toBe('empty');
  });

  it('mesajele lungi nu sunt considerate vagi', () => {
    const long = 'explică-mi asta '.repeat(10);
    expect(shouldClarify(long).clarify).toBe(false);
  });
});
