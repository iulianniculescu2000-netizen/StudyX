import { describe, expect, it } from 'vitest';
import { checkAnswer } from './answerChecklist';
import { SELF_CRITIQUE_SYSTEM, buildSelfCritiqueMessages, parseSelfCritiqueReply, shouldSelfCritique } from './selfCritique';
import { DEFAULT_HELPER_FLAGS, estimateTextTokens, messagesTokens, readHelperFlags } from './shared';

describe('selfCritique', () => {
  it('promptul de sistem are 40-60 de tokeni', () => {
    const tokens = estimateTextTokens(SELF_CRITIQUE_SYSTEM);
    expect(tokens).toBeGreaterThanOrEqual(40);
    expect(tokens).toBeLessThanOrEqual(65);
  });

  it('costul adăugat = sistem + răspunsul o dată', () => {
    const answer = 'Răspuns de test. '.repeat(20);
    const total = messagesTokens(buildSelfCritiqueMessages(answer));
    expect(total).toBeLessThanOrEqual(estimateTextTokens(answer) + 75);
  });

  it('nu rulează pe răspunsuri curate, rulează pe cele cu probleme grave sau doze', () => {
    const clean = 'Stenoza mitrală dă sufluu diastolic [1].';
    expect(shouldSelfCritique(clean, checkAnswer(clean, { sourceCount: 2 })).run).toBe(false);

    const bad = 'Conform criteriilor [7] diagnosticul este confirmat.';
    const gate = shouldSelfCritique(bad, checkAnswer(bad, { sourceCount: 2 }));
    expect(gate).toEqual({ run: true, reason: 'issues' });

    const dose = 'Se administrează 300 mg aspirină pacientului.';
    expect(shouldSelfCritique(dose, checkAnswer(dose, { sourceCount: 0 })).reason).toBe('dose');
  });

  it('sare peste răspunsurile foarte lungi și respectă flagul', () => {
    const bad = `Vezi [9]. ${'text '.repeat(1500)}`;
    const check = checkAnswer(bad, { sourceCount: 1 });
    expect(shouldSelfCritique(bad, check).reason).toBe('too-long');
    expect(shouldSelfCritique('Vezi [9].', checkAnswer('Vezi [9].', { sourceCount: 1 }), { enabled: false }).reason).toBe('disabled');
  });

  it('interpretează ieșirea modelului', () => {
    const original = 'Un răspuns lung despre fibrilație atrială, cu toate detaliile. '.repeat(4);
    expect(parseSelfCritiqueReply(original, 'OK')).toEqual({ kind: 'keep' });
    expect(parseSelfCritiqueReply(original, 'ok.')).toEqual({ kind: 'keep' });
    expect(parseSelfCritiqueReply(original, '')).toEqual({ kind: 'keep' });
    expect(parseSelfCritiqueReply(original, 'Scurt.')).toEqual({ kind: 'keep' });
    const fixed = original.trim().replace('lung', 'corectat');
    expect(parseSelfCritiqueReply(original, fixed)).toEqual({ kind: 'replace', text: fixed });
  });
});

describe('flaguri', () => {
  it('implicit totul e oprit', () => {
    expect(Object.values(DEFAULT_HELPER_FLAGS).every((v) => v === false)).toBe(true);
    expect(readHelperFlags({ getItem: () => null })).toEqual(DEFAULT_HELPER_FLAGS);
  });

  it('citește JSON parțial și ignoră valorile invalide', () => {
    const flags = readHelperFlags({ getItem: () => JSON.stringify({ answerChecklist: true, clarifyGate: 'da', altceva: true }) });
    expect(flags.answerChecklist).toBe(true);
    expect(flags.clarifyGate).toBe(false);
  });

  it('JSON stricat sau storage care aruncă → implicit', () => {
    expect(readHelperFlags({ getItem: () => '{nu e json' })).toEqual(DEFAULT_HELPER_FLAGS);
    expect(readHelperFlags({ getItem: () => { throw new Error('blocat'); } })).toEqual(DEFAULT_HELPER_FLAGS);
  });
});
