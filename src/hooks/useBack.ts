import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Stare opțională transmisă la intrarea într-o pagină, ca „înapoi" să știe de unde a venit utilizatorul. */
export interface FromState { from?: string }


/**
 * „Înapoi" unitar: dacă pagina curentă a fost deschisă din aplicație (există intrare anterioară
 * în istoric) → navigate(-1), deci te întoarce exact de unde ai venit. Altfel (deschisă direct,
 * reîncărcată sau stiva a fost înlocuită) → `state.from`, apoi `fallback`, cu replace.
 */
export function useBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as FromState | null)?.from;
  const hasHistory = location.key !== 'default';
  return useCallback(() => {
    if (hasHistory) navigate(-1);
    else navigate(typeof from === 'string' && from.startsWith('/') ? from : fallback, { replace: true });
  }, [hasHistory, from, fallback, navigate]);
}
