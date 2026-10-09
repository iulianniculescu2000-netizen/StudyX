import { forwardRef, type ReactNode } from 'react';
import { useFxSpotlight } from '../../hooks/useFxSpotlight';

/**
 * Page shell with the soft drifting colour behind the content and the cursor light for `.fx-spot` cards.
 * The colour sits behind a separate layer, so it stays put while the page scrolls.
 */
const FxPage = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(function FxPage(
  { children, className = '' },
  ref,
) {
  useFxSpotlight();
  return (
    <div className="relative h-full">
      <div className="fx-mesh" aria-hidden="true"><i /><i /><i /></div>
      <div ref={ref} className={`relative z-[1] h-full overflow-y-auto ${className}`}>{children}</div>
    </div>
  );
});

export default FxPage;
