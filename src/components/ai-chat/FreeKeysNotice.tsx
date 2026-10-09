import { useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Zap } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import HelpTip from '../ui/HelpTip';

/**
 * Explains the one thing every new user has to do, at the moment they first ask
 * the AI for something.
 *
 * StudyX runs on the free tiers of three providers, and it already switches
 * automatically when one of them hits its limit mid-session — but that only
 * works if more than one key is saved. Users kept adding a single key, burning
 * through its daily quota, and concluding the AI was broken.
 */
export default function FreeKeysNotice({
  theme,
  configuredCount,
  onNavigate,
}: {
  theme: Theme;
  /** How many provider keys are saved right now. */
  configuredCount: number;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const hasNone = configuredCount === 0;

  // Everything is set up — nothing to nag about.
  if (configuredCount >= 4) return null;

  const goToSettings = () => {
    onNavigate?.();
    navigate('/settings?s=ai');
  };

  return (
    <div
      className="glass-panel mb-5 rounded-[var(--r-lg)] p-4 text-left"
      style={{ borderColor: `${theme.accent}28` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-xl"
          style={{ background: `${theme.accent}18`, color: theme.accentText }}
        >
          {hasNone ? <KeyRound size={14} /> : <Zap size={14} />}
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: theme.accentText }}>
          {hasNone ? 'Pornește AI-ul gratuit' : 'Adaugă și celelalte chei'}
        </span>
        <HelpTip id="ai-free-keys" size={16} />
      </div>

      <p className="text-[13px] font-medium leading-relaxed" style={{ color: theme.text2 }}>
        {hasNone ? (
          <>
            StudyX merge pe <strong style={{ color: theme.text }}>chei gratuite</strong> de la Groq, Google Gemini
            și Mistral AI — fără card, doar cu un cont. Pune-le pe toate trei: când una atinge limita
            zilnică, aplicația <strong style={{ color: theme.text }}>trece automat pe următoarea</strong>, așa că nu
            rămâi blocat în mijlocul învățatului.
          </>
        ) : (
          <>
            Ai <strong style={{ color: theme.text }}>{configuredCount} {configuredCount === 1 ? 'cheie' : 'chei'}</strong> din 4.
            Fiecare furnizor are propria limită gratuită, iar aplicația comută singură pe următoarea cheie când una
            se termină. Cu toate patru, practic nu mai atingi limita.
          </>
        )}
      </p>

      <button
        onClick={goToSettings}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] transition-opacity hover:opacity-85"
        style={{ background: theme.accent, color: '#fff' }}
      >
        {hasNone ? 'Adaugă cheile gratuite' : 'Completează cheile'}
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
