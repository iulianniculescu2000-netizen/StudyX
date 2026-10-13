import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, FileUp } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useOrganizareStore } from '../../store/organizareStore';
import { useUserStore } from '../../store/userStore';
import { openStudyFile } from '../../lib/organizare/actions';
import { resolveMaterialsRoot } from '../../lib/organizareRoot';
import { fileBaseName, parseFilePages, printedPageFor, type BookSource } from '../../lib/bookPages';
import type { Topic } from '../../lib/organizare/types';
import PdfPageViewer from './PdfPageViewer';
import { BUNDLED_ROOT, bridge, canReadBookPdf } from './bridge';

/** Ce se citește: sursele posibile (capitol întreg, secțiune, carte) și pagina din PDF-ul compilat al cărții. */
export interface BookViewRequest {
  title: string;
  /** Pagina din PDF-ul compilat al cărții la care se deschide. */
  pdfPage: number;
  sources: BookSource[];
  topic?: Topic | null;
}

type Loaded =
  | { kind: 'missing'; error: string }
  | { kind: 'ready'; data: Uint8Array; source: BookSource };

interface Props {
  request: BookViewRequest;
  /** Apelat când niciun PDF nu e disponibil (ex. ca să se treacă la textul extras). */
  onUnavailable?: () => void;
}

/**
 * Citește PDF-ul unei cărți din folderul ales în Organizare (aplicația desktop) sau dintr-un fișier ales de student
 * (varianta web), încercând sursele pe rând, și îl arată cu PdfPageViewer la pagina cerută.
 */
