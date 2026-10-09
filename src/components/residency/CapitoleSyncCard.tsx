import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderSync, Loader2, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAIStore } from '../../store/aiStore';
import { useOrganizareStore } from '../../store/organizareStore';
import { useToastStore } from '../../store/toastStore';
import { useUserStore } from '../../store/userStore';
import { bridge } from '../pdf/bridge';
import Portal from '../Portal';
import { friendlyAIError } from '../../lib/ai/friendlyError';
import { findOrCreateRezidentiatLibraryRoot } from '../../lib/rezidentiatRoot';
import { ensureMaterialsRoot } from '../../lib/organizareRoot';
import { CAPITOLE_SYNC_EVENT } from '../../lib/capitoleSyncEvent';
import { planSync, sourceNameOf, subfoldersOf, type DisciplineGroup, type PlannedFile, type SyncFile } from '../../lib/ai/capitoleSync';

interface ListResult { ok: boolean; files?: SyncFile[]; truncated?: boolean; error?: string }
interface ListBridge { organizareListPdfs?: (root: string, sub?: string) => Promise<ListResult> }

const mb = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`);
const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Găsește (sau creează) lanțul de foldere „Rezidențiat / Capitole / Disciplină / subfoldere…” din biblioteca AI. */
function ensureFolderChain(names: readonly string[]): string {
  const { addLibraryFolder } = useAIStore.getState();
  let parentId: string = findOrCreateRezidentiatLibraryRoot();
  for (const name of names) {
    const existing = useAIStore.getState().libraryFolders.find((f) => f.name === name && (f.parentId ?? null) === parentId);
    parentId = existing ? existing.id : addLibraryFolder(name, '📁', parentId);
  }
  return parentId;
}

/** Card în Rezidențiat › Cărțile tale: aduce capitolele din folderul „Capitole” în bibliotecă, cu pagini, fără selector de fișiere. */
export default function CapitoleSyncCard() {
  const theme = useTheme();
  const addToast = useToastStore((s) => s.addToast);
  const profileId = useUserStore((s) => s.activeProfileId) ?? 'default';
  const root = useOrganizareStore((s) => s.byProfile[profileId]?.root ?? null);
  const knowledgeSources = useAIStore((s) => s.knowledgeSources);

  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<DisciplineGroup[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<{ done: number; total: number; label: string; percent: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const listApi = (bridge() as unknown as ListBridge | undefined)?.organizareListPdfs;
  const syncedCount = useMemo(() => knowledgeSources.filter((s) => s.sync).length, [knowledgeSources]);

  const scan = useCallback(async (folder: string): Promise<DisciplineGroup[] | null> => {
    if (!listApi) return null;
    setScanning(true);
    setError('');
    try {
      const res = await listApi(folder, 'Capitole');
      if (!res.ok || !res.files) {
        setGroups([]);
        setError(res.error || 'Nu am putut citi folderul „Capitole”.');
        return null;
      }
      const synced = new Map(useAIStore.getState().knowledgeSources.flatMap((s) => (s.sync ? [[s.sync.relPath, s.sync] as const] : [])));
      const next = planSync(res.files, synced, useOrganizareStore.getState().byProfile[profileId]?.aiUnreadable ?? {});
      setGroups(next);
      setPicked(new Set(next.filter((g) => g.pending.length > 0).map((g) => g.name)));
      return next;
    } catch (e) {
      setError(friendlyAIError(e) || 'Nu am putut citi folderul „Capitole”.');
      return null;
    } finally {
      setScanning(false);
    }
  }, [listApi, profileId]);


  const pending = useMemo(() => groups.filter((g) => picked.has(g.name)).flatMap((g) => g.pending), [groups, picked]);
  const pendingBytes = pending.reduce((sum, f) => sum + f.size, 0);

  const runSyncFiles = useCallback(async (folder: string, files: PlannedFile[]) => {
    const api = bridge();
    if (!api?.organizareReadPdf || files.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const unreadable: Record<string, number> = {};
    let added = 0;
    let failed = 0;
    const queue: PlannedFile[] = [...files];
    try {
      const { parsePDF } = await import('../../ai/pdfParser');
      for (const [index, file] of queue.entries()) {
        if (controller.signal.aborted) break;
        const name = sourceNameOf(file.relPath);
        const label = (step: string) => `${name}: ${step}`;
        setRun({ done: index, total: queue.length, label: label('citim PDF-ul…'), percent: 0 });
        await yieldToPaint();
        try {
          const read = await api.organizareReadPdf(folder, file.relPath);
          if (!read.ok || !read.data) throw new Error(read.error || 'Fișierul nu a putut fi citit.');
          const pdf = new File([read.data as BlobPart], `${name}.pdf`, { type: 'application/pdf' });
          const text = await parsePDF(pdf, { signal: controller.signal });
          if (controller.signal.aborted) break;
          if (text.trim().length < 200) throw new Error('fără text');
          setRun({ done: index, total: queue.length, label: label('indexăm…'), percent: 0 });
          const previous = useAIStore.getState().knowledgeSources.find((s) => s.sync?.relPath === file.relPath);
          const source = await useAIStore.getState().addKnowledgeSource(name, text, 'pdf', {
            sync: { relPath: file.relPath, size: file.size, mtimeMs: file.mtimeMs },
            onIndexProgress: ({ percent }) => setRun({ done: index, total: queue.length, label: label(`indexăm… ${percent}%`), percent }),
          });
          const parts = file.relPath.split('/');
          const folderId = ensureFolderChain(['Capitole', parts.length > 2 ? parts[1] : 'Altele', ...subfoldersOf(file.relPath)]);
          useAIStore.getState().moveSourceToLibraryFolder(source.id, folderId);
          // Fișier schimbat: vechiul index se scoate abia după ce cel nou e gata.
          if (previous) await useAIStore.getState().removeKnowledgeSource(previous.id);
          added += 1;
        } catch (e) {
          if (controller.signal.aborted) break;
          failed += 1;
          unreadable[file.relPath] = file.size;
          if (!(e instanceof Error && e.message === 'fără text')) console.warn('[CapitoleSync]', file.relPath, e);
        }
      }
    } finally {
      abortRef.current = null;
      setRun(null);
      if (Object.keys(unreadable).length > 0) useOrganizareStore.getState().markAiUnreadable(profileId, unreadable);
      addToast(
        controller.signal.aborted
          ? `Sincronizare oprită: ${added} fișiere adăugate, restul rămân pentru data viitoare.`
          : `${added} ${added === 1 ? 'fișier adăugat' : 'fișiere adăugate'} în Biblioteca AI${failed ? `; ${failed} fără text citibil (scanate), sărite` : ''}.`,
        failed && added === 0 ? 'warning' : 'success',
      );
      await scan(folder);
    }
  }, [profileId, addToast, scan]);

  const runSync = useCallback(async () => {
    if (root) await runSyncFiles(root, pending);
  }, [root, pending, runSyncFiles]);

  const NOT_FOUND = 'Nu găsesc folderul cu „Carti” și „Capitole”. Alege folderul care le conține (de exemplu Rezidentiat).';

  // Folderul salvat se corectează singur (subfolder, părinte, vecin); fără el, se cere alegerea. Fără ieșiri fără soluție.
  // `auto`: după scanare, sincronizează direct tot ce e nou (butonul „Sincronizează materialele”), fără alte clicuri.
  const start = useCallback(async (forcePick = false, auto = false) => {
    setOpen(true);
    setError('');
    const folder = await ensureMaterialsRoot(profileId, { pickIfMissing: true, forcePick });
    if (!folder) { setGroups([]); setError(NOT_FOUND); return; }
    const plan = await scan(folder);
    if (auto && plan) {
      const files = plan.flatMap((g) => g.pending);
      if (files.length > 0) await runSyncFiles(folder, files);
    }
  }, [scan, runSyncFiles, profileId]);

  // Pornit din „Sincronizează materialele” (Cărțile tale): același flux, dar fără să mai alegi disciplinele.
  useEffect(() => {
    const onSync = () => { void start(false, true); };
    window.addEventListener(CAPITOLE_SYNC_EVENT, onSync);
    return () => window.removeEventListener(CAPITOLE_SYNC_EVENT, onSync);
  }, [start]);

  if (!listApi) return null;
  const running = run !== null;

  return (
    <>
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>Capitole pentru AI</div>
          <div className="text-[12px]" style={{ color: theme.text3 }}>
            {syncedCount > 0
              ? `${syncedCount} fișiere din Capitole sunt deja sincronizate. Adaugă restul cu pagini, fără să alegi fișiere.`
              : 'Aduce notițele și capitolele din folderul Capitole, cu pagini, ca AI să le poată cita.'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void start(false)}
          className="press-feedback flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: theme.accent }}
        >
          <FolderSync size={14} /> Sincronizează
        </button>
      </div>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={() => { if (!running) setOpen(false); }}>
            <div
              className="flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[var(--r-lg)]"
              style={{ background: theme.modalBg, border: '1px solid var(--hairline)', boxShadow: 'var(--elev-3)' }}
              role="dialog"
              aria-label="Sincronizează capitolele cu AI"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <div>
                  <div className="text-[16px] font-semibold" style={{ color: theme.text }}>Sincronizează capitolele cu AI</div>
                  <div className="mt-0.5 text-[12px]" style={{ color: theme.text3 }}>Alege disciplinele. Poți opri oricând; continui de unde ai rămas.</div>
                </div>
                {!running && (
                  <button type="button" aria-label="Închide" onClick={() => setOpen(false)} className="press-feedback rounded-full p-1.5" style={{ color: theme.text3 }}>
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
                {scanning && (
                  <div className="flex items-center gap-2 py-6 text-[13px]" style={{ color: theme.text3 }}><Loader2 size={15} className="animate-spin" /> Citim folderul Capitole…</div>
                )}
                {!scanning && error && (
                  <div className="py-6">
                    <div className="text-[13px]" style={{ color: theme.danger }}>{error}</div>
                    <button
                      type="button"
                      onClick={() => void start(true)}
                      className="press-feedback mt-3 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold"
                      style={{ background: 'var(--fill-subtle)', color: theme.accentText }}
                    >
                      <FolderSync size={13} /> Alege alt folder
                    </button>
                  </div>
                )}
                {!scanning && !error && groups.length === 0 && <div className="py-6 text-[13px]" style={{ color: theme.text3 }}>Nu am găsit PDF-uri în Capitole.</div>}
                {!scanning && groups.map((g) => (
                  <label key={g.name} className="fine-row flex cursor-pointer items-center gap-3 rounded-[var(--r-sm)] px-2 py-2">
                    <input
                      type="checkbox"
                      checked={picked.has(g.name)}
                      disabled={running || g.pending.length === 0}
                      onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(g.name); else next.delete(g.name); return next; })}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium" style={{ color: theme.text }}>{g.name}</span>
                      <span className="block text-[11.5px]" style={{ color: theme.text3 }}>
                        {g.pending.length > 0 ? `${g.pending.length} de adăugat · ${mb(g.pendingBytes)}` : 'nimic de adăugat'}
                        {g.done > 0 ? ` · ${g.done} sincronizate` : ''}
                        {g.skipped > 0 ? ` · ${g.skipped} sărite (flashcarduri / scanate)` : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="px-5 pb-4 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                {running ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-[12.5px]" style={{ color: theme.text2 }}>
                      <span className="min-w-0 truncate">{run.label}</span>
                      <span className="shrink-0 tabular-nums">{run.done}/{run.total}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.round(((run.done + run.percent / 100) / run.total) * 100)}%`, background: theme.accent, transition: 'width 0.3s ease' }} />
                    </div>
                    <button type="button" onClick={() => abortRef.current?.abort()} className="press-feedback rounded-full px-4 py-2 text-[13px] font-semibold" style={{ background: 'var(--fill-subtle)', color: theme.text }}>
                      Oprește
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px]" style={{ color: theme.text3 }}>{pending.length > 0 ? `${pending.length} fișiere · ${mb(pendingBytes)}` : ''}</span>
                    <button
                      type="button"
                      disabled={pending.length === 0 || scanning}
                      onClick={() => void runSync()}
                      className="press-feedback rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ background: theme.accent }}
                    >
                      Pornește sincronizarea
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
