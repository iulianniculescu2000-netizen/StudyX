import { useOrganizareStore } from '../../store/organizareStore';
import { useToastStore } from '../../store/toastStore';
import { useUIStore } from '../../store/uiStore';
import { buildChapterContext } from '../ai/chapterContext';
import { BOOK_FILES } from '../bookPages';
import { curriculumChapters } from '../curriculum';
import type { Topic } from './types';

export const BOOK_NAME = { K: 'Kumar', L: 'Lawrence', S: 'Sinopsis' } as const;

/** The file to open for a topic: its own chapter PDF when there is one, otherwise the book it comes from. */
export const fileForTopic = (t: Topic) => t.file || BOOK_FILES[t.book];

export type TopicAction = 'explain' | 'quiz' | 'cards';

const reference = (t: Topic) => `${t.name} (${BOOK_NAME[t.book]}, ${t.chapter.replace(/^\w+, /, '')}, ${t.src})`;

const PROMPTS: Record<TopicAction, (t: Topic) => string> = {
  explain: (t) => `Explică-mi, pentru rezidențiat: ${reference(t)}. Ce trebuie să rețin 100%, ce capcane apar în grile?`,
  quiz: (t) => `Fă-mi 10 grile de rezidențiat din ${reference(t)}.`,
  cards: (t) => `Fă-mi 15 flashcarduri din ${reference(t)}.`,
};

/**
 * Opens the assistant with a question about the topic typed in, ready to send. The topic's curriculum chapter
 * travels with it (`chapterContext`: name, book, pages and, when the book is indexed, the chapter text; otherwise
 * a note that the text is not indexed). For „explain” the indexed book is also set as the chat's scope.
 */
export async function askAboutTopic(action: TopicAction, topic: Topic): Promise<void> {
  const chapter = curriculumChapters()[topic.group];
  const detail: Record<string, unknown> = { open: true, prompt: PROMPTS[action](topic) };
  if (chapter) {
    const { context, scope } = await buildChapterContext(chapter, { topicName: topic.name, topicSrc: topic.src });
    detail.chapterContext = context;
    if (scope && action === 'explain') {
      detail.sourceId = scope.sourceId;
      detail.sourceName = scope.sourceName;
      detail.heading = scope.heading;
    }
  }
  window.dispatchEvent(new CustomEvent('studyx:ai-prompt', { detail }));
  useUIStore.getState().setChatOpen(true);
}

/**
 * Opens a study file from the folder the student picked. The folder is asked for once and remembered per profile;
 * only the desktop app can open files.
 */
export async function openStudyFile(profileId: string, relPath: string): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const api = window.electronAPI;
  if (!api?.organizareOpen || !api.organizarePickRoot) {
    toast('Fișierele se deschid din aplicația desktop.', 'info', 3500);
    return;
  }
  const store = useOrganizareStore.getState();
  let root = store.byProfile[profileId]?.root ?? null;
  if (!root) {
    root = await api.organizarePickRoot();
    if (!root) return;
    store.setRoot(profileId, root);
  }
  const result = await api.organizareOpen(root, relPath);
  if (result.ok) return;
  toast(result.error ?? 'Fișierul nu a putut fi deschis.', 'error', 5000, {
    label: 'Alege alt folder',
    onClick: () => useOrganizareStore.getState().setRoot(profileId, null),
  });
}
