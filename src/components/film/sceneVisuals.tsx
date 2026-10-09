import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, FileText, Flame, NotebookPen, Timer, X } from 'lucide-react';
import Logo from '../Logo';
import Mascot from '../Mascot';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { spring } from '../../theme/motion';
import { useCountTo, useTimeline, useTyped } from './useTimeline';
import { STAGE } from './stage';

function Rise({ delay = 0, y = 14, children, className = '' }: { delay?: number; y?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const card = {
  background: STAGE.panel,
  border: `1px solid ${STAGE.line}`,
  boxShadow: 'var(--elev-3)',
  backdropFilter: 'blur(14px)',
} as const;

// ── 1. Deschidere ─────────────────────────────────────────────────────────────

const INTRO_MARKS = [900, 1500] as const;

export function IntroVisual() {
  const { calmMotion } = useAdaptiveMotion();
  const phase = useTimeline(INTRO_MARKS, calmMotion);
  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      <motion.div
        aria-hidden="true"
        className="absolute h-[260px] w-[260px] rounded-full"
        style={{ background: STAGE.blue, filter: 'blur(90px)' }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.34, scale: 1 }}
        transition={{ duration: 1.6 }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.78, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={spring.panel}
        className="relative"
      >
        <Logo size={116} />
      </motion.div>
      <div className="relative mt-5 h-[44px] overflow-hidden">
        <motion.div
          initial={{ y: 44 }}
          animate={{ y: phase >= 1 ? 0 : 44 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="display text-[2.4rem] font-extrabold leading-[44px] tracking-tight"
          style={{ color: STAGE.text }}
        >
          Study<span style={{ color: STAGE.blue }}>X</span>
        </motion.div>
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 0.6 }}
        className="mt-1 text-[12px] font-semibold uppercase tracking-[0.3em]"
        style={{ color: STAGE.text3 }}
      >
        Învață. Repetă. Reușește.
      </motion.p>
    </div>
  );
}

// ── 2. Grile ──────────────────────────────────────────────────────────────────

const QUIZ_MARKS = [1500, 2300, 3100] as const;
const QUIZ_OPTIONS = ['CK-MB', 'Troponina', 'LDH', 'AST'] as const;

export function QuizVisual() {
  const { calmMotion } = useAdaptiveMotion();
  const phase = useTimeline(QUIZ_MARKS, calmMotion);
  return (
    <div className="mx-auto w-full max-w-[470px] rounded-[28px] p-4" style={card}>
      <div className="mb-2.5 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: STAGE.text3 }}>
        <span>Grila 7 din 20</span>
        <span style={{ color: STAGE.amber }}>Rezidențiat</span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full" style={{ background: STAGE.line }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: STAGE.blue }}
          initial={{ width: '30%' }}
          animate={{ width: phase >= 3 ? '38%' : '30%' }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <Rise>
        <p className="text-[14.5px] font-semibold leading-snug" style={{ color: STAGE.text }}>
          Ce marker crește cel mai precoce în infarctul miocardic?
        </p>
      </Rise>
      <div className="mt-3 space-y-1.5">
        {QUIZ_OPTIONS.map((label, i) => {
          const picked = i === 1;
          const chosen = picked && phase >= 1;
          const correct = picked && phase >= 2;
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 rounded-[10px] border px-3.5 py-2 text-[13px] font-medium"
              style={{
                color: STAGE.text,
                background: correct ? 'rgba(48,209,88,0.16)' : chosen ? 'rgba(10,132,255,0.18)' : STAGE.panel,
                borderColor: correct ? STAGE.green : chosen ? STAGE.blue : STAGE.line,
                transition: 'background 300ms, border-color 300ms',
              }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: correct ? STAGE.green : STAGE.panelStrong, color: correct ? '#04210d' : STAGE.text2 }}
              >
                {correct ? <Check size={14} strokeWidth={3} /> : 'ABCD'[i]}
              </span>
              {label}
            </motion.div>
          );
        })}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 8 }}
        transition={{ duration: 0.5 }}
        className="mt-2.5 rounded-[10px] px-3 py-1.5 text-[11px] leading-snug"
        style={{ background: 'rgba(48,209,88,0.12)', color: STAGE.text2 }}
      >
        <strong style={{ color: STAGE.green }}>Explicație.</strong> Troponina apare în sânge la 3–4 ore și rămâne crescută zile întregi.
      </motion.div>
    </div>
  );
}

