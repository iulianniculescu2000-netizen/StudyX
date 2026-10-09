import { AnimatePresence, motion } from 'framer-motion';
import { useBack } from '../hooks/useBack';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useState, useRef, useMemo, useDeferredValue, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, Pencil, Plus, Bot, FileText, X } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useQuizStore } from '../store/quizStore';
import { useUserStore } from '../store/userStore';
import { useFolderStore } from '../store/folderStore';
import { withoutFlashcardFolders } from '../lib/folderScope';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore } from '../store/aiStore';
import type { Question, Option, Difficulty, QuizColor } from '../types';
import { ALL_QUESTION_TYPES, type QuestionType } from '../lib/ai/questionTypes';
import { OPTION_IDS, compressImage, generateId, newQuestion } from './quiz-create/helpers';
import {
  QuestionPreviewModal,
  QuizAIGenerationPanel,
  QuizInfoStep,
  QuizQuestionEditor,
} from './quiz-create/sections';
import { SortableQuestionTab } from './quiz-create/ui';
import ImportFromDocument from '../components/ImportFromDocument';
import Portal from '../components/Portal';
import { isUnderRezidentiatRoot } from '../lib/rezidentiatRoot';
import { REZIDENTIAT_TAG } from '../lib/rezidentiatBank';
import type { ParsedQuestion } from '../lib/ai/grileParser';
import TourHelpButton from '../tutorial/TourHelpButton';

let quizCreateAIPromise: Promise<typeof import('../lib/groq')> | null = null;

function loadQuizCreateAI() {
  if (!quizCreateAIPromise) {
    quizCreateAIPromise = import('../lib/groq');
  }
  return quizCreateAIPromise;
}

interface QuizDraft {
  title: string;
  description: string;
  emoji: string;
  color: QuizColor;
  category: string;
  selectedFolderId: string;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  penaltyMode: boolean;
  questions: Question[];
  tags: string[];
}

