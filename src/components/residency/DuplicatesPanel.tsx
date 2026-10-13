import { useMemo, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import SectionLabel from '../ui/SectionLabel';
import { memberKey, redundantMembers, type DuplicateGroup, type DuplicateMember, type DuplicateReport } from '../../lib/bankDedup';
import type { Question, Quiz } from '../../types';

const PAGE = 12;

const toTargets = (members: DuplicateMember[]) => {
  const byQuiz = new Map<string, string[]>();
  for (const m of members) byQuiz.set(m.quizId, [...(byQuiz.get(m.quizId) ?? []), m.questionId]);
  return [...byQuiz].map(([quizId, questionIds]) => ({ quizId, questionIds }));
};

function MemberCard({ quiz, question, role }: { quiz: Quiz | undefined; question: Question | undefined; role: 'primary' | 'copy' | 'hidden' }) {
  const theme = useTheme();
  if (!quiz || !question) return null;
  return (
    <div className="min-w-0 rounded-[var(--r-sm)] p-3" style={{ background: 'var(--fill-subtle)', opacity: role === 'hidden' ? 0.6 : 1 }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11.5px] font-medium" style={{ color: theme.text3 }} title={quiz.title}>{quiz.title}</span>
        <span className="flex-shrink-0 text-[11px] font-semibold" style={{ color: role === 'primary' ? theme.accentText : theme.text3 }}>
          {role === 'primary' ? 'Rămâne' : role === 'hidden' ? 'Ascunsă' : 'Copie'}
        </span>
      </div>
      <div className="line-clamp-4 text-[13px] leading-snug" style={{ color: theme.text }}>{question.text}</div>
      <ul className="mt-2 space-y-0.5">
        {question.options.map((option) => (
          <li key={option.id} className="flex gap-1.5 text-[12px] leading-snug" style={{ color: option.isCorrect ? theme.accentText : theme.text3 }}>
            <span className="w-3 flex-shrink-0">{option.isCorrect ? <Check size={11} /> : null}</span>
            <span className="min-w-0">{option.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Reviews the duplicate questions of the bank, side by side. The only change it
 * can make is a reversible `hidden` flag on the extra copies: nothing is
 * deleted and every answer already given stays where it is.
 */
export default function DuplicatesPanel({ report }: { report: DuplicateReport }) {
  const theme = useTheme();
  const quizzes = useQuizStore((state) => state.quizzes);
  const setQuestionsHidden = useQuizStore((state) => state.setQuestionsHidden);
  const addToast = useToastStore((state) => state.addToast);
  const [shown, setShown] = useState(PAGE);

  const index = useMemo(() => {
    const quizById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
    const questionAt = (m: DuplicateMember) => quizById.get(m.quizId)?.questions.find((question) => question.id === m.questionId);
    return { quizById, questionAt };
  }, [quizzes]);

  const redundant = useMemo(() => redundantMembers(report), [report]);
  const hiddenCopies = redundant.filter((m) => index.questionAt(m)?.hidden === true);
  const visibleCopies = redundant.filter((m) => index.questionAt(m)?.hidden !== true);

  const hideAll = () => {
    setQuestionsHidden(toTargets(visibleCopies), true);
    addToast(`${visibleCopies.length} copii ascunse din sesiuni.`, 'success', 4000);
  };
  const showAll = () => {
    // Every hidden flag in the app comes from this feature, so reveal all of them, grouped or not.
    const hidden = quizzes.flatMap((quiz) => quiz.questions.filter((question) => question.hidden).map((question) => ({ quizId: quiz.id, questionIds: [question.id] })));
    setQuestionsHidden(hidden, false);
    addToast('Copiile sunt din nou în sesiuni.', 'success', 4000);
  };
  const toggleGroup = (group: DuplicateGroup) => {
    const copies = group.members.filter((m) => m !== group.primary);
    const allHidden = copies.every((m) => index.questionAt(m)?.hidden === true);
    setQuestionsHidden(toTargets(copies), !allHidden);
  };

  const actionStyle = { color: theme.text2 };

  return (
    <section data-testid="duplicates-panel" className="fx-rise space-y-3">
      <SectionLabel className="mb-0">Dublate</SectionLabel>
      <div className="glass-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-[13px]" style={{ color: theme.text2 }}>
            <span className="font-semibold" style={{ color: theme.text }}>{report.duplicateCount} întrebări duplicate</span> în {report.groups.length} grupuri.
            Progresul le numără o singură dată; nimic nu se șterge.
            {hiddenCopies.length > 0 && <> {hiddenCopies.length} sunt ascunse din sesiuni.</>}
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {visibleCopies.length > 0 && (
              <button type="button" onClick={hideAll} className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium" style={actionStyle}>
                <EyeOff size={13} /> Ascunde duplicatele
              </button>
            )}
            {(hiddenCopies.length > 0 || quizzes.some((quiz) => quiz.questions.some((question) => question.hidden))) && (
              <button type="button" onClick={showAll} className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium" style={actionStyle}>
                <Eye size={13} /> Arată din nou
              </button>
            )}
          </div>
        </div>
        {report.conflicts.length > 0 && (
          <div className="mt-2 text-[12px]" style={{ color: theme.text3 }}>
            {report.conflicts.length} perechi seamănă, dar au răspunsuri corecte diferite: nu au fost unite.
          </div>
        )}
      </div>

      {report.groups.slice(0, shown).map((group) => {
        const copies = group.members.filter((m) => m !== group.primary);
        const allHidden = copies.every((m) => index.questionAt(m)?.hidden === true);
        return (
          <div key={group.id} className="glass-panel rounded-2xl p-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {group.members.map((member) => (
                <MemberCard
                  key={memberKey(member.quizId, member.questionId)}
                  quiz={index.quizById.get(member.quizId)}
                  question={index.questionAt(member)}
                  role={member === group.primary ? 'primary' : index.questionAt(member)?.hidden ? 'hidden' : 'copy'}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px]" style={{ color: theme.text3 }}>
              <span>{group.kind === 'exact' ? 'Identice' : 'Aproape identice, același răspuns'}</span>
              <button type="button" onClick={() => toggleGroup(group)} className="press-feedback rounded-full px-2.5 py-1 font-medium hover:underline underline-offset-2" style={actionStyle}>
                {allHidden ? 'Arată din nou' : copies.length > 1 ? 'Ascunde copiile' : 'Ascunde copia'}
              </button>
            </div>
          </div>
        );
      })}

      {shown < report.groups.length && (
        <button type="button" onClick={() => setShown((count) => count + PAGE)} className="fine-chip press-feedback mx-auto block rounded-full px-4 py-1.5 text-[12.5px] font-medium" style={actionStyle}>
          Arată mai multe ({report.groups.length - shown})
        </button>
      )}
    </section>
  );
}
