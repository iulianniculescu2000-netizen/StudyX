import Portal from '../Portal';
import AIRichText from '../ai-chat/AIRichText';
import { friendlyAIError } from '../../lib/ai/friendlyError';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Bot, SendHorizonal, Loader2, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import type { Quiz } from '../../types';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

let groqPromise: Promise<typeof import('../../lib/groq')> | null = null;

function loadGroq() {
  if (!groqPromise) {
    groqPromise = import('../../lib/groq');
  }
  return groqPromise;
}

interface Props {
  open: boolean;
  quiz: Quiz;
  onClose: () => void;
}

export default function QuizDetailChatDrawer({ open, quiz, onClose }: Props) {
  const theme = useTheme();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { chatAbortRef.current?.abort(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendChat = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || chatLoading) return;

    setChatInput('');
    const userMsg = { role: 'user' as const, content: text };
    setChatMessages((messages) => [...messages, userMsg]);
    setChatLoading(true);

    const systemPrompt = `Ești un asistent de studiu medical. Ajuti un student să înțeleagă grila "${quiz.title}" (${quiz.category}).

Întrebările din grilă:
${quiz.questions.slice(0, 15).map((question, index) => {
  const correct = question.options.filter((option) => option.isCorrect).map((option) => option.text).join(' / ');
  return `${index + 1}. ${question.text}\n   Corect: ${correct}${question.explanation ? `\n   Explicație: ${question.explanation}` : ''}`;
}).join('\n\n')}

Comportament:
- Răspunde concis și clar în română
- Explică conceptele medicale cu exemple practice când e util
- Dacă ești întrebat despre o întrebare specifică, explică conceptul medical din spatele ei
- Cheia ("Corect") poate proveni dintr-o grilă generată automat, deci poate fi greșită. Verifică medical: dacă răspunsul marcat corect este de fapt greșit, spune-o explicit ("⚠️ grila pare greșită — corect este de fapt «...»") și dă răspunsul corect real, în loc să aperi o cheie eronată.
- Nu vorbi despre structura tehnică a grilei`;

    const history = [...chatMessages, userMsg].map((message) => ({ role: message.role, content: message.content }));
    const messages = [{ role: 'system' as const, content: systemPrompt }, ...history];

    let assistantMsg = '';
    setChatMessages((messages) => [...messages, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const { groqStream } = await loadGroq();
      await groqStream(messages, (chunk) => {
        assistantMsg += chunk;
        setChatMessages((messages) => {
          const updated = [...messages];
          updated[updated.length - 1] = { role: 'assistant', content: assistantMsg };
          return updated;
        });
      }, 0.7, controller.signal);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const errorMessage = error instanceof Error ? error.message : 'Eroare necunoscută.';
      setChatMessages((messages) => {
        const updated = [...messages];
        updated[updated.length - 1] = { role: 'assistant', content: `Eroare: ${friendlyAIError(errorMessage)}` };
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-[101] flex flex-col"
            style={{ width: 'min(380px, 100vw)', background: theme.modalBg, borderLeft: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: theme.accent }}
              >
                <Bot size={15} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: theme.text }}>Chat AI</p>
                <p className="text-xs truncate" style={{ color: theme.text3 }}>{quiz.title}</p>
              </div>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                aria-label="Închide chatul"
                className="flex-shrink-0 p-2"
                style={{ color: theme.text3, cursor: 'pointer' }}
              >
                <X size={16} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">AI</div>
                  <p className="text-sm font-medium" style={{ color: theme.text }}>Întreabă-mă orice</p>
                  <p className="text-xs mt-1" style={{ color: theme.text3 }}>despre această grilă de întrebări</p>
                  <div className="mt-4 space-y-2">
                    {['Explică conceptele cheie', 'Care sunt capcanele frecvente?', 'Cum memorez mai ușor?'].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => void sendChat(suggestion)}
                        className="w-full text-left text-xs px-3 py-2 rounded-xl press-feedback fx-lift focus-ring"
                        style={{ background: theme.surface2, color: theme.text2 }}
                      >
                        {suggestion} →
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[88%] px-3.5 py-2.5 text-sm leading-relaxed"
                    style={{
                      background: message.role === 'user'
                        ? theme.accent
                        : theme.surface2,
                      color: message.role === 'user' ? '#fff' : theme.text,
                      borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    }}
                  >
                    {message.content
                      ? message.role === 'assistant'
                        ? <AIRichText text={message.content} />
                        : message.content
                      : <span style={{ opacity: 0.4 }}>...</span>}
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="Pune o întrebare..."
                  className="focus-ring elev-1 flex-1 text-sm px-3 py-2.5 rounded-xl"
                  style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text, outline: 'none' }}
                />
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => void sendChat()}
                  aria-label="Trimite"
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: chatInput.trim() && !chatLoading
                      ? theme.accent
                      : theme.surface2,
                    color: chatInput.trim() && !chatLoading ? '#fff' : theme.text3,
                  }}
                >
                  {chatLoading ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </Portal>
  );
}
