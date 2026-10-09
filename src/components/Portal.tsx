import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Renders children into document.body — escapes any stacking context (backdrop-filter, transform, etc.) */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [container] = useState(() => document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  }, [container]);

  return createPortal(children, container);
}
