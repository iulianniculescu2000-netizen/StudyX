import Mascot from '../../Mascot';
import { STAGE } from '../stage';
import { useTimeline, useTyped } from '../useTimeline';
import { Label, Note, Panel, Reveal } from './shared';
export default function AssistantVisual() {
  const phase = useTimeline([2300]);
  const typed = useTyped('Explică-mi ideea din cursul meu', 3200, false, 60);
  return <Panel><Label>Biblioteca AI → Chat</Label>
    <Reveal><div className="flex justify-between rounded-xl bg-white/5 p-3 text-sm"><span>Cursul meu.pdf</span><span style={{ color: phase ? STAGE.green : STAGE.amber }}>{phase ? '✓ Gata' : 'Se indexează…'}</span></div></Reveal>
    <Reveal at={3200}><div className="mt-3 min-h-10 rounded-xl p-3 text-sm" style={{ background: STAGE.blue }}>{typed}</div></Reveal>
    <Reveal at={6100}><div className="mt-3 flex items-start gap-2 text-sm"><Mascot size={32} accent={STAGE.blue} calm /><p>Răspunsul pornește din documentul tău. <span style={{ color: STAGE.blue }}>[1]</span></p></div></Reveal>
    <Reveal at={8000}><Note>Deschide în carte → verifică pasajul citat.</Note></Reveal>
    <Reveal at={9500}><p className="mt-3 text-xs text-white/60">AI-ul are nevoie de o cheie configurată în Setări.</p></Reveal>
  </Panel>;
}
