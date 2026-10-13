import { STAGE } from '../stage';
import { useTimeline } from '../useTimeline';
import { Label, Note, Panel, Reveal } from './shared';
export default function QuizVisual() {
  const phase = useTimeline([2400, 4500, 6900]);
  return <Panel><Label>Grile · Studiu</Label>
    <Reveal><p className="text-base font-semibold">Cum verifici ce ai înțeles dintr-un curs?</p></Reveal>
    <div className="mt-3 space-y-2">{['Recitesc fără să mă testez', 'Exersez și citesc explicația'].map((text, i) =>
      <Reveal key={text} at={600 + i * 300}><div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: phase >= 1 && i === 0 ? STAGE.red : phase >= 2 && i === 1 ? STAGE.green : STAGE.line }}>
        {phase >= 2 && i === 1 ? '✓' : phase >= 1 && i === 0 ? '×' : '○'} {text}
      </div></Reveal>)}</div>
    <Reveal at={4500}><Note>Explicație: răspunsul și explicația arată ce merită repetat.</Note></Reveal>
    <Reveal at={6900}><Note color={STAGE.amber}>Greșeala devine un punct de pornire pentru recapitulare.</Note></Reveal>
  </Panel>;
}