export default function QuizCreate() {
  const navigate = useNavigate();
  const goBack = useBack('/quizzes');
  const [searchParams] = useSearchParams();
  const targetFolderId = searchParams.get('folder');
  const editId = searchParams.get('edit');
  const { addQuiz, updateQuiz, quizzes } = useQuizStore();
  const folders = useFolderStore((state) => state.folders);
  const theme = useTheme();
  const { t } = useAdaptiveMotion();
  const compact = typeof window !== 'undefined' && (window.innerHeight < 860 || window.innerWidth < 1280);

  // Pre-load existing quiz for edit mode
  const existingQuiz = editId ? quizzes.find((q) => q.id === editId) : null;

  const [step, setStep] = useState<'info' | 'questions'>('info');
  const [title, setTitle] = useState(existingQuiz?.title ?? '');
  const [description, setDescription] = useState(existingQuiz?.description ?? '');
  const [emoji, setEmoji] = useState(existingQuiz?.emoji ?? '📝');
  const [color, setColor] = useState<QuizColor>(existingQuiz?.color ?? 'blue');
  const [category, setCategory] = useState(existingQuiz?.category ?? 'Altele');
  const [selectedFolderId, setSelectedFolderId] = useState(
    existingQuiz?.folderId ?? (targetFolderId && targetFolderId !== 'null' ? targetFolderId : '__uncategorized__'),
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(existingQuiz?.shuffleQuestions ?? false);
  const [shuffleAnswers, setShuffleAnswers] = useState(existingQuiz?.shuffleAnswers ?? false);
  const [penaltyMode, setPenaltyMode] = useState(existingQuiz?.penaltyMode ?? false);
  const [questions, setQuestions] = useState<Question[]>(existingQuiz?.questions ?? [newQuestion()]);
  const [activeQ, setActiveQ] = useState(0);
  const [tags, setTags] = useState<string[]>(existingQuiz?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [previewQ, setPreviewQ] = useState<Question | null>(null);
  const [showImportDoc, setShowImportDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProfileId = useUserStore((state) => state.activeProfileId);
  const isEditing = !!editId;

  // ── Autosave draft (doar pentru grilă nouă) ─────────────────────────────
  const draftKey = `studyx-quiz-draft:${activeProfileId ?? 'default'}`;

  const draft = useMemo<QuizDraft>(() => ({
    title, description, emoji, color, category, selectedFolderId,
    shuffleQuestions, shuffleAnswers, penaltyMode, questions, tags,
  }), [title, description, emoji, color, category, selectedFolderId, shuffleQuestions, shuffleAnswers, penaltyMode, questions, tags]);

  const hasDraftContent = title.trim() !== '' || description.trim() !== '' || questions.some((q) => q.text.trim() !== '');

  // Restaurează draftul la intrarea pe „Grilă nouă" (nu la editare).
  useEffect(() => {
    if (isEditing) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<QuizDraft>;
      if (d.title) setTitle(d.title);
      if (d.description) setDescription(d.description);
      if (d.emoji) setEmoji(d.emoji);
      if (d.color) setColor(d.color);
      if (d.category) setCategory(d.category);
      if (d.selectedFolderId) setSelectedFolderId(d.selectedFolderId);
      if (d.shuffleQuestions !== undefined) setShuffleQuestions(d.shuffleQuestions);
      if (d.shuffleAnswers !== undefined) setShuffleAnswers(d.shuffleAnswers);
      if (d.penaltyMode !== undefined) setPenaltyMode(d.penaltyMode);
      if (d.questions?.length) setQuestions(d.questions);
      if (d.tags) setTags(d.tags);
    } catch { /* draft corupt — ignorăm */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salvare automată (debounced) a draftului.
  useEffect(() => {
    if (isEditing) return;
    const timer = setTimeout(() => {
      try {
        if (hasDraftContent) localStorage.setItem(draftKey, JSON.stringify(draft));
        else localStorage.removeItem(draftKey);
      } catch { /* storage indisponibil — ignorăm */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [isEditing, draftKey, hasDraftContent, draft]);

  // Avertisment la părăsire când există modificări nesalvate.
  useEffect(() => {
    if (isEditing || !hasDraftContent) return;
    const handler = (e: BeforeUnloadEvent) => {
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* ignorăm */ }
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isEditing, hasDraftContent, draftKey, draft]);

  // Absorb questions extracted from a document straight into the wizard.
  const handleImportedQuestions = (imported: ParsedQuestion[]) => {
    const converted: Question[] = imported.map((q) => ({
      id: generateId(),
      text: q.text,
      multipleCorrect: q.multipleCorrect,
      difficulty: 'easy',
      options: q.options.slice(0, OPTION_IDS.length).map((o, i) => ({
        id: OPTION_IDS[i],
        text: o.text,
        isCorrect: o.isCorrect,
      })),
      explanation: '',
    }));
    if (converted.length === 0) return;
    // Drop the initial blank question if the wizard is still empty.
    setQuestions((prev) => {
      const base = prev.length === 1 && !prev[0].text.trim() ? [] : prev;
      return [...base, ...converted];
    });
    setStep('questions');
    setActiveQ((prev) => (questions.length === 1 && !questions[0].text.trim() ? 0 : prev));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Drag pornește doar după ce mouseul s-a mișcat ≥5px.
      // Fără asta, click-urile pe butoane din interior sunt interceptate de DnD.
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = questions.findIndex((q) => q.id === active.id);
      const newIdx = questions.findIndex((q) => q.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      setQuestions((qs) => arrayMove(qs, oldIdx, newIdx));
      setActiveQ(newIdx);
    }
  };

  const currentQ = questions[Math.min(activeQ, questions.length - 1)];

  const updateQuestion = (id: string, updates: Partial<Question>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...updates } : q)));

  const updateOption = (qId: string, optId: string, updates: Partial<Option>) =>
    setQuestions((qs) => qs.map((q) => q.id !== qId ? q : { ...q, options: q.options.map((o) => (o.id === optId ? { ...o, ...updates } : o)) }));

  const toggleCorrect = (qId: string, optId: string) => {
    const q = questions.find((q) => q.id === qId);
    if (!q) return;
    if (q.multipleCorrect) {
      updateOption(qId, optId, { isCorrect: !q.options.find((o) => o.id === optId)?.isCorrect });
    } else {
      setQuestions((qs) => qs.map((q) => q.id !== qId ? q : { ...q, options: q.options.map((o) => ({ ...o, isCorrect: o.id === optId })) }));
    }
  };

  const addQuestion = () => {
    const q = newQuestion();
    setQuestions((qs) => [...qs, q]);
    setActiveQ((prev) => Math.max(prev + 1, questions.length));
  };

  const removeQuestion = (idx: number) => {
    if (questions.length === 1) return;
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
    setActiveQ(Math.max(0, idx - 1));
  };

  const uploadTargetQId = useRef<string | null>(null);

  const handleImageUpload = async (qId: string) => {
    // Try Electron native dialog first
    if (window.electronAPI?.openImageFile) {
      const dataUrl = await window.electronAPI.openImageFile();
      if (dataUrl) {
        const compressed = await compressImage(dataUrl);
        updateQuestion(qId, { imageUrl: compressed });
      }
      return;
    }
    // Fallback: browser file input
    const input = fileInputRef.current;
    if (!input) return;
    
    uploadTargetQId.current = qId;
    input.value = '';
    input.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const qId = uploadTargetQId.current;
    if (!qId) return;
    const file = e.target.files?.[0];
    if (!file) {
      uploadTargetQId.current = null;
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const result = ev.target?.result as string;
      if (result) {
        const compressed = await compressImage(result);
        updateQuestion(qId, { imageUrl: compressed });
      }
    };
    reader.onerror = () => {
      console.error("[QuizCreate] Nu s-a putut citi imaginea", reader.error);
      setAiError("Nu s-a putut citi imaginea selectată. Încearcă alt fișier.");
    };
    reader.readAsDataURL(file);
    uploadTargetQId.current = null;
  };

  const [shakeFields, setShakeFields] = useState<string[]>([]);
  const triggerShake = (fields: string[]) => {
    setShakeFields(fields);
    setTimeout(() => setShakeFields([]), 600);
  };

  // AI generation
  const { hasKey } = useAIStore();
  const [aiText, setAiText] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiDifficulty, setAiDifficulty] = useState(3);
  const [aiMode, setAiMode] = useState<'standard' | 'clinical'>('standard');
  const [aiQuestionTypes, setAiQuestionTypes] = useState<QuestionType[]>([...ALL_QUESTION_TYPES]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiProgress, setAiProgress] = useState<{ generated: number; total: number } | null>(null);
  const [questionsTab, setQuestionsTab] = useState<'manual' | 'ai'>('manual');

  const handleAIGenerate = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiProgress({ generated: 0, total: aiCount });
    try {
      const { generateQuestionsFromText, generateClinicalCase } = await loadQuizCreateAI();
      const existingTexts = quizzes.flatMap((quiz) => quiz.questions.map((question) => question.text));
      const generated = aiMode === 'clinical'
        ? await generateClinicalCase(aiText, aiCount)
        : await generateQuestionsFromText(
            aiText,
            aiCount,
            aiDifficulty,
            existingTexts,
            (g, t) => setAiProgress({ generated: g, total: t }),
            aiQuestionTypes.length > 0 ? aiQuestionTypes : undefined,
          );
      const newQs: Question[] = generated.map((g) => ({
        id: generateId(),
        text: g.text,
        multipleCorrect: false,
        difficulty: 'easy' as Difficulty,
        explanation: g.explanation ?? '',
        ...(g.type ? { type: g.type } : {}),
        options: g.options.map((o, i) => ({
          id: OPTION_IDS[i] ?? generateId(),
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      }));
      const nextActiveIndex = questions.length === 1 && !questions[0].text.trim() ? 0 : questions.length;
      setQuestions((qs) => {
        // Remove empty placeholder if it's the only question
        const filtered = qs.length === 1 && !qs[0].text.trim() ? [] : qs;
        return [...filtered, ...newQs];
      });
      setActiveQ(nextActiveIndex);
      setQuestionsTab('manual');
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Eroare necunoscută');
    } finally {
      setAiLoading(false);
      setAiProgress(null);
    }
  };

  const canProceed = title.trim() && description.trim();
  const deferredQuestions = useDeferredValue(questions);
  const isQValid = (q: Question) =>
    q.text.trim() &&
    q.options.every((o) => o.text.trim()) &&
    q.options.some((o) => o.isCorrect);
  const questionValidity = useMemo(() => deferredQuestions.map((q) => !!isQValid(q)), [deferredQuestions]);
  const canSave = questionValidity.every(Boolean);

  const handleSave = () => {
    if (!canSave || !canProceed) return;
    // Dacă există text nefinalizat în tagInput, îl adăugăm automat la salvare
    const pendingTag = tagInput.trim().toLowerCase();
    const finalTags = pendingTag && !tags.includes(pendingTag)
      ? [...tags, pendingTag]
      : tags;
    // A test saved into the Rezidențiat tree belongs to that section like the imported ones
    // (kept out of "Toate grilele"); without the tag it showed up in both places.
    const tagsForFolder = (list: string[]) => (
      selectedFolderId !== '__uncategorized__' && isUnderRezidentiatRoot(selectedFolderId, useFolderStore.getState().folders)
        ? [...new Set([...list, REZIDENTIAT_TAG])]
        : list
    );
    if (editId && existingQuiz) {
      updateQuiz(editId, {
        title: title.trim(),
        description: description.trim(),
        emoji, color, category,
        folderId: selectedFolderId === '__uncategorized__' ? null : selectedFolderId,
        shuffleQuestions, shuffleAnswers, penaltyMode,
        tags: tagsForFolder(finalTags),
        questions,
      });
      navigate(`/quiz/${editId}`, { replace: true });
    } else {
      addQuiz({
        id: generateId(),
        title: title.trim(),
        description: description.trim(),
        emoji, color, category,
        kind: 'quiz',
        folderId: selectedFolderId === '__uncategorized__' ? null : selectedFolderId,
        shuffleQuestions, shuffleAnswers, penaltyMode,
        tags: tagsForFolder(finalTags),
        questions,
        createdAt: Date.now(),
      });
      localStorage.removeItem(draftKey);
      navigate(selectedFolderId !== '__uncategorized__' ? `/folder/${selectedFolderId}` : '/quizzes', { replace: true });
    }
  };

  return (
    <div className={`h-full overflow-y-auto ${compact ? 'px-4 sm:px-6 py-5 sm:py-6' : 'px-8 py-8'}`}>
      {/* Hidden file input for browser fallback */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <div className={`${compact ? 'max-w-[980px]' : 'max-w-[1080px]'} mx-auto`}>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-3 ${compact ? 'mb-6' : 'mb-8'} rounded-[var(--r-xl)] px-1`}>
          <button onClick={() => step === 'questions' ? setStep('info') : goBack()}
            aria-label={step === 'questions' ? 'Înapoi la informații generale' : 'Înapoi'}
            className="p-2 rounded-xl transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
            style={{ background: theme.surface, color: theme.text2 }}>
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight" style={{ color: theme.text }}>
              {editId ? 'Editează grila' : 'Grilă nouă'}
              <TourHelpButton tour="create" label="Vezi turul creării unei grile" />
            </h1>
            <p className="text-sm" style={{ color: theme.text3 }}>
              {step === 'info' ? 'Pas 1: Informații generale' : `Pas 2: Întrebări (${questions.length})`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setShowImportDoc(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
              style={{ background: theme.surface, color: theme.text2, border: `1px solid ${theme.border2}` }}
            >
              <FileText size={13} /> Import din document
            </button>
            <div className="flex gap-1">
              {[0, 1].map((i) => (
                <div key={i} className="w-8 h-1 rounded-full transition-[background-color,border-color,color,opacity,transform]"
                  style={{ background: (step === 'info' && i === 0) || (step === 'questions' && i <= 1) ? theme.accent : theme.surface2 }} />
              ))}
            </div>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {step === 'info' ? (
            <QuizInfoStep
              canProceed={!!canProceed}
              category={category}
              color={color}
              description={description}
              emoji={emoji}
              folders={withoutFlashcardFolders(folders)}
              penaltyMode={penaltyMode}
              selectedFolderId={selectedFolderId}
              shakeFields={shakeFields}
              shuffleAnswers={shuffleAnswers}
              shuffleQuestions={shuffleQuestions}
              tagInput={tagInput}
              tags={tags}
              theme={theme}
              title={title}
              onAddTag={() => {
                const nextTag = tagInput.trim().toLowerCase();
                if (!nextTag || tags.includes(nextTag)) return;
                setTags((current) => [...current, nextTag]);
                setTagInput('');
              }}
              onCategoryChange={setCategory}
              onColorChange={setColor}
              onContinue={() => {
                if (!canProceed) {
                  const empty = [];
                  if (!title.trim()) empty.push('title');
                  if (!description.trim()) empty.push('desc');
                  triggerShake(empty);
                  return;
                }
                setStep('questions');
              }}
              onDescriptionChange={setDescription}
              onEmojiChange={setEmoji}
              onFolderChange={setSelectedFolderId}
              onPenaltyModeToggle={() => setPenaltyMode((current) => !current)}
              onRemoveTag={(tag) => setTags((current) => current.filter((item) => item !== tag))}
              onShuffleAnswersToggle={() => setShuffleAnswers((current) => !current)}
              onShuffleQuestionsToggle={() => setShuffleQuestions((current) => !current)}
              onTagInputChange={setTagInput}
              onTitleChange={setTitle}
            />
          ) : (
            <motion.div key="questions"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }} transition={t.page}>

              {/* Tab switcher: Manual / AI */}
              <div className="flex gap-1 mb-5 p-1.5 rounded-2xl glass-panel">
                {[
                  { id: 'manual' as const, label: 'Manual', icon: <Pencil size={13} /> },
                  { id: 'ai' as const, label: 'Generează cu AI', icon: <Bot size={13} /> },
                ].map((tab) => (
                  <button key={tab.id} onClick={() => setQuestionsTab(tab.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-[background-color,border-color,color,opacity,transform]"
                    style={{
                      background: questionsTab === tab.id ? theme.surface : 'transparent',
                      color: questionsTab === tab.id ? theme.text : theme.text3,
                      boxShadow: questionsTab === tab.id ? 'var(--elev-1)' : 'none',
                    }}>
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>

              <QuizAIGenerationPanel
                aiCount={aiCount}
                aiDifficulty={aiDifficulty}
                aiError={aiError}
                aiLoading={aiLoading}
                aiMode={aiMode}
                aiQuestionTypes={aiQuestionTypes}
                aiProgress={aiProgress}
                aiText={aiText}
                hasKey={hasKey}
                theme={theme}
                visible={questionsTab === 'ai'}
                onCountChange={setAiCount}
                onDifficultyChange={setAiDifficulty}
                onQuestionTypesChange={setAiQuestionTypes}
                onGenerate={handleAIGenerate}
                onImportPdf={async () => {
                  const text = await window.electronAPI?.openPdfFile?.();
                  if (text) {
                    setAiText(text);
                    return;
                  }
                  setAiError('Nu s-a putut extrage textul din PDF. Încearcă să îl lipești manual.');
                }}
                onModeChange={(mode) => {
                  setAiMode(mode);
                  // Cazurile clinice funcționează mai bine cu numere mai mici
                  if (mode === 'clinical' && aiCount > 15) setAiCount(5);
                  if (mode === 'standard' && aiCount < 10) setAiCount(10);
                }}
                onTextChange={setAiText}
              />

              {/* Question tabs - drag to reorder */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={questions.map(q => q.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex gap-2 mb-5 overflow-x-auto pb-2 pr-1">
                    {questions.map((q, i) => (
                      <SortableQuestionTab key={q.id} id={q.id} index={i}
                        isActive={activeQ === i} isValid={questionValidity[i] ?? false}
                        onClick={() => setActiveQ(i)} theme={theme} />
                    ))}
                    <button onClick={addQuestion} aria-label="Adaugă întrebare"
                      className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
                      style={{ background: theme.surface, color: theme.text3 }}>
                      <Plus size={15} />
                    </button>
                  </div>
                </SortableContext>
              </DndContext>

              <QuizQuestionEditor
                activeQ={activeQ}
                canRemoveQuestion={questions.length > 1}
                currentQ={currentQ}
                theme={theme}
                onAddOption={() => {
                  const nextId = OPTION_IDS[currentQ.options.length];
                  setQuestions((current) => current.map((question) => (
                    question.id !== currentQ.id
                      ? question
                      : { ...question, options: [...question.options, { id: nextId, text: '', isCorrect: false }] }
                  )));
                }}
                onExplanationChange={(value) => updateQuestion(currentQ.id, { explanation: value })}
                onImageUpload={() => handleImageUpload(currentQ.id)}
                onOptionRemove={(optionId) => {
                  setQuestions((current) => current.map((question) => (
                    question.id !== currentQ.id
                      ? question
                      : { ...question, options: question.options.filter((option) => option.id !== optionId) }
                  )));
                }}
                onOptionTextChange={(optionId, value) => updateOption(currentQ.id, optionId, { text: value })}
                onPreview={() => setPreviewQ(currentQ)}
                onQuestionRemove={() => removeQuestion(activeQ)}
                onQuestionTextChange={(value) => updateQuestion(currentQ.id, { text: value })}
                onRemoveImage={() => updateQuestion(currentQ.id, { imageUrl: undefined })}
                onSetDifficulty={(difficulty) => updateQuestion(currentQ.id, { difficulty })}
                onToggleCorrect={(optionId) => toggleCorrect(currentQ.id, optionId)}
                onToggleMultiple={() => {
                  const isMulti = !currentQ.multipleCorrect;
                  updateQuestion(currentQ.id, {
                    multipleCorrect: isMulti,
                    options: currentQ.options.map((option) => ({ ...option, isCorrect: false })),
                  });
                }}
              />

              <div className="mt-5 flex gap-3">
                <button onClick={addQuestion}
                  className="flex-1 py-3.5 rounded-2xl font-medium text-sm transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
                  style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text2 }}>
                  <Plus size={15} className="inline mr-1" />Întrebare nouă
                </button>
                <button onClick={handleSave} disabled={!canSave}
                  className="flex-1 py-3.5 rounded-2xl font-semibold text-white transition-[background-color,border-color,color,opacity,transform] hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-1.5"
                  style={{ background: `linear-gradient(135deg, ${theme.success} 0%, #34C759 100%)` }}>
                  {editId ? <><Pencil size={15} />Salvează modificările</> : <><Check size={15} />Salvează grila</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <QuestionPreviewModal previewQ={previewQ} theme={theme} onClose={() => setPreviewQ(null)} />

      {showImportDoc && (
        <Portal>
          <div className="fixed inset-0 z-50" style={{ background: 'var(--overlay)', backdropFilter: 'blur(6px)' }} onClick={() => setShowImportDoc(false)} />
          <div className="fixed top-[6%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4">
            <div className="rounded-[var(--r-lg)] p-6 max-h-[86vh] overflow-y-auto"
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, boxShadow: 'var(--elev-4)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold" style={{ color: theme.text }}>Import grile din document</span>
                <button onClick={() => setShowImportDoc(false)} aria-label="Închide" style={{ color: theme.text3 }}><X size={16} /></button>
              </div>
              <ImportFromDocument
                onDone={() => setShowImportDoc(false)}
                onImportQuestions={handleImportedQuestions}
              />
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
