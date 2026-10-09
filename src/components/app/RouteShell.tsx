import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import ErrorState from '../ui/ErrorState';
import PageSkeleton, { type PageSkeletonVariant } from '../ui/PageSkeleton';
import { useTheme } from '../../theme/ThemeContext';

function describeError(error: Error | null): string {
  if (!error) return 'Eroare necunoscută';
  const head = `${error.name}: ${error.message}`;
  return error.stack && error.stack.includes(error.message) ? error.stack : `${head}\n${error.stack ?? ''}`.trim();
}

function ErrorScreen({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const details = describeError(error);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`StudyX - detalii eroare\n${window.location.hash}\n\n${details}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ErrorState
      title="Ceva nu a mers bine"
      body="Pagina s-a oprit din cauza unei erori. Datele tale sunt în siguranță. Încearcă din nou sau reîncarcă pagina."
      onRetry={onReset}
      details={details}
    >
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="press-feedback glass-panel rounded-full px-5 py-2 text-[13px] font-semibold"
        style={{ color: theme.accentText }}
      >
        Reîncarcă pagina
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        className="press-feedback glass-panel rounded-full px-5 py-2 text-[13px] font-semibold"
        style={{ color: theme.text2 }}
      >
        {copied ? 'Detalii copiate' : 'Copiază detaliile'}
      </button>
    </ErrorState>
  );
}

interface BoundaryProps {
  children: ReactNode;
  /** Când se schimbă (de ex. calea rutei), eroarea se șterge și pagina se încearcă din nou. */
  resetKey?: string;
}

export class AppErrorBoundary extends Component<BoundaryProps, { hasError: boolean; error: Error | null }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

/** scrollTop memorat per cale + query, ca Înapoi/Înainte să readucă pagina unde era. */
type SavedScroll = { top: number; inner: boolean };
const scrollMemory = new Map<string, SavedScroll>();
const MAX_REMEMBERED = 60;
const RESTORE_TRIES = 20;
const RESTORE_INTERVAL_MS = 50;

function PageWrapper({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const hostRef = useRef<HTMLDivElement>(null);
  // Cheia curentă (cale + query) și tipul navigării, citite din efect fără a-l reporni la fiecare `?query`.
  const keyRef = useRef(pathname + search);
  const popRef = useRef(navigationType === 'POP');
  useLayoutEffect(() => {
    keyRef.current = pathname + search;
    popRef.current = navigationType === 'POP';
  });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    host.scrollTop = 0;

    let last: SavedScroll | null = null;
    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target === host) last = { top: host.scrollTop, inner: false };
      else if (target.classList.contains('overflow-y-auto')) last = { top: target.scrollTop, inner: true };
    };
    host.addEventListener('scroll', onScroll, true);

    let timer: number | undefined;
    const entryKey = keyRef.current;
    const saved = popRef.current ? scrollMemory.get(entryKey) : undefined;
    if (saved && saved.top > 0) {
      let tries = 0;
      const attempt = () => {
        const el = saved.inner ? host.querySelector<HTMLElement>('.overflow-y-auto') : host;
        if (el) {
          el.scrollTop = saved.top;
          // Pagina lazy poate să nu fie încă destul de înaltă; reîncercăm cât timp nu ajunge la poziție.
          if (Math.abs(el.scrollTop - saved.top) <= 1) return;
        }
        tries += 1;
        if (tries < RESTORE_TRIES) timer = window.setTimeout(attempt, RESTORE_INTERVAL_MS);
      };
      attempt();
    }

    return () => {
      host.removeEventListener('scroll', onScroll, true);
      window.clearTimeout(timer);
      if (last) {
        scrollMemory.set(keyRef.current, last);
        if (scrollMemory.size > MAX_REMEMBERED) {
          const oldest = scrollMemory.keys().next().value;
          if (oldest !== undefined) scrollMemory.delete(oldest);
        }
      } else {
        scrollMemory.delete(keyRef.current);
      }
    };
  }, [pathname]);

  return (
    <div
      ref={hostRef}
      style={{ height: '100%', width: '100%', overflow: 'auto' }}
      className="custom-scrollbar route-scroll-host"
    >
      {children}
    </div>
  );
}

/** Adevărat abia după `ms` milisecunde de la montare. */
function useDeferredFlag(ms: number) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return ready;
}

/** Forma scheletului după tipul rutei (listă / detaliu / panou), din calea curentă. */
function skeletonVariantFor(pathname: string): PageSkeletonVariant {
  if (pathname === '/' || pathname === '/stats' || pathname === '/analytics' || pathname === '/gamification' || pathname === '/rezidentiat') return 'dashboard';
  if (pathname === '/quizzes' || pathname === '/notes' || pathname === '/vault' || pathname === '/erori' || pathname === '/flashcards') return 'list';
  if (pathname === '/rezidentiat/organizare') return 'default';
  if (pathname === '/rezidentiat/flashcarduri') return 'list';
  if (/^\/(quiz|folder|results|play|flashcards\/session|rezidentiat)\//.test(pathname)) return 'detail';
  return 'default';
}

/** Schelet afișat cu întârziere, ca ecranele care se încarcă instant să nu clipească. */
function RouteFallback() {
  const ready = useDeferredFlag(150);
  const { pathname } = useLocation();
  return ready ? <PageSkeleton variant={skeletonVariantFor(pathname)} /> : null;
}

/**
 * Un singur Suspense persistent în jurul paginii: fiindcă nu se remontează la schimbarea rutei,
 * React (navigarea e într-un startTransition) păstrează pagina veche pe ecran până e gata cea nouă,
 * în loc să o demonteze și să lase zona goală/plată cât se încarcă chunk-ul sau se randează.
 */
export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

/** Ruta fără Suspense propriu (îl furnizează `RouteSuspense`, de deasupra). */
export function PageRoute({ children }: { children: ReactNode }) {
  return <PageWrapper>{children}</PageWrapper>;
}

export function RouteView({ children }: { children: ReactNode }) {
  return (
    <PageWrapper>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </PageWrapper>
  );
}
