import { useQuizStore } from '../../../store/quizStore';
import { useAIStore } from '../../../store/aiStore';
import { useToastStore } from '../../../store/toastStore';
import { useUserStore } from '../../../store/userStore';
import { friendlyAIError } from '../../../lib/ai/friendlyError';
import { extractCaptionedImagesFromPdf, renderPdfPagesWithText, type CaptionedPdfImage, type PdfFlashcardPageSnapshot } from '../../../lib/imageProcessing';
import { flashcardImageKey, putFlashcardImage } from '../../../lib/flashcardImageStore';
import type { Question } from '../../../types';
import { generateId, VISUAL_FLASHCARD_IMAGE_MAX_EDGE, buildPhotoCardQuestion, buildFlashcardQuestion, attachRelevantPdfImages } from '../cardBuilders';
import type { AiRun } from './useAiRun';
import type { DeckTarget } from './useDeckTarget';
import type { GeneratedDeckApi } from './useGeneratedDeck';
import { PROFILE_CHANGED_TOAST } from './progress';

/** PDF / TXT -> AI flashcards (or one photo card per captioned course image). */
export function usePdfDeckGeneration(ai: AiRun, target: DeckTarget, generated: GeneratedDeckApi) {
  const addQuiz = useQuizStore((s) => s.addQuiz);
  const addToast = useToastStore((state) => state.addToast);
  const addKnowledgeSource = useAIStore((s) => s.addKnowledgeSource);
  const knowledgeSources = useAIStore((s) => s.knowledgeSources);
  const { resolveGeneratedFolder } = target;
  const { announceGeneratedDeck, setResume } = generated;

  // One card per captioned course photo (front = image, back = verbatim caption).
  const generateVisualDeckFromCaptions = async (captioned: CaptionedPdfImage[], sourceName: string) => {
    const deckId = generateId();
    await Promise.all(
      captioned.map((entry) => putFlashcardImage(flashcardImageKey(deckId, entry.tag), entry.imageDataUrl)),
    );

    const questions: Question[] = captioned.map((entry) => buildPhotoCardQuestion(entry, deckId));
    const baseName = sourceName.replace(/\.[^.]+$/, '') || 'Curs';
    const folderTarget = resolveGeneratedFolder(sourceName);
    const title = `Atlas foto · ${baseName}`;

    addQuiz({
      id: deckId,
      title,
      description: `${questions.length} carduri vizuale din ${sourceName}. Față = imaginea din curs, spate = descrierea originală.`,
      emoji: '🩺',
      color: folderTarget.folder?.color ?? 'pink',
      category: folderTarget.folder?.name ?? 'Atlas vizual',
      folderId: folderTarget.folder?.id ?? null,
      kind: 'flashcard',
      shuffleQuestions: true,
      shuffleAnswers: false,
      tags: ['ai', 'foto', 'atlas'],
      questions,
      createdAt: Date.now(),
    });

    announceGeneratedDeck({ id: deckId, title, count: questions.length, folder: folderTarget.folder, suggested: folderTarget.suggested });
  };

  const generateDeckFromPdf = async (text: string, sourceName = 'PDF', pages: PdfFlashcardPageSnapshot[] = []) => {
    ai.setAiLoading(true);
    ai.setAiError('');
    const profileAtStart = useUserStore.getState().activeProfileId;

    try {
      const outcome = await ai.generateCards(text, sourceName, ai.aiCount);
      if (useUserStore.getState().activeProfileId !== profileAtStart) {
        addToast(PROFILE_CHANGED_TOAST, 'warning', 7000);
        return;
      }
      const questions: Question[] = attachRelevantPdfImages(
        outcome.cards.map((entry) => buildFlashcardQuestion(entry.front, entry.back)),
        pages,
      );

      if (questions.length === 0) {
        throw new Error('AI nu a putut transforma PDF-ul în flashcarduri utile.');
      }

      const id = generateId();
      const sourceAlreadyIndexed = knowledgeSources.some((source) => (
        source.name === sourceName && source.charCount === text.trim().length && source.indexStatus === 'ready'
      ));
      if (!sourceAlreadyIndexed && text.trim().length >= 300) {
        void addKnowledgeSource(sourceName, text, sourceName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'txt').catch((e) => console.error('[StudyX] KB indexing failed for', sourceName, e));
      }

      const folderTarget = resolveGeneratedFolder(sourceName);
      const title = `Deck AI · ${new Date().toLocaleDateString('ro-RO')}`;
      addQuiz({
        id,
        title,
        description: `Flashcarduri smart generate din ${sourceName}. Imaginile relevante din PDF sunt pastrate pe cardurile potrivite.`,
        emoji: '🤖',
        color: folderTarget.folder?.color ?? 'purple',
        category: folderTarget.folder?.name ?? 'AI Flashcards',
        folderId: folderTarget.folder?.id ?? null,
        kind: 'flashcard',
        shuffleQuestions: true,
        shuffleAnswers: true,
        tags: ['ai', 'pdf'],
        questions,
        createdAt: Date.now(),
      });

      setResume(outcome.interruption
        ? { deckId: id, text, sourceName, requested: ai.aiCount, nextChunk: outcome.interruption.nextChunk, pages }
        : null);
      announceGeneratedDeck({
        id,
        title,
        count: questions.length,
        folder: folderTarget.folder,
        suggested: folderTarget.suggested,
        interrupted: outcome.interruption
          ? { requested: ai.aiCount, reason: outcome.interruption.reason, waitSeconds: outcome.interruption.waitSeconds }
          : undefined,
      });
    } catch (error: unknown) {
      const message = friendlyAIError(error);
      ai.setAiError(message);
      ai.notifyGenerationFailed(message);
    } finally {
      ai.setAiLoading(false);
      ai.setAiProgress('');
    }
  };

  const processPdfFile = async (file: File) => {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    ai.setAiLoading(true);
    ai.setAiError('');

    try {
      // Course with captioned photos → one card per image, verbatim caption.
      if (isPdf) {
        ai.setAiProgress('Caut imagini cu descriere în curs...');
        const captioned = await extractCaptionedImagesFromPdf(file, {
          maxLongEdge: VISUAL_FLASHCARD_IMAGE_MAX_EDGE,
          quality: 0.84,
          mimeType: 'image/jpeg',
        }).catch(() => [] as CaptionedPdfImage[]);

        if (captioned.length >= 2) {
          ai.setAiProgress(`Pregătesc ${captioned.length} carduri foto...`);
          await generateVisualDeckFromCaptions(captioned, file.name);
          return;
        }
      }

      // Plain text PDF / TXT → AI generates flashcards from the text.
      ai.setAiProgress('Extrag textul...');
      const pageSnapshots = isPdf
        ? await renderPdfPagesWithText(file, {
            maxLongEdge: VISUAL_FLASHCARD_IMAGE_MAX_EDGE,
            quality: 0.84,
            mimeType: 'image/jpeg',
          })
        : [];
      let text = '';
      if (isPdf) {
        try {
          text = await (await import('../../../ai/pdfParser')).parsePDF(file);
        } catch {
          text = pageSnapshots.map((page) => page.text).filter(Boolean).join('\n\n');
        }
      } else {
        text = await file.text();
      }

      if (text.trim().length < 60) {
        ai.setAiError('PDF-ul pare să fie scanat fără text digital. Încearcă alt PDF sau procesează-l întâi cu OCR în Biblioteca AI.');
        return;
      }

      ai.setAiProgress('AI generează cardurile...');
      await generateDeckFromPdf(text, file.name, pageSnapshots);
    } catch (error: unknown) {
      ai.setAiError(error instanceof Error ? error.message : 'Eroare la procesarea fișierului.');
    } finally {
      ai.setAiLoading(false);
      ai.setAiProgress('');
    }
  };

  return { generateDeckFromPdf, processPdfFile };
}
