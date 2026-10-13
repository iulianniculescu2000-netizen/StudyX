/**
 * "Import grile din document" flow: upload PDF/Word/text files, extract the
 * questions with the template engine, review + fix the uncertain ones, then
 * save as a new quiz or append to an existing one.
 */
import { plural } from '../lib/plural';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Loader2, Check, AlertTriangle, X, Sparkles, Camera, Lightbulb, CheckSquare, Square } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import { withoutFlashcardFolders } from '../lib/folderScope';
import { useAIStore } from '../store/aiStore';
import { useToastStore } from '../store/toastStore';
import { extractGrileFromFiles, toQuizImportData, toQuizImportDataBySpecialty, type GrileExtractionResult } from '../lib/ai/grileImport';
import { inferAnswersWithAI } from '../lib/ai/grileAIFallback';
import type { ParsedQuestion } from '../lib/ai/grileParser';
import { parseImportedQuiz } from '../lib/quizImport';
import { isFlashcardDeck } from '../lib/deckKind';
import ThemedSelect from './ThemedSelect';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';

const FOLDER_NONE = '__none__';
const FOLDER_NEW = '__new__';

interface Props {
  targetFolderId?: string | null;
  onDone: () => void;
  /** Wizard mode: hand the reviewed questions back instead of saving a quiz. */
  onImportQuestions?: (questions: ParsedQuestion[]) => void;
}

type Phase = 'pick' | 'extracting' | 'review';

