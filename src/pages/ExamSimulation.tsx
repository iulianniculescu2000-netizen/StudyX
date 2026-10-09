import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Timer } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import SectionLabel from '../components/ui/SectionLabel';
import TourHelpButton from '../tutorial/TourHelpButton';
import HelpTip from '../components/ui/HelpTip';
import ThemedSelect from '../components/ThemedSelect';
import { useQuizStore } from '../store/quizStore';
import { buildExamSimulation, examDisciplines, examLengthOptions, examMinutesFor } from '../lib/examSimulation';

const formatDuration = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`);

export default function ExamSimulation() {
  const theme = useTheme();
  const navigate = useNavigate();
  const quizzes = useQuizStore((state) => state.quizzes);
  const addQuiz = useQuizStore((state) => state.addQuiz);
  const [discipline, setDiscipline] = useState<string>('');

  const disciplines = useMemo(() => examDisciplines(quizzes), [quizzes]);
  const available = useMemo(
    () => (discipline ? disciplines.find((d) => d.name === discipline)?.count ?? 0 : disciplines.reduce((sum, d) => sum + d.count, 0)),
    [disciplines, discipline],
  );

  const lengthOptions = useMemo(() => examLengthOptions(available), [available]);

  const start = (size: number) => {
    const simulation = buildExamSimulation(quizzes, size, { discipline: discipline || null });
    if (!simulation) return;
    addQuiz(simulation.quiz);
    navigate(`/play/${simulation.quiz.id}`, { state: { mode: 'exam', examMinutes: simulation.minutes } });
  };

  return (
    <div className="custom-scrollbar h-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          back={{ to: '/review', label: 'Recapitulare' }}
          title="Simulare de examen"
          actions={<TourHelpButton tour="simulation" label="Vezi turul Simulării de examen" />}
          subtitle="Grile alese la întâmplare din băncile tale, cu timp total și punctaj cu penalizare (−0,25 pe opțiune greșită). La final vezi rezultatul pe discipline."
        />

        {available === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Nu ai încă grile pentru simulare"
            body="Importă o bancă de grile din Rezidențiat, apoi revino aici."
            primary={{ label: 'Rezidențiat', to: '/rezidentiat' }}
          />
        ) : (
          <>
            <SectionLabel className="mb-2">Disciplină</SectionLabel>
            <label data-tutorial="simulation-discipline" className="mb-6 block">
              <span className="sr-only">Disciplina simulării</span>
              <ThemedSelect
                value={discipline}
                onChange={setDiscipline}
                options={[
                  { value: '', label: `Toate disciplinele (${disciplines.reduce((sum, d) => sum + d.count, 0)} grile)` },
                  ...disciplines.map((d) => ({ value: d.name, label: `${d.name} (${d.count})` })),
                ]}
              />
            </label>

            <div className="mb-2 flex items-center gap-1.5">
              <SectionLabel>Lungime</SectionLabel>
              <HelpTip id="sim-length" size={16} />
            </div>
            <ul data-tutorial="simulation-lengths" className={`grid gap-3${lengthOptions.length >= 3 ? 'sm:grid-cols-3' : lengthOptions.length === 2 ? 'sm:grid-cols-2' : 'max-w-sm'}`}>
              {lengthOptions.map(({ count, size, partial }) => (
                <li key={size}>
                  <button
                    type="button"
                    onClick={() => start(size)}
                    className="glass-panel fx-lift press-feedback focus-ring flex w-full flex-col items-start gap-2 rounded-[var(--r-lg)] p-5 text-left"
                  >
                    <span className="text-2xl font-bold tabular-nums" style={{ color: theme.text }}>{count}</span>
                    <span className="text-[13px]" style={{ color: theme.text2 }}>{count === 1 ? 'grilă' : 'grile'}{partial ? ' (toate cele existente)' : ''}</span>
                    <span className="flex items-center gap-1.5 text-[12px]" style={{ color: theme.text3 }}>
                      <Timer size={13} aria-hidden="true" />{formatDuration(examMinutesFor(count))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {lengthOptions.length === 1 && lengthOptions[0].partial && (
              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: theme.text3 }}>
                {discipline ? 'Această disciplină are' : 'Băncile tale au'} doar {lengthOptions[0].count} {lengthOptions[0].count === 1 ? 'grilă' : 'grile'}, deci simularea le folosește pe toate. Adaugă mai multe pentru simulări de 50, 100 sau 200 de grile.
              </p>
            )}
            <p className="mt-5 text-[12px] leading-relaxed" style={{ color: theme.text3 }}>
              Timpul total e 1,2 minute pe grilă. Când expiră, simularea se încheie cu răspunsurile date până atunci.
              Fără explicații în timpul simulării; le vezi după, în rezultate.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
