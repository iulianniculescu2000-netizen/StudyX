import type { ReactNode } from 'react';
import { useSceneTime } from '../film/useTimeline';
import { stageOpacity } from './stageOpacity';

/** O etapă a unui micro-demo: umple cadrul și apare doar în intervalul ei. Totul derivă din ceasul demo-ului. */
export function Stage({ from, to, total, children }: { from: number; to: number; total: number; children: ReactNode }) {
  const { elapsedMs } = useSceneTime();
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-3.5" style={{ opacity: stageOpacity(elapsedMs, from, to, total) }}>
      {children}
    </div>
  );
}