// ── 3. Flashcarduri ───────────────────────────────────────────────────────────

const CARD_MARKS = [1300, 2700, 3500] as const;

export function FlashcardVisual() {
  const { calmMotion } = useAdaptiveMotion();
  const phase = useTimeline(CARD_MARKS, calmMotion);
  const flipped = phase >= 1;
  return (
    <div className="relative mx-auto flex w-full max-w-[470px] flex-col items-center">
      <div className="absolute top-3 h-[190px] w-[320px] rounded-[20px]" style={{ ...card, opacity: 0.4, transform: 'translateY(14px) scale(0.94)' }} />
      <div className="absolute top-3 h-[190px] w-[320px] rounded-[20px]" style={{ ...card, opacity: 0.7, transform: 'translateY(7px) scale(0.97)' }} />
      <div className="relative h-[190px] w-[320px]" style={{ perspective: 900 }}>
        <motion.div
          className="relative h-full w-full"
          style={{ transformStyle: 'preserve-3d' }}
          initial={{ rotateY: 0, opacity: 0, y: 16 }}
          animate={{ rotateY: flipped ? 180 : 0, opacity: 1, y: 0 }}
          transition={{ rotateY: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.4 }, y: { duration: 0.5 } }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[20px] px-6 text-center" style={{ ...card, backfaceVisibility: 'hidden', background: STAGE.panelStrong }}>
            <span className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: STAGE.violet }}>Întrebare</span>
            <p className="text-[16px] font-semibold leading-snug" style={{ color: STAGE.text }}>Care este triada Beck din tamponada cardiacă?</p>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[20px] px-6 text-center" style={{ ...card, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'rgba(191,111,255,0.18)' }}>
            <span className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: STAGE.violet }}>Răspuns</span>
            <p className="text-[15px] font-semibold leading-snug" style={{ color: STAGE.text }}>Hipotensiune, jugulare destinse, zgomote cardiace asurzite</p>
          </div>
        </motion.div>
      </div>
      <div className="mt-6 flex items-center gap-2.5">
        {[
          { label: 'Greu', hint: 'mâine', color: STAGE.red },
          { label: 'Bine', hint: 'în 3 zile', color: STAGE.blue },
          { label: 'Ușor', hint: 'în 8 zile', color: STAGE.green },
        ].map((button) => {
          const pressed = button.label === 'Bine' && phase >= 3;
          return (
            <motion.div
              key={button.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 10, scale: pressed ? 1.07 : 1 }}
              transition={{ duration: 0.4 }}
              className="rounded-[14px] border px-4 py-2 text-center"
              style={{
                borderColor: pressed ? button.color : STAGE.line,
                background: pressed ? `${button.color}33` : STAGE.panel,
              }}
            >
              <div className="text-[13px] font-bold" style={{ color: STAGE.text }}>{button.label}</div>
              <div className="text-[10px] font-medium" style={{ color: pressed ? button.color : STAGE.text3 }}>{button.hint}</div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── 4. Biblioteca și chatul AI ────────────────────────────────────────────────

const ASK = 'Fă-mi 5 grile din mielom multiplu';
const AI_MARKS = [2500, 3300, 4200] as const;

export function AssistantVisual() {
  const { calmMotion } = useAdaptiveMotion();
  const phase = useTimeline(AI_MARKS, calmMotion);
  const typed = useTyped(ASK, 900, calmMotion, 42);
  return (
    <div className="relative mx-auto flex w-full max-w-[500px] items-start gap-4">
      <div className="w-[150px] flex-shrink-0 space-y-2 pt-1">
        {['Kumar & Clark.pdf', 'Curs hematologie.docx', 'Lawrence.pdf'].map((name, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.45 }}
            className="flex items-center gap-2 rounded-[10px] border px-2.5 py-2 text-[10.5px] font-semibold"
            style={{ background: card.background, border: card.border, color: STAGE.text2 }}
          >
            <FileText size={13} style={{ color: STAGE.blue }} />
            <span className="truncate">{name}</span>
          </motion.div>
        ))}
        <div className="px-1 pt-1 text-[10px] font-medium leading-snug" style={{ color: STAGE.text3 }}>Biblioteca ta AI</div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5 rounded-[28px] p-4" style={card}>
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-[14px] rounded-br-[10px] px-3.5 py-2 text-[12.5px] font-medium" style={{ background: STAGE.blue, color: '#fff', minHeight: 32 }}>
            {typed}<span className="opacity-60">{typed.length < ASK.length ? '▍' : ''}</span>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 10 }}
          transition={{ duration: 0.45 }}
          className="flex items-start gap-2.5"
        >
          <div className="flex-shrink-0 -mt-1"><Mascot accent={STAGE.blue} size={36} calm /></div>
          <div className="rounded-[14px] rounded-tl-[10px] px-3.5 py-2.5 text-[12px] leading-relaxed" style={{ background: STAGE.panelStrong, color: STAGE.text }}>
            Am făcut 5 grile din cartea ta. Prima: <em>Ce anomalie apare pe electroforeza proteinelor?</em>
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.8 }}
              className="ml-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'rgba(10,132,255,0.22)', color: '#7db9ff' }}
            >
              [1] Kumar, p. 1136
            </motion.span>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          className="pl-[46px] text-[10.5px] font-semibold"
          style={{ color: STAGE.green }}
        >
          ✓ Salvate în Rezidențiat › Hematologie
        </motion.div>
      </div>
    </div>
  );
}

