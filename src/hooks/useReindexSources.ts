import { useRef, useState, type ChangeEvent } from 'react';
import { useAIStore, type AIKnowledgeSource } from '../store/aiStore';
import { useToastStore } from '../store/toastStore';
import { matchFilesToSources } from '../ai/reindexMatch';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { planAutoReindex } from '../lib/ai/bookAutoReindex';
import { bridge } from '../components/pdf/bridge';

export interface ReindexState { sourceId: string; label: string; percent: number }

/** Un fișier cu alt nume decât cartea: se întreabă (în dialogul aplicației) înainte de a-l folosi. */
export interface RenameCheck { fileName: string; sourceName: string }

type ReindexPair = { file: File; source: AIKnowledgeSource };

const yieldToPaint = () => new Promise<void>((resolve) => { window.setTimeout(resolve, 0); });

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof window.setTimeout>;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    window.clearTimeout(timeoutId!);
  }
}

/**
 * Reindexarea surselor PDF „fără pagini”: textul se citește cu pagini, iar indexul vechi se înlocuiește abia la final.
 * Fișierele vin fie din selector (omul le alege din nou, aceleași nume), fie direct din folderul ales la Organizare
 * (`reindexFromRoot`: cărțile compilate au căi cunoscute, fără selector). Folosit de Biblioteca AI și de Rezidențiat.
 */
