import { FILM_CARD as card, STAGE } from '../stage';
import { fraction, useSceneTime, useTimeline } from '../useTimeline';
import { Label, Note, Reveal } from './shared';
export default function FlashcardVisual() {
  const { elapsedMs, calm } = useSceneTime();
  const phase = useTimeline([2100, 4200, 6200]);
  const flip = calm ? 1 : fraction(elapsedMs, 2100, 700);
  return <div className="mx-auto w-full max-w-[450px] text-center">
    <Label color={STAGE.violet}>Aceeași idee, într-un flashcard</Label>
    {/* Perspective weak + vertical air: mid-flip the near edge grows (~14%) and must not reach the label above or the buttons below. */}
    <div className="py-2" style={{ perspective: 1800 }}><div className="relative h-[160px]" style={{ transform: `rotateY(${flip * 180}deg)`, transformStyle: 'preserve-3d' }}>
      <div className="absolute inset-0 flex items-center justify-center rounded-3xl p-5 text-lg font-semibold" style={{ ...card, backfaceVisibility: 'hidden' }}>Cum fixezi ce ai greșit?</div>
      <div className="absolute inset-0 flex items-center justify-center rounded-3xl p-5 text-lg font-semibold" style={{ ...card, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>Revezi explicația și revii la idee prin repetare.</div>
    </div></div>
    <Reveal at={4200}><div className="mt-4 flex justify-center gap-3">{['Greu', 'Bine', 'Ușor'].map((text) => <span key={text} className="rounded-xl border px-4 py-2 text-sm" style={{ ...card, borderColor: text === 'Bine' && phase >= 3 ? STAGE.blue : STAGE.line }}>{text}</span>)}</div></Reveal>
    <Reveal at={6200}><Note>„Bine” → revine mai târziu, după ritmul tău.</Note></Reveal>
  </div>;
}