export default function ImportFromDocument({ targetFolderId, onDone, onImportQuestions }: Props) {
  const wizardMode = !!onImportQuestions;
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { quizzes, addQuiz, updateQuiz } = useQuizStore();
  const folders = useFolderStore((s) => s.folders);
  const addFolder = useFolderStore((s) => s.addFolder);
  const hasKey = useAIStore((s) => s.hasKey);
  const addToast = useToastStore((s) => s.addToast);

  const [phase, setPhase] = useState<Phase>('pick');
  const [result, setResult] = useState<GrileExtractionResult | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [title, setTitle] = useState('');
  const [dest, setDest] = useState<'new' | string>('new'); // 'new' or an existing quiz id
  const [folderChoice, setFolderChoice] = useState<string>(
    targetFolderId && targetFolderId !== 'null' ? targetFolderId : FOLDER_NONE,
  );
  const [newFolderName, setNewFolderName] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const lastFiles = useRef<File[]>([]);
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; }, []);

  const cancelOperation = () => {
    operation.current += 1;
    setAiRunning(false);
    setNotice('Operația a fost anulată. Rezultatele nu vor fi aplicate; cererile deja pornite pot continua în fundal.');
    if (phase === 'extracting') setPhase('pick');
  };
  const close = () => {
    operation.current += 1;
    onDone();
  };

  const existingQuizzes = useMemo(
    () => quizzes.filter((q) => !q.archived && !isFlashcardDeck(q)),
    [quizzes],
  );

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    // Snapshot NOW — the caller resets the <input>, which empties this live
    // FileList; reading it after the await below would blow up.
    const files = Array.from(fileList);
    const id = ++operation.current;
    lastFiles.current = files;
    setErrorMessage('');
    setNotice('');
    setProgress('');
    setPhase('extracting');
    try {
      const res = await extractGrileFromFiles(files, (message) => {
        if (id === operation.current) setProgress(message);
      });
      if (id !== operation.current) return;
      setResult(res);
      setQuestions(res.questions);
      setTitle(files[0].name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Grile importate');
      setPhase('review');
    } catch (error) {
      if (id !== operation.current) return;
      setErrorMessage(`Nu am putut procesa fișierele: ${friendlyAIError(error)}`);
      addToast(
        `Nu am putut procesa fișierele: ${friendlyAIError(error)}`,
        'error',
        5000,
      );
      setPhase('pick');
    }
  };

  const toggleCorrect = (qIdx: number, optIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const options = q.options.map((o, j) => {
          if (q.multipleCorrect) return j === optIdx ? { ...o, isCorrect: !o.isCorrect } : o;
          return { ...o, isCorrect: j === optIdx };
        });
        return { ...q, options };
      }),
    );
  };

  // Lets the user flip a question between single-answer (CS) and multi-answer
  // (CM) — without this, noticing "actually this one has 2 correct answers"
  // had no way to act on it: toggleCorrect always collapsed back to one
  // selection while multipleCorrect stayed false, so a second checkbox click
  // just moved the checkmark instead of adding to it.
  const toggleMultipleCorrect = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const nextMultiple = !q.multipleCorrect;
        // Switching single→multiple: keep the current pick(s) as-is.
        // Switching multiple→single: keep only the first correct option, so the
        // result is never left with 2+ correct answers under a "single" label.
        if (nextMultiple) return { ...q, multipleCorrect: true };
        const firstCorrect = q.options.findIndex((o) => o.isCorrect);
        return {
          ...q,
          multipleCorrect: false,
          options: q.options.map((o, j) => ({ ...o, isCorrect: j === firstCorrect })),
        };
      }),
    );
  };

  const importable = questions.filter((q) => q.options.some((o) => o.isCorrect));
  const unanswered = questions.filter((q) => q.answerSource === 'none' && q.options.length >= 2 && !q.options.some((o) => o.isCorrect)).length;

  const runAIFallback = async () => {
    if (aiRunning) return;
    const id = ++operation.current;
    setErrorMessage('');
    setNotice('');
    setProgress('AI verifică răspunsurile lipsă…');
    setAiRunning(true);
    try {
      const targets = questions.filter((q) => q.answerSource === 'none' && q.options.length >= 2 && !q.options.some((o) => o.isCorrect));
      const answers = await inferAnswersWithAI(targets, (done, total) => {
        if (id === operation.current) setProgress(`AI a procesat ${done} din ${total} întrebări.`);
      });
      if (id !== operation.current) return;
      const replacements = new Map(targets.map((q, i) => [q, answers[i]]));
      const filled = questions.map((q) => replacements.get(q) ?? q);
      setQuestions(filled);
      const added = filled.filter((q, i) => q.answerSource === 'ai' && questions[i].answerSource === 'none').length;
      const message = added > 0
        ? `AI a propus ${added} răspunsuri. Verifică-le înainte de import; unele răspunsuri pot lipsi în continuare.`
        : 'AI nu a completat niciun răspuns. Marchează manual răspunsurile corecte sau încearcă din nou.';
      setNotice(message);
      addToast(message, added > 0 ? 'success' : 'warning', 5000);
    } catch (error) {
      if (id !== operation.current) return;
      setErrorMessage(`AI n-a putut completa: ${friendlyAIError(error)}`);
      addToast(`AI n-a putut completa: ${friendlyAIError(error)}`, 'error', 5000);
    } finally {
      if (id === operation.current) setAiRunning(false);
    }
  };

  // Resolve the folder a brand-new quiz should live in.
  const resolveFolderId = (): string | null => {
    if (folderChoice === FOLDER_NONE) return null;
    if (folderChoice === FOLDER_NEW) {
      const name = newFolderName.trim();
      if (!name) return null;
      return addFolder(name, '📁', 'blue', null);
    }
    return folderChoice;
  };

  const doImport = () => {
    if (aiRunning) return;
    if (importable.length === 0) {
      addToast('Nicio întrebare cu răspuns marcat de importat.', 'warning', 4000);
      return;
    }

    // Wizard mode: hand the questions back to the create flow instead of saving.
    if (onImportQuestions) {
      onImportQuestions(importable);
      addToast(`${plural(importable.length, 'întrebare adăugată', 'întrebări adăugate')} în wizard.`, 'success', 4000);
      onDone();
      return;
    }

    if (dest === 'new') {
      // Split by detected specialty (e.g. "CARDIOLOGIE") when the bank organizes
      // itself that way — resolveFolderId() runs once so a "new folder" choice
      // isn't created again for every group.
      const groups = toQuizImportDataBySpecialty(title.trim() || 'Grile importate', importable);
      const folderId = resolveFolderId();
      const createdTitles = groups.map((groupData) => {
        const quiz = parseImportedQuiz(groupData, folderId);
        addQuiz(quiz);
        return quiz.title;
      });
      addToast(
        groups.length > 1
          ? `${plural(importable.length, 'grilă importată', 'grile importate')} în ${plural(groups.length, 'set', 'seturi')}, pe specialități.`
          : `${plural(importable.length, 'grilă importată', 'grile importate')} în „${createdTitles[0]}".`,
        'success', 4000,
      );
    } else {
      const data = toQuizImportData(title.trim() || 'Grile importate', importable);
      const target = quizzes.find((q) => q.id === dest);
      if (!target) {
        addToast('Grila țintă nu mai există.', 'error', 4000);
        return;
      }
      // Reuse the importer to mint proper question IDs, then append.
      const minted = parseImportedQuiz(data, target.folderId);
      updateQuiz(target.id, { questions: [...target.questions, ...minted.questions] });
      addToast(`${plural(importable.length, 'grilă adăugată', 'grile adăugate')} în „${target.title}".`, 'success', 4000);
    }
    onDone();
  };

  // ---- render ----

  if (phase === 'pick') {
    return (
      <div className="space-y-3">
        {errorMessage && <p role="alert" className="text-sm break-words" style={{ color: theme.danger }}>{errorMessage}</p>}
        {notice && <p role="status" className="text-sm" style={{ color: theme.text2 }}>{notice}</p>}
        {errorMessage && <button onClick={() => handleFiles(lastFiles.current)} className="text-sm underline" style={{ color: theme.accentText }}>Reîncearcă aceleași fișiere</button>}
        <p className="text-xs" style={{ color: theme.text3 }}>
          Încarcă fișiere cu grile — PDF, Word, text sau chiar o <b>poză</b>. Recunosc întrebările,
          variantele și răspunsul corect din bold/culoare/cheie{hasKey ? ', iar pozele le citește AI-ul' : ''},
          apoi le poți verifica înainte de salvare.
        </p>
        <input
          ref={inputRef}
          aria-label="Alege documente sau imagini cu grile"
          type="file"
          accept=".pdf,.docx,.txt,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          aria-label="Fotografiază grilele"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <motion.button
          onClick={() => cameraRef.current?.click()}
          whileTap={calmMotion ? undefined : { scale: 0.97 }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[var(--r-md)] text-sm font-bold text-white"
          style={{ background: theme.accent }}
        >
          <Camera size={17} /> Fă o poză grilelor
        </motion.button>
        <motion.button
          onClick={() => inputRef.current?.click()}
          whileTap={calmMotion ? undefined : { scale: 0.97 }}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-[var(--r-md)] text-sm font-semibold"
          style={{
            border: `2px dashed ${theme.border2}`,
            color: theme.text2,
            background: theme.surface2,
          }}
        >
          <Upload size={20} style={{ color: theme.accentText }} />
          …sau alege fișiere (PDF / Word / text / poză)
          <span className="text-[11px] font-normal" style={{ color: theme.text3 }}>
            Poți selecta mai multe deodată
          </span>
        </motion.button>
        {!hasKey && (
          <p className="text-[11px]" style={{ color: theme.text3 }}>
            <Lightbulb size={12} className="inline-block align-text-bottom mr-1" />Pentru poze și completarea răspunsurilor cu AI, adaugă o cheie în Setări AI.
          </p>
        )}
      </div>
    );
  }

  if (phase === 'extracting') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 size={26} className="animate-spin" style={{ color: theme.accentText }} />
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-center break-words max-w-full" style={{ color: theme.text2 }}>
          {progress || 'Extrag grilele și elimin duplicatele…'}
        </p>
        <p className="text-[11px]" style={{ color: theme.text3 }}>
          Pozele și scanurile citite cu AI pot dura mai mult.
        </p>
        <button onClick={cancelOperation} className="text-sm underline" style={{ color: theme.text2 }}>Anulează procesarea</button>
        <p className="text-xs text-center" style={{ color: theme.text3 }}>Rezultatele vor fi ignorate; cererile deja pornite pot continua în fundal.</p>
      </div>
    );
  }

  // review
  const stats = { total: questions.length, withAnswer: importable.length, needsReview: questions.filter((q) => !q.options.some((o) => o.isCorrect) || q.confidence !== 'high').length };
  const dedupe = result?.dedupe;

  return (
    <div className="space-y-4">
      {errorMessage && <p role="alert" className="text-sm break-words" style={{ color: theme.danger }}>{errorMessage}</p>}
      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm break-words" style={{ color: theme.text2 }}>{aiRunning ? progress : notice || `${plural(questions.length, 'întrebare extrasă', 'întrebări extrase')}. ${importable.length} cu răspuns marcat pentru import.`}</p>
      {aiRunning && <button onClick={cancelOperation} className="text-sm underline" style={{ color: theme.text2 }}>Anulează completarea AI</button>}
      {questions.length === 0 && <p className="text-sm" style={{ color: theme.text2 }}>Nu am găsit întrebări. Încearcă un document cu enunțuri și variante clare sau o fotografie mai lizibilă.</p>}
      {questions.length > 0 && importable.length === 0 && <p className="text-sm" style={{ color: theme.text2 }}>Marchează cel puțin un răspuns corect pentru a putea importa. Întrebările fără răspuns marcat nu se importă.</p>}
      <button disabled={aiRunning} onClick={() => { setPhase('pick'); setErrorMessage(''); setNotice(''); }} className="text-sm underline" style={{ color: theme.accentText }}>Alege alte fișiere</button>
      {questions.length === 0 && <button onClick={() => handleFiles(lastFiles.current)} className="text-sm underline" style={{ color: theme.accentText }}>Reîncearcă aceleași fișiere</button>}
      {/* summary */}
      <div className="rounded-[var(--r-sm)] p-3 text-xs" style={{ background: theme.surface2, color: theme.text2 }}>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span><b style={{ color: theme.text }}>{stats?.total ?? 0}</b> grile unice</span>
          <span><b style={{ color: theme.success }}>{stats?.withAnswer ?? 0}</b> cu răspuns</span>
          <span><b style={{ color: theme.warning }}>{stats?.needsReview ?? 0}</b> de verificat</span>
          {dedupe && dedupe.duplicatesRemoved > 0 && (
            <span><b style={{ color: theme.text }}>{dedupe.duplicatesRemoved}</b> duplicate eliminate</span>
          )}
        </div>
        {result && result.perFile.some((f) => f.error) && (
          <p role="alert" className="mt-1 break-words" style={{ color: theme.danger }}>
            {result.perFile.filter((f) => f.error).map((f) => `${f.name}: ${f.error}`).join(' · ')}
          </p>
        )}
      </div>

      {/* AI fallback for unanswered questions */}
      {hasKey && unanswered > 0 && (
        <motion.button
          onClick={runAIFallback}
          disabled={aiRunning}
          whileTap={calmMotion || aiRunning ? undefined : { scale: 0.97 }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--r-sm)] text-xs font-semibold"
          style={{ background: `${theme.accent}18`, color: theme.accentText, border: `1px solid ${theme.accent}40` }}
        >
          {aiRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {aiRunning ? 'AI completează…' : `Completează cu AI ${unanswered} răspunsuri lipsă`}
        </motion.button>
      )}

      {/* destination */}
      {!wizardMode && (
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => setDest('new')}
            aria-pressed={dest === 'new'}
            className="flex-1 py-2 rounded-[var(--r-sm)] text-xs font-semibold"
            style={{ background: dest === 'new' ? theme.accent : theme.surface2, color: dest === 'new' ? '#fff' : theme.text3 }}
          >
            Grilă nouă
          </button>
          <button
            onClick={() => setDest(existingQuizzes[0]?.id ?? 'new')}
            aria-pressed={dest !== 'new'}
            disabled={existingQuizzes.length === 0}
            className="flex-1 py-2 rounded-[var(--r-sm)] text-xs font-semibold"
            style={{ background: dest !== 'new' ? theme.accent : theme.surface2, color: dest !== 'new' ? '#fff' : theme.text3, opacity: existingQuizzes.length === 0 ? 0.5 : 1 }}
          >
            Adaugă în existentă
          </button>
        </div>
        {dest === 'new' ? (
          <div className="space-y-2">
            <input
              value={title}
              aria-label="Numele grilei noi"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Numele grilei noi"
              className="w-full text-sm px-3 py-2 rounded-[var(--r-sm)]"
              style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text, outline: 'none' }}
            />
            <div className="flex gap-2">
              <fieldset className="flex-1 min-w-0">
                <legend className="text-xs" style={{ color: theme.text2 }}>Folder de destinație</legend>
                <ThemedSelect
                  value={folderChoice}
                  onChange={setFolderChoice}
                  options={[
                    { value: FOLDER_NONE, label: 'Fără folder' },
                    ...withoutFlashcardFolders(folders).map((f) => ({ value: f.id, label: `${f.emoji} ${f.name}` })),
                    { value: FOLDER_NEW, label: 'Folder nou…' },
                  ]}
                />
              </fieldset>
              {folderChoice === FOLDER_NEW && (
                <input
                  value={newFolderName}
                  aria-label="Nume folder nou"
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nume folder"
                  autoFocus
                  className="flex-1 text-sm px-3 py-2 rounded-[var(--r-sm)]"
                  style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text, outline: 'none' }}
                />
              )}
            </div>
          </div>
        ) : (
          <fieldset>
          <legend className="text-xs" style={{ color: theme.text2 }}>Grila de destinație</legend>
          <ThemedSelect
            value={dest}
            onChange={setDest}
            placeholder="Alege grila"
            options={existingQuizzes.map((q) => ({ value: q.id, label: `${q.title} (${q.questions.length})` }))}
          />
          </fieldset>
        )}
      </div>
      )}

      {/* question preview (editable correctness) */}
      <div className="max-h-[38vh] overflow-y-auto space-y-2 pr-1">
        {questions.map((q, qi) => {
          const answered = q.options.some((o) => o.isCorrect);
          // "Sure" only when answered AND the answer came from formatting/key (high confidence).
          const sure = answered && q.confidence === 'high';
          return (
            <div key={qi} className="rounded-[var(--r-sm)] p-2.5" style={{ background: theme.surface2, border: `1px solid ${sure ? 'transparent' : `${theme.warning}55`}` }}>
              <div className="flex items-start gap-1.5">
                {sure ? (
                  <Check size={13} style={{ color: theme.success, marginTop: 2, flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={13} style={{ color: theme.warning, marginTop: 2, flexShrink: 0 }} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: theme.text }}>
                    {qi + 1}. {q.text}
                    {q.answerSource === 'ai' && (
                      <span className="ml-1 text-[9px] font-bold" style={{ color: theme.accentText }}>AI</span>
                    )}
                  </p>
                  {q.imageUrl && (
                    <img
                      src={q.imageUrl}
                      alt="Poză atașată — verifică dacă se potrivește cu enunțul"
                      className="mt-1.5 max-h-28 rounded-[var(--r-sm)] object-contain"
                      style={{ border: `1px solid ${theme.border}` }}
                    />
                  )}
                </div>
              </div>
              <button
                onClick={() => toggleMultipleCorrect(qi)}
                disabled={aiRunning}
                aria-pressed={q.multipleCorrect}
                aria-label={`Întrebarea ${qi + 1}: mai multe răspunsuri corecte`}
                className="ml-5 mt-1 rounded-[var(--r-sm)] px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: q.multipleCorrect ? `${theme.accent}22` : theme.surface, color: q.multipleCorrect ? theme.accentText : theme.text3 }}
                title="Apasă dacă are de fapt mai multe răspunsuri corecte"
              >
                {q.multipleCorrect
                  ? <><CheckSquare size={12} className="mr-1 inline-block align-text-bottom" />Complement multiplu (CM)</>
                  : <><Square size={12} className="mr-1 inline-block align-text-bottom" />Un singur răspuns (CS) — apasă dacă e multiplu</>}
              </button>
              <div className="mt-1.5 space-y-1 pl-5">
                {q.options.map((o, oi) => (
                  <button
                    key={oi}
                    onClick={() => toggleCorrect(qi, oi)}
                    disabled={aiRunning}
                    aria-pressed={o.isCorrect}
                    aria-label={`Întrebarea ${qi + 1}, varianta ${String.fromCharCode(97 + oi)}: ${o.text}`}
                    className="flex items-center gap-1.5 w-full text-left text-[11.5px] px-2 py-1 rounded-[var(--r-sm)]"
                    style={{
                      background: o.isCorrect ? `${theme.success}22` : 'transparent',
                      color: o.isCorrect ? theme.text : theme.text2,
                    }}
                  >
                    <span
                      className="flex items-center justify-center rounded"
                      style={{ width: 14, height: 14, flexShrink: 0, border: `1.5px solid ${o.isCorrect ? theme.success : theme.border2}`, background: o.isCorrect ? theme.success : 'transparent' }}
                    >
                      {o.isCorrect && <Check size={10} color="#fff" />}
                    </span>
                    {String.fromCharCode(97 + oi)}. {o.text}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* actions */}
      <div className="flex gap-2">
        <button
          onClick={close}
          className="px-4 py-2.5 rounded-[var(--r-sm)] text-sm font-semibold flex items-center gap-1.5"
          style={{ background: theme.surface2, color: theme.text3 }}
        >
          <X size={14} /> Renunță
        </button>
        <motion.button
          onClick={doImport}
          disabled={aiRunning || importable.length === 0}
          whileTap={calmMotion ? undefined : { scale: 0.97 }}
          className="flex-1 py-2.5 rounded-[var(--r-sm)] text-sm font-semibold text-white flex items-center justify-center gap-2"
          style={{ background: theme.accent }}
        >
          <FileText size={14} />
          {wizardMode ? `Adaugă ${importable.length} în wizard` : `Importă ${plural(importable.length, 'grilă', 'grile')}`}
        </motion.button>
      </div>
    </div>
  );
}