// ── 5. Rezidențiat și Organizare ──────────────────────────────────────────────

export function PlanVisual() {
  const { calmMotion } = useAdaptiveMotion();
  const days = useCountTo(160, 142, 600, 2600, calmMotion);
  const passes = [
    { label: 'Trecerea 1', value: 100, color: STAGE.green },
    { label: 'Trecerea 2', value: 64, color: STAGE.blue },
    { label: 'Trecerea 3', value: 18, color: STAGE.violet },
    { label: 'Trecerea 4', value: 0, color: STAGE.amber },
  ];
  return (
    <div className="mx-auto w-full max-w-[480px] rounded-[28px] p-5" style={card}>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: STAGE.text3 }}>Până la examen</div>
          <div className="display text-[2.4rem] font-extrabold leading-none tabular-nums" style={{ color: STAGE.text }}>
            {days}<span className="ml-1.5 text-[14px] font-semibold" style={{ color: STAGE.text2 }}>zile</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ background: 'rgba(255,159,10,0.16)', color: STAGE.amber }}>
          <Flame size={13} /> serie de 12 zile
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {passes.map((pass, i) => (
          <div key={pass.label} className="flex items-center gap-3">
            <span className="w-[74px] text-[11px] font-semibold" style={{ color: STAGE.text2 }}>{pass.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: STAGE.line }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: pass.color }}
                initial={{ width: '0%' }}
                animate={{ width: `${pass.value}%` }}
                transition={{ delay: 0.5 + i * 0.25, duration: 1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className="w-8 text-right text-[11px] font-bold tabular-nums" style={{ color: STAGE.text }}>{pass.value}%</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-14 gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
        {Array.from({ length: 28 }, (_, i) => (
          <motion.span
            key={i}
            className="h-3.5 rounded-sm"
            initial={{ background: STAGE.line }}
            animate={{ background: i < 17 ? STAGE.blue : STAGE.line, opacity: i < 17 ? 0.5 + (i % 4) * 0.12 : 1 }}
            transition={{ delay: 1 + i * 0.045, duration: 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

// ── 6. Simulare și Caiet de erori ─────────────────────────────────────────────

const SIM_MARKS = [1800, 3200] as const;

export function ExamVisual() {
  const { calmMotion } = useAdaptiveMotion();
  const phase = useTimeline(SIM_MARKS, calmMotion);
  const minutes = useCountTo(120, 47, 400, 2800, calmMotion);
  const clock = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:00`;
  const rows = [
    { name: 'Cardiologie', value: 84, color: STAGE.green },
    { name: 'Neurologie', value: 71, color: STAGE.blue },
    { name: 'Pediatrie', value: 58, color: STAGE.amber },
  ];
  return (
    <div className="mx-auto flex w-full max-w-[500px] gap-3.5">
      <div className="flex-1 rounded-[28px] p-4" style={card}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[18px] font-extrabold tabular-nums" style={{ color: STAGE.text }}>
            <Timer size={16} style={{ color: STAGE.amber }} /> {clock}
          </span>
          <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ background: 'rgba(255,159,10,0.16)', color: STAGE.amber }}>−0,25</span>
        </div>
        <div className="mt-3 space-y-2.5">
          {rows.map((row, i) => (
            <div key={row.name}>
              <div className="mb-1 flex justify-between text-[10.5px] font-semibold" style={{ color: STAGE.text2 }}>
                <span>{row.name}</span>
                <span className="tabular-nums" style={{ color: STAGE.text }}>{row.value}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: STAGE.line }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: row.color }}
                  initial={{ width: '0%' }}
                  animate={{ width: phase >= 1 ? `${row.value}%` : '0%' }}
                  transition={{ delay: i * 0.18, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: phase >= 2 ? 1 : 0, x: phase >= 2 ? 0 : 24 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-[170px] flex-shrink-0 rounded-[28px] p-4"
        style={card}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: STAGE.red }}>
          <NotebookPen size={13} /> Caiet de erori
        </div>
        <div className="mt-2.5 space-y-2">
          {['Hipercalcemie: ECG', 'Doza de insulină', 'Criteriile Duke'].map((item, i) => (
            <motion.div
              key={item}
              initial={{ opacity: 0 }}
              animate={{ opacity: phase >= 2 ? 1 : 0 }}
              transition={{ delay: 0.3 + i * 0.2 }}
              className="flex items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[10.5px] font-medium"
              style={{ background: 'rgba(255,69,58,0.1)', color: STAGE.text2 }}
            >
              <X size={11} style={{ color: STAGE.red }} className="flex-shrink-0" />
              <span className="truncate">{item}</span>
            </motion.div>
          ))}
        </div>
        <div className="mt-2.5 text-[10px] font-medium leading-snug" style={{ color: STAGE.text3 }}>Le repeți până le fixezi.</div>
      </motion.div>
    </div>
  );
}

// ── 7. Final ──────────────────────────────────────────────────────────────────

export function FinishVisual() {
  const { calmMotion } = useAdaptiveMotion();
  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      {[0, 1, 2].map((ring) => (
        <motion.span
          key={ring}
          aria-hidden="true"
          className="absolute rounded-full border"
          style={{ borderColor: 'rgba(10,132,255,0.35)', width: 150, height: 150 }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={calmMotion ? { opacity: 0.18, scale: 1.3 + ring * 0.3 } : { opacity: [0, 0.5, 0], scale: [0.7, 1.9 + ring * 0.2] }}
          transition={calmMotion ? { duration: 0 } : { duration: 3.2, repeat: Infinity, delay: ring * 1, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.panel}
        className="relative"
      >
        <Mascot accent={STAGE.blue} size={132} calm={calmMotion} />
      </motion.div>
    </div>
  );
}
