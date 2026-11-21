import { useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { importRezidentiatBank, isBankImported, REZIDENTIAT_BANKS } from '../../lib/rezidentiatBank';

/** Fiecare bancă își ia o culoare și o emoji, ca să nu arate ca o listă de fișiere. */
const LOOKS = [
  { emoji: '🩺', gradient: 'linear-gradient(135deg, #0a84ff, #5e5ce6)' },
  { emoji: '📚', gradient: 'linear-gradient(135deg, #30b0c7, #34c759)' },
  { emoji: '🧬', gradient: 'linear-gradient(135deg, #ff9f0a, #ff375f)' },
];

interface PendingItem {
  key: string;
  label: string;
  description: string;
  run: () => Promise<string>;
}

/**
 * Băncile de grile incluse care nu au fost încă adăugate. Nu arată nimic când toate sunt importate, deci o bancă nouă din registru
 * apare aici singură. Cărțile de bază nu sunt aici: vin cu aplicația și se pregătesc singure (vezi `BundledBooksSection`).
 */
export default function ImportPanel() {
  const theme = useTheme();
  const addToast = useToastStore((state) => state.addToast);
  const quizzes = useQuizStore((state) => state.quizzes);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const pending = useMemo<PendingItem[]>(() => {
    const banks = REZIDENTIAT_BANKS.filter((bank) => !isBankImported(bank)).map((bank) => ({
      key: `bank:${bank.id}`,
      label: bank.label,
      description: bank.description,
      run: async () => {
        const result = await importRezidentiatBank(bank);
        return `${bank.label}: ${result.quizzes} seturi, ${result.questions} grile adăugate.`;
      },
    }));
    return banks;
    // Re-evaluated whenever the quiz store changes (e.g. right after an import).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizzes]);

  const runItems = async (items: PendingItem[], busy: string) => {
    if (busyKey) return;
    setBusyKey(busy);
    try {
      for (const item of items) addToast(await item.run(), 'success', 5000);
    } catch (error) {
      addToast(`Import eșuat: ${error instanceof Error ? error.message : 'eroare necunoscută'}`, 'error', 5000);
    } finally {
      setBusyKey(null);
    }
  };

  if (pending.length === 0) return null;

  const first = pending.length === REZIDENTIAT_BANKS.length;

  return (
    <section aria-labelledby="bank-import-title">
      <div className="px-2 pb-5 pt-2 text-center">
        <div className="text-[44px] leading-none" aria-hidden>{first ? '🚀' : '✨'}</div>
        <h2 id="bank-import-title" className="mt-2 text-[22px] font-bold tracking-tight" style={{ color: theme.text }}>
          {first ? 'Să începem!' : 'Mai ai bănci de adăugat'}
        </h2>
        <p className="mt-1 text-[13.5px]" style={{ color: theme.text3 }}>
          {first ? 'Alege o bancă de grile și ești gata de exersat.' : 'Adaugă-le când vrei, grilele se așază singure pe specialități.'}
        </p>
      </div>
      <div className="grid gap-3">
        {pending.map((item, index) => {
          const look = LOOKS[index % LOOKS.length];
          const busy = busyKey === item.key || busyKey === 'all';
          return (
            <div
              key={item.key}
              className="fx-lift relative flex items-center gap-4 overflow-hidden rounded-[var(--r-lg)] p-5 text-white"
              style={{ background: look.gradient }}
            >
              <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
              <span aria-hidden className="relative flex-shrink-0 text-[40px] leading-none">{look.emoji}</span>
              <div className="relative min-w-0 flex-1">
                <div className="truncate text-[17px] font-bold">{item.label}</div>
                <div className="text-[12.5px] opacity-90">{item.description}</div>
              </div>
              <button
                type="button"
                onClick={() => void runItems([item], item.key)}
                disabled={!!busyKey}
                className="press-feedback relative flex flex-shrink-0 items-center gap-1.5 rounded-full bg-white px-[18px] py-2 text-[13px] font-bold disabled:opacity-70"
                style={{ color: '#0a4fb8' }}
              >
                {busy && <Loader2 size={13} className="animate-spin" aria-hidden />}
                {busy ? 'Se adaugă…' : 'Adaugă'}
              </button>
            </div>
          );
        })}
      </div>
      {pending.length > 1 && (
        <button
          type="button"
          onClick={() => void runItems(pending, 'all')}
          disabled={!!busyKey}
          className="fine-chip press-feedback mx-auto mt-4 flex items-center gap-1.5 rounded-full px-[18px] py-2 text-[13.5px] font-semibold disabled:opacity-60"
          style={{ color: theme.accentText }}
        >
          {busyKey === 'all' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          {busyKey === 'all' ? 'Se adaugă…' : 'Adaugă tot dintr-o dată'}
        </button>
      )}
    </section>
  );
}
