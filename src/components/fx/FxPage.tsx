import { forwardRef, type ReactNode } from 'react';
import { useFxSpotlight } from '../../hooks/useFxSpotlight';

/**
 * Page shell with the cursor light for `.fx-spot` cards. The soft colour behind the content is a single
 * `.fx-mesh` layer in App (shared by every page), so it stays put while the page scrolls.
 */
const FxPage = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(function FxPage(
  { children, className = '' },
  ref,
) {
  useFxSpotlight();
  return (
    <div className="relative h-full">
      <div ref={ref} className={`relative z-[1] h-full overflow-y-auto ${className}`}>{children}</div>
    </div>
  );
});

export default FxPage;
