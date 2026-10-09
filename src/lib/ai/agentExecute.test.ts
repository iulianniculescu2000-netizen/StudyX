import { describe, expect, it } from 'vitest';
import { executeAgentPlan, type AgentPlan } from './agent';
import { useFolderStore } from '../../store/folderStore';

const ctx = { defaultPackCount: 1, defaultQuestionsPerPack: 10, residencyScope: false };
const plan = (steps: AgentPlan['steps']): AgentPlan => ({ isCommand: true, reply: '', steps, needsConfirm: false });

describe('executeAgentPlan — pași de foldere (caracterizare)', () => {
  it('creează, redenumește, apoi undo șterge folderul', async () => {
    const events: string[] = [];
    const result = await executeAgentPlan(
      plan([{ action: 'create_folder', name: 'ZzAgentTest' }, { action: 'rename_folder', name: 'ZzAgentTest', newName: 'ZzAgentTest2' }]),
      ctx,
      { onStep: (i, s) => events.push(`${i}:${s}`) },
    );
    expect(result.errors).toEqual([]);
    expect(events).toContain('0:done');
    expect(events).toContain('1:done');
    expect(result.summary).toContain('ZzAgentTest');
    expect(useFolderStore.getState().folders.some((f) => f.name === 'ZzAgentTest2')).toBe(true);
    result.undo?.();
    expect(useFolderStore.getState().folders.some((f) => f.name.startsWith('ZzAgentTest'))).toBe(false);
  });

  it('pas fără nume raportează eroare, nu aruncă', async () => {
    const result = await executeAgentPlan(plan([{ action: 'create_folder' }]), ctx, { onStep: () => {} });
    expect(result.errors.length).toBe(1);
    expect(result.undo).toBeNull();
  });
});
