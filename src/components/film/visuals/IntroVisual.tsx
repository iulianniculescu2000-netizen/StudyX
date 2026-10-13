import { BookOpen, Check, FileText, Layers, Sparkles } from 'lucide-react';
import { STAGE } from '../stage';
import { Label, Panel, Reveal } from './shared';
export default function IntroVisual() {
  return <div className="w-full max-w-[500px]">
    <Reveal><Panel><Label>Pregătirea ta, într-un singur loc</Label>
      <div className="grid grid-cols-[145px_1fr] gap-5">
        <div className="rounded-xl bg-[#e3ecf7] p-4 text-[#193653]">
          <BookOpen size={24} strokeWidth={1.5} />
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wider">Biblioteca ta</p>
          <p className="mt-1 text-base font-bold">Cursul tău</p>
          <div className="mt-4 space-y-2" aria-hidden="true">{[100, 85, 68, 92, 76].map((width) =>
            <div key={width} className="h-1 rounded-full bg-[#afc1d6]" style={{ width: `${width}%` }} />)}</div>
        </div>
        <div className="space-y-3 py-1">
          <Reveal at={700}><div className="flex items-center gap-3 rounded-xl border p-3" style={{ background: STAGE.panelStrong, borderColor: STAGE.line }}>
            <FileText size={19} style={{ color: STAGE.blue }} /><div><p className="text-sm font-semibold">Ce învăț azi?</p><p className="mt-1 text-[11px]" style={{ color: STAGE.text2 }}>Pornesc de la materialele mele.</p></div>
          </div></Reveal>
          <Reveal at={1700}><div className="flex items-center gap-3 px-3 py-1"><Check size={16} style={{ color: STAGE.green }} /><span className="text-xs">Câteva grile pentru claritate</span></div></Reveal>
          <Reveal at={2700}><div className="flex items-center gap-3 px-3 py-1"><Layers size={16} style={{ color: STAGE.violet }} /><span className="text-xs">Cardurile de repetat</span></div></Reveal>
          <Reveal at={3700}><div className="flex items-center gap-3 px-3 py-1"><Sparkles size={16} style={{ color: STAGE.blue }} /><span className="text-xs">Un plan care leagă totul</span></div></Reveal>
        </div>
      </div>
    </Panel></Reveal>
    <Reveal at={4300}><p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-widest" style={{ color: STAGE.text2 }}>Cursuri → Exersare → Recapitulare → Progres</p></Reveal>
  </div>;
}
