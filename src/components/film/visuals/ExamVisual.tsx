import { STAGE } from '../stage';
import { useCountTo } from '../useTimeline';
import { Label, Note, Panel, Reveal } from './shared';
export default function ExamVisual() {
  const seconds = useCountTo(120, 47, 500, 2800);
  return <Panel><Label color={STAGE.amber}>Simulare → Caiet de erori</Label>
    <Reveal><div className="flex justify-between text-lg font-bold"><span className="tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span><span style={{ color: STAGE.amber }}>−0,25</span></div><p className="mt-2 text-xs text-white/60">Exemplu de timp și rezultate</p></Reveal>
    <Reveal at={3300}><Note>Rezultatul arată unde mai ai de lucrat.</Note></Reveal>
    <Reveal at={5000}><Note color={STAGE.red}>Caiet de erori → întrebarea greșită și explicația</Note></Reveal>
    <Reveal at={6900}><Note color={STAGE.blue}>Un test scurt fixează ideea înainte de următoarea simulare.</Note></Reveal>
  </Panel>;
}
