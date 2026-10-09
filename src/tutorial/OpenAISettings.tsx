import { useEffect } from 'react';

/** Pas de tur fără interfață proprie: deschide Setări AI (nu e o rută, ci o fereastră) când pasul apare. */
export default function OpenAISettings() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('studyx:open-ai-settings'));
  }, []);
  return null;
}
