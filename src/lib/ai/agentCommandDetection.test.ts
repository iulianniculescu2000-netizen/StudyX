/**
 * The pre-filter that decides whether a message goes to the agent planner or to
 * ordinary chat. A false negative is the expensive one: the user types a real
 * command and the app just chats back at them.
 *
 * The old pattern listed bare stems inside `\b(...)\b`, so the closing boundary
 * demanded the stem BE the whole word — and Romanian inflects everything.
 * "șterg" matched, "șterge" did not; "folder" matched, "folderul" did not.
 */
import { describe, expect, it } from 'vitest';
import { looksLikeAgentCommand, looksLikePlaceThemRequest } from './agent';

describe('commands that were being ignored', () => {
  const commands = [
    'șterge folderul Cardiologie',
    'sterge folderul Cardiologie',
    'generează 20 de întrebări',
    'genereaza intrebari despre nefron',
    'creează un folder nou pentru Rezidențiat',
    'mută grilele în folderul Anatomie',
    'redenumește setul în Cardiologie avansat',
    'adaugă 10 grile despre insuficiența cardiacă',
    'organizează grilele pe materii',
    'importă grilele din documentul acesta',
  ];

  it.each(commands)('recognises %j', (text) => {
    expect(looksLikeAgentCommand(text)).toBe(true);
  });
});

describe('ordinary questions must stay in chat', () => {
  const chat = [
    'Ce este cardiomiopatia hipertrofică?',
    'Explică-mi mecanismul insuficienței cardiace.',
    'Care sunt semnele clinice ale pneumoniei?',
    'Nu am înțeles ultima explicație.',
    'Mulțumesc!',
    'Care e diferența dintre astm și BPOC?',
  ];

  it.each(chat)('leaves %j alone', (text) => {
    expect(looksLikeAgentCommand(text)).toBe(false);
  });
});

describe('edge cases', () => {
  it('ignores very short input', () => {
    expect(looksLikeAgentCommand('ok')).toBe(false);
  });

  it('is not fooled by medical words that merely start like a command', () => {
    // "cardiologie" must not read as "card", "facultate" must not read as "fă".
    expect(looksLikeAgentCommand('Vorbește-mi despre cardiologie.')).toBe(false);
    expect(looksLikeAgentCommand('Cum e la facultate anul III?')).toBe(false);
  });
});

describe('„pune-le în folder” fără țintă', () => {
  it.each([
    'ok, baga le in folder',
    'bagă-le în folder',
    'pune-le într-un folder',
    'du-le în Cardiologie',
    'mută-le',
  ])('%j e cerere de plasare', (text) => {
    expect(looksLikePlaceThemRequest(text)).toBe(true);
  });

  it.each([
    'ce înseamnă pune-le în ordine alfabetică la anatomie, am nevoie de o explicație lungă despre cum se ordonează toate structurile din această regiune anatomică',
    'explică-mi infarctul miocardic',
    'cum bag la memorie lista nervilor cranieni',
  ])('%j nu e', (text) => {
    expect(looksLikePlaceThemRequest(text)).toBe(false);
  });
});