export default function BookPdfReader({ request, onUnavailable }: Props) {
  const theme = useTheme();
  const profileId = useUserStore((s) => s.activeProfileId) ?? 'default';
  const root = useOrganizareStore((s) => s.byProfile[profileId]?.root ?? null);
  const setRoot = useOrganizareStore((s) => s.setRoot);
  // Rezultatul citirii, legat de cererea și folderul pentru care s-a făcut (altfel încă se încarcă).
  const [loaded, setLoaded] = useState<{ request: BookViewRequest; root: string; result: Loaded } | null>(null);
  const [picked, setPicked] = useState<Extract<Loaded, { kind: 'ready' }> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const unavailable = useRef(onUnavailable);
  useEffect(() => { unavailable.current = onUnavailable; });
  const hasBridge = canReadBookPdf();
  /** Folderele pe care am încercat deja să le corectăm: o singură încercare per folder, fără bucle. */
  const healedRoots = useRef(new Set<string>());

  useEffect(() => {
    const api = bridge();
    if (!api?.organizareReadPdf) return;
    const key = root ?? BUNDLED_ROOT;
    let cancelled = false;
    void (async () => {
      let lastError = 'Nu am găsit fișierul PDF în folderul ales.';
      // Folderul utilizatorului întâi (are și PDF-urile pe capitole), apoi cărțile livrate cu aplicația.
      for (const base of root ? [root, BUNDLED_ROOT] : [BUNDLED_ROOT]) {
        for (const source of request.sources) {
          try {
            const result = await api.organizareReadPdf!(base, source.file);
            if (cancelled) return;
            if (result.ok && result.data) { setLoaded({ request, root: key, result: { kind: 'ready', data: result.data, source } }); return; }
            if (result.error && base !== BUNDLED_ROOT) lastError = result.error;
          } catch {
            // Încearcă următoarea sursă.
          }
        }
      }
      if (cancelled) return;
      if (!root) {
        setLoaded({ request, root: key, result: { kind: 'missing', error: 'need-root' } });
        unavailable.current?.();
        return;
      }
      // Nicio sursă nu e în folderul ales: poate e un subfolder sau părintele. Îl căutăm o singură dată și reîncercăm.
      if (!healedRoots.current.has(root)) {
        healedRoots.current.add(root);
        const res = await resolveMaterialsRoot(root);
        if (cancelled) return;
        if (res?.ok && res.root && res.root !== root) { setRoot(profileId, res.root); return; }
      }
      setLoaded({ request, root, result: { kind: 'missing', error: lastError } });
      unavailable.current?.();
    })();
    return () => { cancelled = true; };
  }, [request, root, profileId, setRoot]);

  const current = loaded && loaded.request === request && loaded.root === (root ?? BUNDLED_ROOT) ? loaded.result : null;
  // Fără folder ales și fără carte inclusă potrivită: abia atunci cerem folderul.
  const state: { kind: 'loading' | 'need-root' | 'pick-file' } | Loaded = picked
    ?? (!hasBridge ? { kind: 'pick-file' } : current?.kind === 'missing' && current.error === 'need-root' ? { kind: 'need-root' } : current ?? { kind: 'loading' });

  const pickRoot = async () => {
    const picked = await bridge()?.organizarePickRoot?.();
    if (!picked) return;
    // Alegerea poate fi un subfolder sau părintele: folosim folderul care conține cu adevărat Carti/Capitole.
    const res = await resolveMaterialsRoot(picked);
    setRoot(profileId, res?.ok && res.root ? res.root : picked);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const exact = request.sources.find((s) => fileBaseName(s.file) === file.name);
    const own = parseFilePages(file.name);
    const page = exact?.page ?? (own && request.pdfPage >= own.first && request.pdfPage <= own.last ? request.pdfPage - own.first + 1 : request.pdfPage);
    const kind = exact?.kind ?? 'book';
    setPicked({ kind: 'ready', data, source: { kind, file: file.name, page } });
  };

  const openExternal = useCallback(() => {
    const best = request.sources.find((s) => s.kind === 'section') ?? request.sources[request.sources.length - 1];
    if (best) void openStudyFile(profileId, best.file);
  }, [request.sources, profileId]);

  const ready = state.kind === 'ready' ? state : null;
  const pageNote = useMemo(() => {
    if (!ready || !request.topic) return undefined;
    const topic = request.topic;
    return (n: number) => {
      const printed = printedPageFor(topic, request.pdfPage - ready.source.page + n);
      return printed === null ? null : `p. ${printed} în carte`;
    };
  }, [ready, request.topic, request.pdfPage]);

  const chip = 'fine-chip press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium';

  if (ready) {
    return <PdfPageViewer key={ready.source.file} data={ready.data} initialPage={ready.source.page} pageNote={pageNote} onOpenExternal={openExternal} />;
  }

  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center" aria-live="polite">
      {state.kind === 'loading' && (
        <div className="w-full max-w-md space-y-3" aria-busy="true" aria-label="Se încarcă PDF-ul">
          <div className="skeleton-block h-4 w-2/3 rounded-full" />
          <div className="skeleton-block h-40 w-full rounded-lg" />
        </div>
      )}
      {state.kind === 'need-root' && (
        <>
          <p className="max-w-md text-sm" style={{ color: theme.text2 }}>
            Ca să arăt paginile exact ca în PDF, alege o dată folderul cu materialele de studiu (cel care conține Carti și Capitole).
          </p>
          <button type="button" onClick={() => void pickRoot()} className={chip} style={{ color: theme.text2 }}>
            <FolderOpen size={12} /> Alege folderul
          </button>
        </>
      )}
      {state.kind === 'pick-file' && (
        <>
          <p className="max-w-md text-sm" style={{ color: theme.text2 }}>
            În versiunea web alegi tu PDF-ul. Caută: <strong>{fileBaseName((request.sources.find((s) => s.kind === 'section') ?? request.sources[0])?.file ?? '')}</strong>
            {' '}sau cartea întreagă; se deschide la pagina potrivită.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="Alege fișierul PDF"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button type="button" onClick={() => fileInput.current?.click()} className={chip} style={{ color: theme.text2 }}>
            <FileUp size={12} /> Alege PDF-ul
          </button>
        </>
      )}
      {state.kind === 'missing' && (
        <>
          <p className="max-w-md text-sm" style={{ color: theme.text2 }}>{state.error}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => void setRoot(profileId, null)} className={chip} style={{ color: theme.text2 }}>
              <FolderOpen size={12} /> Alege alt folder
            </button>
            <button type="button" onClick={openExternal} className={chip} style={{ color: theme.text2 }}>
              <ExternalLink size={12} /> Deschide în aplicația de PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
