import { useCallback, useState } from 'react';

const STORAGE_KEY = 'sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignorăm erorile de stocare în medii restricționate.
      }
      return next;
    });
  }, []);
  return [collapsed, toggle] as const;
}
