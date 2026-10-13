import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './shared';
import { persistableMessages } from './chatPersistence';

// v2: bumped to clear old messages with malformed citation.topic === citation.source
export const CHAT_STORAGE_KEY = 'studyx:chat:messages:v2';
/** How many trailing messages survive a reload — older ones are summarized, not persisted verbatim. */
const PERSISTED_MESSAGE_LIMIT = 60;
/** How long the thread must stay unchanged before it is written to localStorage. */
const PERSIST_DEBOUNCE_MS = 800;

export type ChatThread = 'general' | 'rezidentiat';

function storageKeyFor(thread: ChatThread): string {
  return thread === 'rezidentiat' ? `${CHAT_STORAGE_KEY}:rezidentiat` : CHAT_STORAGE_KEY;
}

function loadMessages(key: string): ChatMessage[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    // Placeholderele goale salvate de versiunile anterioare nu se mai afișează (fără text, doar cu surse fără legătură).
    return persistableMessages(JSON.parse(stored) as ChatMessage[]);
  } catch {
    return [];
  }
}

/**
 * Owns the chat thread itself: the `messages` array, its localStorage
 * persistence, a `messagesRef` mirror for reads inside async closures (the
 * agent planner's history, the summarizer), and the scroll-to-bottom effect.
 *
 * `thread` selects which conversation is live — Rezidențiat and the general
 * app keep fully separate histories/storage so switching between them never
 * mixes context.
 *
 * Deliberately just state + persistence — every other concern (streaming,
 * agent commands, studio generation) reads/writes `messages` through the
 * setter this returns, so none of that logic needs to move here too.
 */
/** Cât timp după deschidere ținem chatul lipit de ultimul mesaj, cât se așază conținutul încărcat leneș. */
const SETTLE_MS = 1500;

export function useChatMessages(options: { open: boolean; calmMotion: boolean; thread: ChatThread }) {
  const { open, calmMotion, thread } = options;
  const storageKey = storageKeyFor(thread);

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(storageKey));

  const chatEndRef = useRef<HTMLDivElement>(null);
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  const messagesRef = useRef<ChatMessage[]>([]);

  if (storageKey !== prevStorageKey) {
    setPrevStorageKey(storageKey);
    setMessages(loadMessages(storageKey));
  }

  // Follow the conversation, but never fight the reader: a new message always scrolls into
  // view, while streaming chunks only do so if the reader is already near the bottom (so they can
  // scroll up during a long answer), and without restarting a smooth animation on every chunk.
  // Layout reads and the scroll itself happen in one animation frame, so a burst of chunks costs one reflow.
  const lastCountRef = useRef(0);
  /** Până la acest moment (ms, performance.now) chatul se așază la ultimul mesaj și efectul de mai jos nu intervine. */
  const settleUntilRef = useRef(0);

  // La deschidere (și la schimbarea conversației) mergi la ULTIMUL mesaj, nu la începutul listei: chatul se montează de
  // fiecare dată cu scroll 0, iar efectul de mai jos derulează doar la mesaj nou sau dacă ești deja lângă capăt.
  // Conținutul (markdown, scheme, imagini) se încarcă leneș și crește după primul scroll, deci poziția se re-fixează la
  // fiecare schimbare de înălțime, scurt, și se oprește de îndată ce utilizatorul derulează singur.
  useEffect(() => {
    if (!open) return;
    settleUntilRef.current = performance.now() + SETTLE_MS;
    let userMoved = false;
    let scroller: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    const toBottom = () => { if (scroller && !userMoved) scroller.scrollTop = scroller.scrollHeight; };
    const onUser = () => { userMoved = true; };
    const USER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const frame = requestAnimationFrame(() => {
      const end = chatEndRef.current;
      scroller = (end?.closest('.custom-scrollbar') as HTMLElement | null) ?? null;
      if (!end || !scroller) return;
      toBottom();
      for (const name of USER_EVENTS) scroller.addEventListener(name, onUser, { passive: true });
      if (typeof ResizeObserver !== 'undefined' && end.parentElement) {
        observer = new ResizeObserver(toBottom);
        observer.observe(end.parentElement);
      }
    });
    const stop = window.setTimeout(() => observer?.disconnect(), SETTLE_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(stop);
      observer?.disconnect();
      if (scroller) for (const name of USER_EVENTS) scroller.removeEventListener(name, onUser);
    };
  }, [open, storageKey, chatEndRef]);

  useEffect(() => {
    if (!open) return;
    if (performance.now() < settleUntilRef.current) {
      lastCountRef.current = messages.length;
      return;
    }
    const isNewMessage = messages.length !== lastCountRef.current;
    lastCountRef.current = messages.length;
    const frame = requestAnimationFrame(() => {
      const end = chatEndRef.current;
      if (!end) return;
      const scroller = end.closest('.custom-scrollbar') as HTMLElement | null;
      const nearBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
      if (!isNewMessage && !nearBottom) return;
      if (!isNewMessage && scroller) scroller.scrollTop = scroller.scrollHeight;
      else end.scrollIntoView({ behavior: calmMotion || !isNewMessage ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, open, calmMotion]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Saving serializes up to PERSISTED_MESSAGE_LIMIT messages synchronously: doing that on every streamed token
  // blocked the main thread. It now waits for a short pause, and is flushed when the thread changes or the page closes.
  useEffect(() => {
    const snapshot = persistableMessages(messages).slice(-PERSISTED_MESSAGE_LIMIT);
    const save = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(snapshot));
      } catch {
        // quota exceeded — ignore
      }
    };
    const timer = window.setTimeout(save, PERSIST_DEBOUNCE_MS);
    const flush = () => { window.clearTimeout(timer); save(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [messages, storageKey]);

  // Switching thread (or unmounting) must not drop the last pending change of the thread being left: when this
  // cleanup runs, `messagesRef` still holds that thread's messages.
  useEffect(() => () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(persistableMessages(messagesRef.current).slice(-PERSISTED_MESSAGE_LIMIT)));
    } catch {
      // quota exceeded — ignore
    }
  }, [storageKey]);

  return { messages, setMessages, messagesRef, chatEndRef };
}
