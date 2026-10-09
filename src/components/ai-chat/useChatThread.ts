import { useLocation } from 'react-router-dom';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { isRezidentiatQuiz } from '../../lib/rezidentiatBank';
import { isUnderRezidentiatRoot } from '../../lib/rezidentiatRoot';
import type { ChatThread } from './useChatMessages';

/**
 * Which AI conversation is live, based on where the user actually is —
 * not just the `/rezidentiat` page itself, but anywhere inside that section:
 * a folder nested under the Rezidențiat root, or a quiz/play/results screen
 * for a quiz tagged as rezidentiat content. Leaving the section (any other
 * folder, any regular quiz) falls back to the general conversation.
 */
export function useChatThread(): ChatThread {
  const { pathname } = useLocation();
  const folders = useFolderStore((state) => state.folders);
  const quizzes = useQuizStore((state) => state.quizzes);

  if (pathname.startsWith('/rezidentiat')) return 'rezidentiat';

  const folderMatch = pathname.match(/^\/folder\/([^/]+)/);
  if (folderMatch) {
    return isUnderRezidentiatRoot(folderMatch[1], folders) ? 'rezidentiat' : 'general';
  }

  const quizMatch = pathname.match(/^\/(?:quiz|play|results)\/([^/]+)/);
  if (quizMatch) {
    const quiz = quizzes.find((q) => q.id === quizMatch[1]);
    if (quiz && isRezidentiatQuiz(quiz)) return 'rezidentiat';
  }

  return 'general';
}
