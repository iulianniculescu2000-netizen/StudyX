import { STAGE } from '../stage';
import { fraction, useCountTo, useSceneTime } from '../useTimeline';
import { Label, Note, Panel, Reveal } from './shared';
export default function PlanVisual() {
  const { elapsedMs, calm } = useSceneTime();
  const days = useCountTo(160, 142, 1200, 1800);
  return <Panel><Label color={STAGE.green}>Rezidențiat · Organizare</Label>
    <Reveal><p className="text-sm text-white/70">Alegi data examenului</p><p className="mt-1 text-3xl font-bold tabular-nums">{days} <span className="text-sm">zile rămase</span></p></Reveal>
    <div className="mt-4 space-y-2">{[100, 64, 18, 0].map((value, i) => <div key={i} className="flex items-center gap-3 text-xs"><span>Trecerea {i + 1}</span><div className="h-2 flex-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ background: [STAGE.green, STAGE.blue, STAGE.violet, STAGE.amber][i], width: `${value * (calm ? 1 : fraction(elapsedMs, 3200 + i * 400, 900))}%` }} /></div></div>)}</div>
    <Reveal at={5600}><Note>Săptămâna aceasta → topicuri împărțite pe zile</Note></Reveal>
    <Reveal at={7500}><Note color={STAGE.blue}>Azi → citești, exersezi, bifezi progresul.</Note></Reveal>
  </Panel>;
}
