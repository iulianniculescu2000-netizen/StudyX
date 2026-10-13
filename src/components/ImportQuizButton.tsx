import { useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Check, AlertCircle, Loader2, Sparkles, Copy, FileJson, FileText, ClipboardPaste } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useQuizStore } from '../store/quizStore';
import { buildExternalAIPrompt, importQuizzesFromJsonText } from '../lib/quizImport';
import Portal from './Portal';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import ImportFromDocument from './ImportFromDocument';

type Tab = 'document' | 'file' | 'external-ai';

interface Props {
  targetFolderId?: string | null;
  /** Controlat din afară (ex. dialogul din Rezidențiat, care alege întâi folderul): fereastra e deschisă cât timp e `true`. */
  open?: boolean;
  onClose?: () => void;
  /** Fără butonul „Import grile”: se vede doar fereastra. */
  hideTrigger?: boolean;
}

export default function ImportQuizButton({ targetFolderId, open, onClose, hideTrigger = false }: Props) {
  const theme = useTheme();
  const { addQuiz } = useQuizStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [innerOpen, setInnerOpen] = useState(false);
  const modalOpen = open ?? innerOpen;
  const setModalOpen = (next: boolean) => {
    if (open === undefined) setInnerOpen(next);
    else if (!next) onClose?.();
  };
  const [tab, setTab] = useState<Tab>('document');
  const { calmMotion, t } = useAdaptiveMotion();
  const titleId = useId();

  // External-AI tab state
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(15);
  const [promptCopied, setPromptCopied] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiError, setAiError] = useState('');

  const showSuccess = (count: number) => {
    setStatus('success');
    setMessage(`${count} gril${count === 1 ? 'ă importată' : 'e importate'}!`);
    setTimeout(() => setStatus('idle'), 3000);
  };

  const showError = (msg: string) => {
    setStatus('error');
    setMessage(msg);
    setTimeout(() => setStatus('idle'), 3000);
  };

  const processContent = (content: string) => importQuizzesFromJsonText(content, targetFolderId, addQuiz);

  const handleFileClick = async () => {
    if (status === 'loading') return;
    if (window.electronAPI?.isElectron) {
      setStatus('loading');
      const files = await window.electronAPI.openJsonFiles();
      if (!files) { setStatus('idle'); return; }
      try {
        let total = 0;
        files.forEach((f) => { total += processContent(f.content); });
        showSuccess(total);
        setModalOpen(false);
      } catch { showError('JSON invalid sau format necunoscut.'); }
    } else {
      inputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const count = processContent(ev.target?.result as string);
        showSuccess(count);
        setModalOpen(false);
      } catch { showError('JSON invalid sau format necunoscut.'); }
    };
    reader.onerror = () => showError('Nu s-a putut citi fișierul. Încearcă din nou.');
    reader.readAsText(file);
    e.target.value = '';
  };

  const copyPrompt = async () => {
    const prompt = buildExternalAIPrompt(topic, questionCount);
    await navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const importAiResponse = () => {
    setAiError('');
    try {
      const count = importQuizzesFromJsonText(aiResponse, targetFolderId, addQuiz);
      showSuccess(count);
      setAiResponse('');
      setModalOpen(false);
    } catch {
      setAiError('Nu am putut citi răspunsul ca grilă. Verifică dacă AI-ul a returnat JSON valid (poți cere din nou "doar JSON, fără alt text").');
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setAiResponse('');
    setAiError('');
  };
  const dialogRef = useFocusTrap(modalOpen, closeModal);
  useScrollLock(modalOpen);

  return (
    <div>
      <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

      {!hideTrigger && <motion.button
        onClick={() => setModalOpen(true)}
        whileTap={calmMotion ? undefined : { scale: 0.97 }}
        className="press-feedback focus-ring flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: 'var(--accent-soft)', color: theme.accentText }}
      >
        <Upload size={15} />
        Import grile
      </motion.button>}

      <AnimatePresence>
        {modalOpen && (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: t.modal }}
              exit={{ opacity: 0, transition: t.modalExit }}
              onClick={closeModal}
              className="fixed inset-0 z-50"
              style={{ background: 'var(--overlay)', backdropFilter: 'blur(var(--blur-1))' }}
            />
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
              exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
              className="fixed top-[6%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4"
            >
              <div
                className="rounded-[var(--r-lg)] p-6 max-h-[86vh] overflow-y-auto"
                style={{
                  background: theme.modalBg,
                  border: `1px solid ${theme.border}`,
                  boxShadow: 'var(--elev-4)',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span id={titleId} className="text-sm font-bold" style={{ color: theme.text }}>Import grile</span>
                  <button onClick={closeModal} aria-label="Închide" className="rounded-[var(--r-sm)] p-1 focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]" style={{ color: theme.text3 }}><X size={16} /></button>
                </div>

                <div className="flex gap-1.5 mb-5 rounded-[var(--r-sm)] p-1" role="tablist" style={{ background: theme.surface2 }}>
                  <button
                    onClick={() => setTab('document')}
                    role="tab"
                    aria-selected={tab === 'document'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[var(--r-sm)] text-xs font-semibold transition-colors"
                    style={{
                      background: tab === 'document' ? theme.surface : 'transparent',
                      color: tab === 'document' ? theme.text : theme.text3,
                    }}
                  >
                    <FileText size={13} /> Din document
                  </button>
                  <button
                    onClick={() => setTab('file')}
                    role="tab"
                    aria-selected={tab === 'file'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[var(--r-sm)] text-xs font-semibold transition-colors"
                    style={{
                      background: tab === 'file' ? theme.surface : 'transparent',
                      color: tab === 'file' ? theme.text : theme.text3,
                    }}
                  >
                    <FileJson size={13} /> JSON
                  </button>
                  <button
                    onClick={() => setTab('external-ai')}
                    role="tab"
                    aria-selected={tab === 'external-ai'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[var(--r-sm)] text-xs font-semibold transition-colors"
                    style={{
                      background: tab === 'external-ai' ? theme.surface : 'transparent',
                      color: tab === 'external-ai' ? theme.text : theme.text3,
                    }}
                  >
                    <Sparkles size={13} /> AI extern
                  </button>
                </div>

                {tab === 'document' && (
                  <ImportFromDocument targetFolderId={targetFolderId} onDone={closeModal} />
                )}

                {tab === 'file' && (
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: theme.text3 }}>
                      Importă un fișier .json exportat din StudyX sau primit de la altcineva.
                    </p>
                    <motion.button
                      onClick={handleFileClick}
                      whileTap={calmMotion || status === 'loading' ? undefined : { scale: 0.97 }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--r-md)] text-sm font-semibold text-white"
                      style={{ background: theme.accent, opacity: status === 'loading' ? 0.7 : 1 }}
                    >
                      {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {status === 'loading' ? 'Se importă...' : 'Alege fișier .json'}
                    </motion.button>
                  </div>
                )}

                {tab === 'external-ai' && (
                  <div className="space-y-4">
                    <p className="text-xs" style={{ color: theme.text3 }}>
                      Fără cheie API, fără cotă. Folosește orice AI gratuit (ChatGPT, Gemini, etc.) din browser: copiezi promptul, lipești răspunsul aici.
                    </p>

                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: theme.text2 }}>
                        1. Subiect sau text de curs (opțional)
                      </label>
                      <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="ex: Angina pectorală stabilă — sau lipește notițele tale"
                        rows={3}
                        className="w-full text-sm px-3 py-2.5 rounded-[var(--r-sm)] resize-none focus:outline-none focus-visible:shadow-[var(--ring-focus)]"
                        style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium" style={{ color: theme.text2 }}>Nr. întrebări:</label>
                      {[10, 15, 25, 50].map((n) => (
                        <button
                          key={n}
                          onClick={() => setQuestionCount(n)}
                          className="px-2.5 py-1 rounded-[var(--r-sm)] text-xs font-semibold transition-colors"
                          style={{
                            background: questionCount === n ? theme.accent : theme.surface2,
                            color: questionCount === n ? '#fff' : theme.text3,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>

                    <motion.button
                      onClick={copyPrompt}
                      whileTap={calmMotion ? undefined : { scale: 0.97 }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--r-md)] text-sm font-semibold"
                      style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                    >
                      {promptCopied ? <Check size={14} style={{ color: theme.success }} /> : <Copy size={14} />}
                      {promptCopied ? 'Copiat! Lipește-l în ChatGPT sau Gemini' : '2. Copiază promptul'}
                    </motion.button>

                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: theme.text2 }}>
                        3. Lipește aici răspunsul AI-ului (JSON)
                      </label>
                      <textarea
                        value={aiResponse}
                        onChange={(e) => { setAiResponse(e.target.value); setAiError(''); }}
                        placeholder="Lipește tot răspunsul, inclusiv dacă are ```json în jur..."
                        rows={6}
                        className="w-full text-sm px-3 py-2.5 rounded-[var(--r-sm)] resize-none font-mono focus:outline-none focus-visible:shadow-[var(--ring-focus)]"
                        style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text, fontSize: '11.5px' }}
                      />
                      {aiError && (
                        <p role="alert" className="mt-1.5 text-xs" style={{ color: theme.danger }}>{aiError}</p>
                      )}
                    </div>

                    <motion.button
                      onClick={importAiResponse}
                      disabled={!aiResponse.trim()}
                      whileTap={calmMotion || !aiResponse.trim() ? undefined : { scale: 0.97 }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--r-md)] text-sm font-semibold text-white"
                      style={{
                        background: aiResponse.trim() ? theme.accent : theme.surface2,
                        color: aiResponse.trim() ? '#fff' : theme.text3,
                      }}
                    >
                      <ClipboardPaste size={14} />
                      Importă grila
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status !== 'idle' && (
          <Portal>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: t.toast }}
              exit={{ opacity: 0, y: 12, transition: t.toastExit }}
              role={status === 'error' ? 'alert' : 'status'}
              className="elev-3 fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-[var(--r-md)] text-sm font-medium"
              style={{
                background: status === 'success' ? `${theme.success}20` : `${theme.danger}20`,
                border: `1px solid ${status === 'success' ? theme.success : theme.danger}40`,
                color: status === 'success' ? theme.success : theme.danger,
              }}
            >
              {status === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
              {message}
              <button onClick={() => setStatus('idle')} aria-label="Închide mesajul"><X size={13} /></button>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </div>
  );
}