export function useReindexSources(busy = false) {
  const addToast = useToastStore((state) => state.addToast);
  const reindexKnowledgeSource = useAIStore((state) => state.reindexKnowledgeSource);
  const inputRef = useRef<HTMLInputElement>(null);
  const targetsRef = useRef<AIKnowledgeSource[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<ReindexState | null>(null);
  const [renameCheck, setRenameCheck] = useState<RenameCheck | null>(null);
  const renameAnswerRef = useRef<((accepted: boolean) => void) | null>(null);

  const askRename = (check: RenameCheck) => new Promise<boolean>((resolve) => {
    renameAnswerRef.current = resolve;
    setRenameCheck(check);
  });
  const answerRename = (accepted: boolean) => {
    renameAnswerRef.current?.(accepted);
    renameAnswerRef.current = null;
    setRenameCheck(null);
  };

  const openPicker = (targets: AIKnowledgeSource[]) => {
    if (busy || state || targets.length === 0) return;
    targetsRef.current = targets;
    if (inputRef.current) {
      inputRef.current.multiple = targets.length > 1;
      inputRef.current.click();
    }
  };

  /** Citește și reindexează fiecare pereche, pe rând; progres, anulare și rezumat final comune ambelor căi. */
  const runPairs = async (pairs: ReindexPair[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    let done = 0;
    let failed = 0;
    try {
      for (const [index, { file, source }] of pairs.entries()) {
        if (controller.signal.aborted) break;
        const prefix = pairs.length > 1 ? `[${index + 1}/${pairs.length}] ` : '';
        const label = (step: string) => `${prefix}${source.name.replace(/\.pdf$/i, '')}: ${step}`;
        setState({ sourceId: source.id, label: label('citim PDF-ul…'), percent: 0 });
        await yieldToPaint();
        try {
          const { parsePDF } = await import('../ai/pdfParser');
          // 400 de pagini pot dura minute (extragere în loturi + eventual OCR); anularea întrerupe între loturi.
          const text = await withTimeout(
            parsePDF(file, {
              signal: controller.signal,
              onOcrProgress: (d, t) => setState({ sourceId: source.id, label: label(`OCR pagini ${d}/${t}`), percent: 0 }),
            }),
            15 * 60_000,
            `Citirea PDF-ului ${file.name} a expirat.`,
          );
          if (controller.signal.aborted) break;
          setState({ sourceId: source.id, label: label('indexăm cu pagini…'), percent: 0 });
          await reindexKnowledgeSource(source.id, text, {
            signal: controller.signal,
            onIndexProgress: ({ percent }) => setState({ sourceId: source.id, label: label(`indexăm cu pagini… ${percent}%`), percent }),
          });
          done += 1;
        } catch (error) {
          if (controller.signal.aborted || (error instanceof Error && (error.name === 'ReindexCancelledError' || error.name === 'AbortError'))) break;
          failed += 1;
          addToast(`„${source.name}": ${friendlyAIError(error) || 'reindexarea a eșuat'}. Indexul vechi a rămas neschimbat.`, 'error');
        }
      }
    } finally {
      const cancelled = controller.signal.aborted;
      abortRef.current = null;
      setState(null);
      if (cancelled) addToast(done > 0 ? `Reindexare oprită; ${done} carte(i) actualizate, restul au rămas neschimbate.` : 'Reindexare anulată; indexul vechi a rămas neschimbat.', 'info');
      else if (done > 0) addToast(`${done} ${done === 1 ? 'carte reindexată' : 'cărți reindexate'} cu pagini${failed ? `, ${failed} eșuate` : ''}.`, failed ? 'warning' : 'success');
    }
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.name.toLowerCase().endsWith('.pdf'));
    event.target.value = '';
    const targets = targetsRef.current;
    if (files.length === 0 || targets.length === 0) return;

    let pairs: ReindexPair[];
    if (targets.length === 1 && files.length === 1) {
      // Alegerea explicită pentru UNA singură sursă o leagă direct; numele diferit doar se confirmă.
      const [file] = files;
      const [source] = targets;
      if (matchFilesToSources([file], [source]).pairs.length === 0 && !(await askRename({ fileName: file.name, sourceName: source.name }))) return;
      pairs = [{ file, source }];
    } else {
      const matched = matchFilesToSources(files, targets);
      pairs = matched.pairs;
      if (matched.unmatchedFiles.length > 0) {
        addToast(`${matched.unmatchedFiles.length} fișier(e) nu corespund niciunei cărți fără pagini: ${matched.unmatchedFiles.slice(0, 2).map((f) => f.name).join(', ')}.`, 'warning');
      }
    }
    if (pairs.length === 0) return;
    await runPairs(pairs);
  };

  /** Cărțile compilate pot fi citite direct din folderul ales la Organizare (fără selector), doar în aplicația desktop. */
  const canReindexFromRoot = (root: string | null | undefined): root is string => !!root && !!bridge()?.organizareReadPdf;

  /**
   * Reindexează din folderul rădăcină tot ce are o carte cunoscută; întoarce sursele rămase (necunoscute sau cu fișierul
   * lipsit), pentru care e nevoie de selector. Nu aruncă: un fișier lipsă doar mută sursa în lista „rămase”.
   */
  const reindexFromRoot = async (targets: AIKnowledgeSource[], root: string): Promise<AIKnowledgeSource[]> => {
    const readPdf = bridge()?.organizareReadPdf;
    if (busy || state || !readPdf) return targets;
    const { auto, manual } = planAutoReindex(targets);
    const missing: AIKnowledgeSource[] = [...manual];
    const bytesByPath = new Map<string, Uint8Array | null>();
    const pairs: ReindexPair[] = [];
    for (const { source, relPath } of auto) {
      setState({ sourceId: source.id, label: `${source.name}: caut fișierul în folderul tău…`, percent: 0 });
      await yieldToPaint();
      if (!bytesByPath.has(relPath)) {
        let bytes: Uint8Array | null = null;
        try {
          const res = await readPdf(root, relPath);
          bytes = res.ok && res.data ? res.data : null;
        } catch {
          bytes = null;
        }
        bytesByPath.set(relPath, bytes);
      }
      const bytes = bytesByPath.get(relPath);
      if (!bytes) { missing.push(source); continue; }
      const name = relPath.slice(relPath.lastIndexOf('/') + 1);
      pairs.push({ file: new File([bytes as BlobPart], name, { type: 'application/pdf' }), source });
    }
    setState(null);
    if (missing.length > 0) {
      addToast(
        `${missing.length} ${missing.length === 1 ? 'carte nu a fost găsită' : 'cărți nu au fost găsite'} în folderul ales (Carti/…). Alege-le manual cu butonul „Alege fișierele”.`,
        'warning',
      );
    }
    if (pairs.length > 0) await runPairs(pairs);
    return missing;
  };

  return {
    state,
    openPicker,
    canReindexFromRoot,
    reindexFromRoot,
    renameCheck,
    answerRename,
    cancel: () => abortRef.current?.abort(),
    inputProps: { type: 'file' as const, ref: inputRef, accept: '.pdf,application/pdf', className: 'hidden', onChange: handleFiles },
  };
}
