import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuizStore } from '../../../store/quizStore';
import { useAIStore } from '../../../store/aiStore';
import { notesToFlashcards } from '../../../lib/groq';
import { renderPdfPagesAsImages, renderPdfPagesWithText, resizeImageFile, type PdfFlashcardPageSnapshot } from '../../../lib/imageProcessing';
import type { Difficulty, Question } from '../../../types';
import { generateId, OPTION_IDS, VISUAL_FLASHCARD_IMAGE_MAX_EDGE, buildFlashcardQuestion, splitFlashcardAnswer } from '../cardBuilders';
import { parseCsvFlashcards } from './csvCards';
import type { AiRun } from './useAiRun';
import type { DeckTarget } from './useDeckTarget';

/** CSV and photo/PDF-with-pictures imports, plus the hidden file inputs that start them. */
export function useDeckImport(
  ai: AiRun,
  target: DeckTarget,
  generateDeckFromPdf: (text: string, sourceName?: string, pages?: PdfFlashcardPageSnapshot[]) => Promise<void>,
) {
  const navigate = useNavigate();
  const addQuiz = useQuizStore((s) => s.addQuiz);
  const hasKey = useAIStore((s) => s.hasKey);
  const { selectedFolder } = target;
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [photoImporting, setPhotoImporting] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [ankiModalOpen, setAnkiModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    const input = ref.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  // The Electron-native "text only" branch that used to sit here was gated behind
  // a constant hard-wired to false, so it never ran. The browser file picker path
  // handles both builds and additionally supports captioned-image decks.
  const handlePdfImport = async () => {
    if (ai.guardBusy()) return;
    openPicker(fileInputRef);
  };

  const handleCsvImport = () => {
    if (ai.guardBusy()) return;
    openPicker(csvInputRef);
  };

  const handlePhotoImport = () => {
    if (ai.guardBusy()) return;
    openPicker(photoInputRef);
  };

  const processCsvFile = async (file: File) => {
    setCsvImporting(true);
    setCsvError('');

    try {
      const questions = parseCsvFlashcards(await file.text());
      const deckId = generateId();
      const fileName = file.name.replace(/\.[^.]+$/, '');

      addQuiz({
        id: deckId,
        title: `Deck Anki · ${fileName}`,
        description: `Importat din ${file.name} (${questions.length} carduri)`,
        emoji: '🗂️',
        color: selectedFolder?.color ?? 'teal',
        category: selectedFolder?.name ?? 'Import',
        folderId: selectedFolder?.id ?? null,
        kind: 'flashcard',
        shuffleQuestions: true,
        shuffleAnswers: false,
        tags: ['anki', 'import'],
        questions,
        createdAt: Date.now(),
      });

      navigate(`/flashcards/session/${deckId}?mode=all`);
    } catch (error: unknown) {
      setCsvError(error instanceof Error ? error.message : 'Eroare la importul CSV.');
    } finally {
      setCsvImporting(false);
    }
  };

  const processPhotoFiles = async (files: File[]) => {
    setPhotoImporting(true);
    setPhotoError('');

    try {
      const visualQuestions: Question[] = [];
      let smartDeckCreated = false;

      for (const file of files) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(file.name);

        if (isPdf) {
          const pageSnapshots = await renderPdfPagesWithText(file, {
            maxLongEdge: VISUAL_FLASHCARD_IMAGE_MAX_EDGE,
            quality: 0.84,
            mimeType: 'image/jpeg',
          });
          const extractedText = pageSnapshots.map((page) => page.text).filter(Boolean).join('\n\n');

          if (hasKey && extractedText.trim().length >= 80) {
            await generateDeckFromPdf(extractedText, file.name, pageSnapshots);
            smartDeckCreated = true;
            continue;
          }

          const pages = await renderPdfPagesAsImages(file, {
            maxLongEdge: VISUAL_FLASHCARD_IMAGE_MAX_EDGE,
            quality: 0.88,
            mimeType: 'image/jpeg',
          });

          pages.forEach((page) => {
            visualQuestions.push({
              id: generateId(),
              text: `Ce concept sau detaliu important trebuie recunoscut în imaginea ${visualQuestions.length + 1}?`,
              imageUrl: page.dataUrl,
              multipleCorrect: false,
              difficulty: 'medium' as Difficulty,
              explanation: `${page.sourceName}, pagina ${page.pageNumber}. Completează răspunsul după ce verifici materialul sursă; pentru carduri complet automate folosește PDF digital sau OCR în Biblioteca AI.`,
              options: [{
                id: OPTION_IDS[0] ?? generateId(),
                text: 'Recunoaște imaginea și formulează răspunsul esențial din materialul sursă.',
                isCorrect: true,
              }],
            });
          });
          continue;
        }

        if (isImage) {
          const dataUrl = await resizeImageFile(file, {
            maxLongEdge: VISUAL_FLASHCARD_IMAGE_MAX_EDGE,
            quality: 0.88,
            mimeType: 'image/jpeg',
          });
          let ocrText = '';
          if (hasKey) {
            try {
              const { parseImageOCR } = await import('../../../ai/ocrParser');
              ocrText = await parseImageOCR(file);
            } catch {
              ocrText = '';
            }
          }

          if (hasKey && ocrText.trim().length >= 80) {
            const generated = await notesToFlashcards(ocrText, {
              count: Math.min(3, Math.max(1, ai.aiCount)),
              avoidFronts: ai.existingFlashcardFronts,
              sourceName: file.name,
            });
            generated.forEach((entry) => {
              visualQuestions.push({
                ...buildFlashcardQuestion(entry.front, entry.back),
                imageUrl: dataUrl,
                explanation: [
                  splitFlashcardAnswer(entry.back).explanation,
                  `Imagine sursă: ${file.name}.`,
                ].filter(Boolean).join('\n\n'),
              });
            });
            continue;
          }

          visualQuestions.push({
            id: generateId(),
            text: `Ce concept sau detaliu important trebuie recunoscut în imaginea ${visualQuestions.length + 1}?`,
            imageUrl: dataUrl,
            multipleCorrect: false,
            difficulty: 'medium' as Difficulty,
            explanation: `Imagine sursă: ${file.name}. Dacă imaginea conține text, activează OCR/Biblioteca AI pentru generare complet automată.`,
            options: [{
              id: OPTION_IDS[0] ?? generateId(),
              text: 'Recunoaște imaginea și formulează răspunsul esențial din materialul sursă.',
              isCorrect: true,
            }],
          });
        }
      }

      if (visualQuestions.length === 0) {
        if (smartDeckCreated) return;
        throw new Error('Nu am găsit imagini valide. Alege JPG, PNG, WEBP, BMP sau un PDF cu poze.');
      }

      const deckId = generateId();
      const firstName = files[0]?.name.replace(/\.[^.]+$/, '') || 'poze';
      const category = firstName.toLowerCase().includes('derm') ? 'Dermatologie' : 'Altele';

      addQuiz({
        id: deckId,
        title: `Deck foto · ${firstName}`,
        description: `Import vizual cu ${visualQuestions.length} carduri din poze/PDF.`,
        emoji: '🖼️',
        color: selectedFolder?.color ?? 'teal',
        category: selectedFolder?.name ?? category,
        folderId: selectedFolder?.id ?? null,
        kind: 'flashcard',
        shuffleQuestions: false,
        shuffleAnswers: false,
        tags: ['flashcard', 'image', 'visual'],
        questions: visualQuestions,
        createdAt: Date.now(),
      });

      navigate(`/flashcards/session/${deckId}?mode=all`);
    } catch (error: unknown) {
      setPhotoError(error instanceof Error ? error.message : 'Eroare la importul imaginilor.');
    } finally {
      setPhotoImporting(false);
    }
  };

  return {
    fileInputRef, csvInputRef, photoInputRef,
    csvImporting, csvError, photoImporting, photoError, ankiModalOpen, setAnkiModalOpen,
    handlePdfImport, handleCsvImport, handlePhotoImport, processCsvFile, processPhotoFiles,
  };
}
