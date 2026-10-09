/**
 * One layer for "ask the model for JSON and get a validated value back".
 *
 *   1. request   — `response_format: json_object` when the provider takes it
 *                  (groqRequest retries once without it on a 400/422 and
 *                  remembers per provider/model, so a rejecting provider costs
 *                  one extra call, once);
 *   2. parse     — tolerant: fences, `<think>` blocks, chatter around the JSON,
 *                  trailing commas, replies cut off by max_tokens;
 *   3. validate  — with a zod schema from `schemas.ts`;
 *   4. repair    — if 2/3 failed, ONE low-temperature LLM pass that is shown the
 *                  concrete validation error and the broken reply, then a clean
 *                  `{ ok: false }` instead of an exception.
 *
 * Network/provider failures still throw (as `groqRequest` does) so callers keep
 * their existing handling of rate limits, missing keys and Stop.
 */
import type { z } from 'zod';
import { groqRequest, type GroqMessage } from '../groq';
import type { AIRequestTask } from '../../ai/types';
import { logAIDebug } from '../../ai/debug';
import { looksLikeJson } from '../jsonExtract';
import { parseStructuredReply } from './schemas';

export { parseStructuredReply } from './schemas';

export interface StructuredRequest<T> {
  schema: z.ZodType<T>;
  messages: GroqMessage[];
  /** Budget/temperature class; defaults to `analysis`. */
  task?: AIRequestTask;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  /** Defaults to true: the prompt already carries its own context. */
  skipLibraryContext?: boolean;
  /**
   * Send `response_format: json_object` (default). Turn off for prompts that ask
   * for a BARE ARRAY: JSON mode forces an object, so the two would fight.
   */
  jsonMode?: boolean;
  /** Short description of the expected shape, shown to the model in the repair pass. */
  schemaHint?: string;
  /** Allow the single repair pass (default true). */
  repair?: boolean;
  /** Name used in debug logs. */
  label?: string;
  /** Pin the request (and its repair pass) to one provider/model, with no fallback chain. */
  only?: { provider: 'groq' | 'google' | 'mistral'; model: string };
  /** Sarcină utilitară: modelul mic al furnizorului curent. */
  light?: boolean;
}

export type StructuredResult<T> =
  | { ok: true; data: T; /** True when the first reply was invalid and the repair pass fixed it. */ repaired: boolean; raw: string }
  | { ok: false; error: string; raw: string };

const REPAIR_RAW_LIMIT = 14_000;

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function requestStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const task = req.task ?? 'analysis';
  const jsonMode = req.jsonMode ?? true;
  const label = req.label ?? 'structured';
  const common = {
    task,
    maxTokens: req.maxTokens,
    abortSignal: req.abortSignal,
    skipLibraryContext: req.skipLibraryContext ?? true,
    jsonMode,
    only: req.only,
    light: req.light,
  };

  const raw = await groqRequest({ ...common, messages: req.messages, temperature: req.temperature });
  logAIDebug(`${label}:raw`, raw);

  const first = parseStructuredReply(raw, req.schema);
  if (first.ok) return { ok: true, data: first.data, repaired: false, raw };

  const rawText = typeof raw === 'string' ? raw : '';
  logAIDebug(`${label}:invalid`, first.error);
  // Nothing JSON-shaped to fix (a prose answer, an empty reply): a repair pass could only invent content.
  if (req.repair === false || !looksLikeJson(rawText)) return { ok: false, error: first.error, raw: rawText };

  let fixedRaw: string;
  try {
    fixedRaw = await groqRequest({
      ...common,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'Repară răspunsul JSON de mai jos și returnează DOAR JSON valid, fără markdown și fără text în plus.',
            'Corectează doar structura (sintaxă, câmpuri lipsă sau de alt tip, ghilimele, virgule), conform erorii indicate.',
            'Nu inventa conținut nou și nu schimba sensul textelor; păstrează limba română. Elementele irecuperabile se omit.',
            req.schemaHint ? `Schema așteptată: ${req.schemaHint}` : '',
          ].filter(Boolean).join('\n'),
        },
        {
          role: 'user',
          content: `Eroarea de validare: ${first.error}\n\nJSON de reparat:\n${rawText.slice(0, REPAIR_RAW_LIMIT)}`,
        },
      ],
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    // A failed repair must not hide the original problem.
    return { ok: false, error: first.error, raw: rawText };
  }
  logAIDebug(`${label}:repairedRaw`, fixedRaw);

  const second = parseStructuredReply(fixedRaw, req.schema);
  if (second.ok) return { ok: true, data: second.data, repaired: true, raw: fixedRaw };
  return { ok: false, error: `${first.error} | după reparare: ${second.error}`, raw: fixedRaw };
}

/** For callers that treat an unusable reply as an error. */
export async function requestStructuredOrThrow<T>(req: StructuredRequest<T>, message = 'Validarea răspunsului AI a eșuat'): Promise<T> {
  const result = await requestStructured(req);
  if (!result.ok) {
    logAIDebug(`${req.label ?? 'structured'}:failed`, result.error);
    throw new Error(message);
  }
  return result.data;
}
