import { useState } from 'react';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebar-collapsed') === 'true'
  );
  const toggle = () => setCollapsed((c) => {
    localStorage.setItem('sidebar-collapsed', String(!c));
    return !c;
  });
  return [collapsed, toggle] as const;
}
