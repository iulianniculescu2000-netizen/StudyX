import Mascot from '../../Mascot';
import { STAGE } from '../stage';
import { fraction, useSceneTime } from '../useTimeline';
import { Note, Reveal } from './shared';
export default function FinishVisual() {
  const { elapsedMs, calm } = useSceneTime();
  const k = calm ? 1 : fraction(elapsedMs, 0, 800);
  return <div className="relative w-full max-w-[420px] text-center">
    <div className="flex justify-center" style={{ opacity: k, transform: `scale(${0.8 + k * 0.2})` }}><Mascot accent={STAGE.blue} size={110} calm /></div>
    <Reveal at={1000}><Note>Înapoi la azi: un topic, câteva grile, cardurile tale.</Note></Reveal>
    <Reveal at={2000}><p className="mt-3 text-sm text-white/70">Pip și butonul „?” te ajută la fiecare pas.</p></Reveal>
  </div>;
}
