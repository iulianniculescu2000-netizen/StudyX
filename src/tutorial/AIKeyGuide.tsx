import { useState } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore, type AIProvider } from '../store/aiStore';
import { PROVIDER_CATALOG } from '../lib/ai/providerCatalog';
import { keyGuideIntro } from './keyGuideText';
import { useTourContext } from './useTourContext';

const PRIVACY_NOTE = 'Cheile rămân pe dispozitivul tău. Când folosești AI, textul trimis (de exemplu fragmente din cursuri) ajunge la furnizorul ales; unele planuri gratuite pot folosi datele la antrenare, așa că verifică termenii lui.';

type Status = { kind: 'idle' } | { kind: 'testing' } | { kind: 'error'; message: string };

/**
 * Walks someone through getting a free key and checks it before saving. The same component sits in
 * the onboarding tour and in Setări, so the two never tell different stories.
 */
export default function AIKeyGuide({ onSaved }: { onSaved?: () => void }) {
  const theme = useTheme();
  const { aiProviders, aiKeyCount } = useTourContext();
  const [choice, setChoice] = useState<AIProvider | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [done, setDone] = useState<string | null>(null);

  // Without a pick, offer the first provider that has no key yet.
  const provider = choice ?? PROVIDER_CATALOG.find((entry) => !aiProviders.includes(entry.id))?.id ?? PROVIDER_CATALOG[0].id;
  const entry = PROVIDER_CATALOG.find((item) => item.id === provider) ?? PROVIDER_CATALOG[0];
  const alreadySaved = aiProviders.includes(provider);

  const save = async () => {
    const key = draft.trim();
    if (key.length < 20) {
      setStatus({ kind: 'error', message: 'Cheia pare prea scurtă. Copiaz-o întreagă din pagina furnizorului.' });
      return;
    }
    setStatus({ kind: 'testing' });
    try {
      const { validateApiKey } = await import('../lib/groq');
      const result = await validateApiKey(provider, key);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? 'Furnizorul nu a acceptat cheia.' });
        return;
      }
      const ai = useAIStore.getState();
      const previous = ai.provider;
      // Through the store's own setters, so the per-provider model and key bookkeeping stays in step.
      ai.setProvider(provider);
      useAIStore.getState().setApiKey(key);
      // A key added on top of existing ones must not change which provider answers first.
      if (aiKeyCount > 0 && previous !== provider) useAIStore.getState().setProvider(previous);
      setDraft('');
      setStatus({ kind: 'idle' });
      setDone(`${entry.name} funcționează. Cheia e salvată.`);
      onSaved?.();
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Verificarea a eșuat.' });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed" style={{ color: theme.text2 }}>{keyGuideIntro(aiKeyCount, aiProviders)}</p>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Furnizor AI">
        {PROVIDER_CATALOG.map((item) => {
          const selected = item.id === provider;
          const saved = aiProviders.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => { setChoice(item.id); setStatus({ kind: 'idle' }); setDone(null); }}
              className="press-feedback flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: selected ? `${theme.accent}18` : 'var(--fill-subtle)',
                color: selected ? theme.accentText : theme.text2,
                boxShadow: selected ? `inset 0 0 0 1px ${theme.accent}55` : 'none',
              }}
            >
              {saved && <Check size={12} />}
              {item.name}
            </button>
          );
        })}
      </div>

      {done && (
        <p role="status" className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: theme.success }}>
          <Check size={14} /> {done}
        </p>
      )}

      {alreadySaved ? (
        <p className="text-[12px]" style={{ color: theme.text3 }}>
          {entry.name} are deja o cheie salvată. O poți înlocui din Setări → Asistent AI.
        </p>
      ) : (
        <>
          <a
            href={entry.docs}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold"
            style={{ color: theme.accentText }}
          >
            Deschide pagina {entry.name} <ExternalLink size={12} />
          </a>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(event) => { setDraft(event.target.value); setStatus({ kind: 'idle' }); }}
              onKeyDown={(event) => { if (event.key === 'Enter') void save(); }}
              placeholder={entry.keyHint}
              aria-label={`Cheie API ${entry.name}`}
              className="min-w-0 flex-1 rounded-[10px] px-3 py-2 text-[13px] outline-none"
              style={{ background: 'var(--fill-subtle)', color: theme.text }}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={status.kind === 'testing' || draft.trim().length === 0}
              className="press-feedback flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
              style={{ background: theme.accent }}
            >
              {status.kind === 'testing' ? <><Loader2 size={13} className="animate-spin" /> Testez…</> : 'Testează și salvează'}
            </button>
          </div>
          {status.kind === 'error' && (
            <p role="alert" className="text-[12px]" style={{ color: theme.danger }}>{status.message}</p>
          )}
        </>
      )}

      <p className="text-[11px] leading-snug" style={{ color: theme.text3 }}>{PRIVACY_NOTE}</p>
    </div>
  );
}
