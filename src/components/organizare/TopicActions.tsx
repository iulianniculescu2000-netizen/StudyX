import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { BookOpen, BookOpenCheck, ExternalLink, FileText, Layers, ListChecks, MessageCircle } from 'lucide-react';
import { askAboutTopic, openStudyFile, fileForTopic } from '../../lib/organizare/actions';
import { chapterBookHref, chapterCardCount, chapterFlashcardsHref } from '../../lib/organizare/appLinks';
import { curriculumChapters } from '../../lib/curriculum';
import { useQuizStore } from '../../store/quizStore';
import { canReadBookPdf } from '../pdf/bridge';
import { dispatchOpenBook } from '../pdf/bookRequest';
import type { Topic } from '../../lib/organizare/types';
import { useOrganizare } from './context';
import { GhostButton } from './ui';

/**
 * What can be done with a topic besides reading about it: open its file, ask the assistant,
 * have it make quizzes or flashcards, and jump to the quizzes the app already has for its specialty.
 */
export default function TopicActions({ topic, compact = false }: { topic: Topic; compact?: boolean }) {
  const { profileId, grileHref } = useOrganizare();
  const navigate = useNavigate();
  const href = grileHref(topic);
  const inApp = canReadBookPdf();
  const chapter = curriculumChapters()[topic.group];
  const quizzes = useQuizStore((state) => state.quizzes);
  const cardCount = useMemo(() => (chapter ? chapterCardCount(quizzes, chapter) : 0), [chapter, quizzes]);
  return (
    <div className="flex flex-wrap gap-2">
      {inApp ? (
        <>
          <GhostButton tone="accent" onClick={() => dispatchOpenBook({ book: topic.book, chapterIndex: topic.group, topicIndex: topic.index })}>
            <FileText size={14} /> {topic.file ? 'Citește capitolul' : 'Citește în carte'}
          </GhostButton>
          <GhostButton onClick={() => void openStudyFile(profileId, fileForTopic(topic))}>
            <ExternalLink size={14} /> Deschide extern
          </GhostButton>
        </>
      ) : (
        <GhostButton tone="accent" onClick={() => void openStudyFile(profileId, fileForTopic(topic))}>
          <FileText size={14} /> {topic.file ? 'Deschide fișierul' : 'Deschide cartea'}
        </GhostButton>
      )}
      <GhostButton onClick={() => void askAboutTopic('explain', topic)}>
        <MessageCircle size={14} /> Explică-mi cu AI
      </GhostButton>
      {!compact && (
        <>
          <GhostButton onClick={() => void askAboutTopic('quiz', topic)}>
            <ListChecks size={14} /> Grile cu AI
          </GhostButton>
          <GhostButton onClick={() => void askAboutTopic('cards', topic)}>
            <Layers size={14} /> Flashcarduri cu AI
          </GhostButton>
        </>
      )}
      {!compact && chapter && (
        <GhostButton onClick={() => navigate(chapterBookHref(chapter))}>
          <BookOpen size={14} /> Capitolul în carte
        </GhostButton>
      )}
      {!compact && chapter && cardCount > 0 && (
        <GhostButton onClick={() => navigate(chapterFlashcardsHref(chapter))}>
          <Layers size={14} /> Flashcardurile capitolului · {cardCount}
        </GhostButton>
      )}
      {href && (
        <GhostButton onClick={() => navigate(href)}>
          <BookOpenCheck size={14} /> Grilele din aplicație
        </GhostButton>
      )}
    </div>
  );
}
