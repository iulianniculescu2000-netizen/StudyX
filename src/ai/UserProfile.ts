import { idbGet } from '../lib/idb';
import { useToastStore } from '../store/toastStore';
import type { Confidence, Question } from '../types';
import type {
  AIAnalysisResult,
  MistakeBankEntry,
  RecordQuizSessionInput,
  StrongTopic,
  StudyPatterns,
  TopicPerformance,
  TopicStatsMap,
  TopicTrend,
  UserProfileData,
  WeakTopic,
  WeakTopicInput,
} from './types';

const PROFILE_KEY_PREFIX = 'studyx-ai-profile';
const TOPIC_RECENT_WINDOW = 10; // outcomes kept per topic to derive a trend
const SESSION_LENGTH_WINDOW = 20;
const CONFIDENCE_WINDOW = 100;
const MIN_HOUR_SAMPLES = 5; // before we trust a "best hour"
const CURRENT_SCHEMA_VERSION = 2;

function getProfileKey(profileId: string) {
  return `${PROFILE_KEY_PREFIX}:${profileId}`;
}

function emptyProfile(profileId: string): UserProfileData {
  return {
    profileId,
    globalAccuracy: 0,
    topicAccuracy: {},
    strongTopics: [],
    studyPatterns: { preferredSessionLength: 0, bestPerformanceHour: null, averageConfidence: 0 },
    recentMistakes: [],
    mistakeBank: [],
    currentDifficulty: 'medium',
    streak: 0,
    recentQuestions: [],
    updatedAt: Date.now(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    _hourStats: {},
    _sessionLengths: [],
    _confidences: [],
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Overlays a stored profile on the defaults, discarding fields of the wrong type so later code can't crash on them. */
function repairProfile(base: UserProfileData, stored: Partial<UserProfileData>, profileId: string): UserProfileData {
  const merged: Record<string, unknown> = { ...base, ...stored, profileId };
  const baseRec = base as unknown as Record<string, unknown>;
  for (const [field, fallback] of Object.entries(baseRec)) {
    const value = merged[field];
    const ok = Array.isArray(fallback) ? Array.isArray(value)
      : isPlainObject(fallback) ? isPlainObject(value)
      : typeof fallback === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : typeof fallback === 'string' ? typeof value === 'string'
      : true;
    if (!ok) merged[field] = fallback;
  }
  const patterns = isPlainObject(merged.studyPatterns) ? merged.studyPatterns : {};
  merged.studyPatterns = { ...base.studyPatterns, ...patterns };
  return merged as unknown as UserProfileData;
}

export function loadUserProfile(profileId: string): UserProfileData {
  const key = getProfileKey(profileId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptyProfile(profileId);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('profile blob is not an object');
    return repairProfile(emptyProfile(profileId), parsed as Partial<UserProfileData>, profileId);
  } catch {
    // Corrupt JSON — unlike a missing key, this used to fail the exact same
    // way on every subsequent call too (the bad bytes were never replaced),
    // silently resetting the adaptive-difficulty/weak-topics profile with no
    // indication to the user. Quarantine a copy, then overwrite with a fresh
    // empty profile so this doesn't keep re-triggering on every answer.
    try {
      const raw = localStorage.getItem(key);
      if (raw) localStorage.setItem(`${key}__corrupt-${Date.now()}`, raw);
    } catch {
      // Out of space — nothing more we can do here.
    }
    const fresh = emptyProfile(profileId);
    saveUserProfile(fresh);
    useToastStore.getState().upsertToast(
      'ai-user-profile-corrupt',
      'Profilul tău de învățare AI era corupt și a fost resetat. Progresul din grile nu e afectat.',
      'warning',
      9000,
    );
    return fresh;
  }
}

export function saveUserProfile(profile: UserProfileData) {
  try {
    localStorage.setItem(getProfileKey(profile.profileId), JSON.stringify({ ...profile, updatedAt: Date.now() }));
  } catch (err) {
    console.error('[UserProfile] Failed to save profile:', err);
  }
}

function difficultyFromAccuracy(accuracy: number): 'easy' | 'medium' | 'hard' {
  if (accuracy >= 80) return 'hard';
  if (accuracy < 50) return 'easy';
  return 'medium';
}

/**
 * Shrinks a topic's raw accuracy toward a neutral prior before ranking "weak topics", so a
 * single wrong answer (0% on n=1) doesn't outrank a topic with a real pattern of mistakes
 * (e.g. 60% on n=20). Only used for sorting — the displayed accuracy stays the true percentage.
 */
function weaknessRank(correct: number, total: number, priorMean = 65, priorWeight = 4): number {
  if (total <= 0) return priorMean;
  return ((correct + (priorWeight * priorMean) / 100) / (total + priorWeight)) * 100;
}

/**
 * Single source of truth for "what topic does this question belong to" — used everywhere a
 * question needs a topic label (weak/strong-topic ranking, mistake-bank entries, session
 * pattern tracking) so the same question always buckets the same way.
 */
function topicsForQuestion(question: { tags?: string[]; category?: string } | undefined): string[] {
  return question?.tags?.length ? question.tags : [question?.category || 'Topic general'];
}

/** Trend from a topic's recent outcome window: compare older half vs newer half. */
function deriveTrend(recent: boolean[]): TopicTrend {
  if (recent.length < 4) return 'stable';
  const mid = Math.floor(recent.length / 2);
  const older = recent.slice(0, mid);
  const newer = recent.slice(mid);
  const rate = (arr: boolean[]) => arr.filter(Boolean).length / arr.length;
  const delta = rate(newer) - rate(older);
  if (delta > 0.15) return 'improving';
  if (delta < -0.15) return 'worsening';
  return 'stable';
}

function confidenceValue(confidence?: Confidence): number | null {
  if (confidence === 'blackout') return 0;
  if (confidence === 'guess') return 0.5;
  if (confidence === 'confident') return 1;
  return null;
}

function percent(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

function computeTopicStats({ stats, questions }: WeakTopicInput): TopicStatsMap {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const topicStats: TopicStatsMap = {};

  for (const stat of Object.values(stats)) {
    const question = byId.get(stat.questionId);
    for (const tag of topicsForQuestion(question)) {
      if (!topicStats[tag]) {
        topicStats[tag] = { correct: 0, total: 0, wrong: 0, lastWrongAt: 0 };
      }
      topicStats[tag].correct += stat.timesCorrect;
      topicStats[tag].wrong += stat.timesWrong;
      topicStats[tag].total += stat.timesCorrect + stat.timesWrong;
      if (stat.timesWrong > 0) {
        topicStats[tag].lastWrongAt = Math.max(topicStats[tag].lastWrongAt, stat.lastSeen || 0);
      }
    }
  }

  return topicStats;
}

function extractStrongTopics({ stats, questions }: WeakTopicInput): StrongTopic[] {
  const topicStats = computeTopicStats({ stats, questions });

  return Object.entries(topicStats)
    .map(([topic, current]) => ({
      topic,
      accuracy: percent(current.correct, current.total),
      total: current.total,
    }))
    .filter((topic) => topic.total >= 3 && topic.accuracy >= 80)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 10);
}

/**
 * The single writer for topicAccuracy/globalAccuracy/currentDifficulty/strongTopics/
 * studyPatterns, called once when a quiz session finishes. Also unconditionally records a
 * mistake-bank entry for every wrong answer in the session — recording no longer depends on
 * the user clicking "Explică cu AI" (see updateUserProfileAfterAnswer, which now only enriches
 * an existing entry with an AI explanation when/if that happens).
 */
export function recordQuizSession(profileId: string, input: RecordQuizSessionInput): UserProfileData {
  const profile = loadUserProfile(profileId);
  const { stats, questions, streak, sessionItems, durationSeconds, finishedAt } = input;
  const byId = new Map(questions.map((q) => [q.id, q]));

  const topicStatsMap = computeTopicStats({ stats, questions });
  const strongTopics = extractStrongTopics({ stats, questions });

  const topicAccuracy: Record<string, TopicPerformance> = {};
  for (const [topic, current] of Object.entries(topicStatsMap)) {
    const previous = profile.topicAccuracy[topic];
    topicAccuracy[topic] = {
      correct: current.correct,
      total: current.total,
      accuracy: percent(current.correct, current.total),
      recent: previous?.recent ?? [],
      lastSeen: previous?.lastSeen ?? 0,
    };
  }

  // Fold this session's outcomes into each topic's rolling "recent" window (trend) and into
  // the hour/session-length/confidence aggregates — none of this is derivable from the
  // lifetime `stats` map alone, it needs the actual ordered events from this session.
  const hourStats = { ...profile._hourStats };
  const hour = String(new Date(finishedAt).getHours());
  const hourStat = { ...(hourStats[hour] ?? { correct: 0, total: 0 }) };

  let confidences = [...profile._confidences];
  const nextMistakes = [...profile.recentMistakes];
  const bank = [...profile.mistakeBank];

  for (const item of sessionItems) {
    const question = byId.get(item.questionId);
    const topics = topicsForQuestion(question);

    for (const topic of topics) {
      const entry = topicAccuracy[topic] ?? { correct: 0, total: 0, accuracy: 0, recent: [], lastSeen: 0 };
      entry.recent = [...entry.recent, item.correct].slice(-TOPIC_RECENT_WINDOW);
      entry.lastSeen = finishedAt;
      topicAccuracy[topic] = entry;
    }

    hourStat.total += 1;
    if (item.correct) hourStat.correct += 1;

    const conf = confidenceValue(item.confidence);
    if (conf !== null) confidences = [...confidences, conf].slice(-CONFIDENCE_WINDOW);

    if (!item.correct && question) {
      const topic = topics[0];
      nextMistakes.unshift({
        questionId: item.questionId,
        topic,
        answer: item.userAnswer ?? '',
        correctAnswer: item.correctAnswer ?? '',
        timestamp: finishedAt,
      });

      const existing = bank.find((entry) => entry.questionId === item.questionId);
      if (existing) {
        existing.wrongCount += 1;
      } else {
        const entry: MistakeBankEntry = {
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          questionId: item.questionId,
          questionText: question.text,
          topic,
          userAnswer: item.userAnswer ?? '',
          correctAnswer: item.correctAnswer ?? '',
          createdAt: finishedAt,
          wrongCount: 1,
        };
        bank.unshift(entry);
      }
    }
  }
  hourStats[hour] = hourStat;

  const sessionLengths = durationSeconds > 0
    ? [...profile._sessionLengths, durationSeconds / 60].slice(-SESSION_LENGTH_WINDOW)
    : profile._sessionLengths;

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  let bestHour: number | null = null;
  let bestRate = -1;
  for (const [h, s] of Object.entries(hourStats)) {
    if (s.total < MIN_HOUR_SAMPLES) continue;
    const rate = s.correct / s.total;
    if (rate > bestRate) {
      bestRate = rate;
      bestHour = Number(h);
    }
  }
  const studyPatterns: StudyPatterns = {
    preferredSessionLength: Math.round(avg(sessionLengths)),
    bestPerformanceHour: bestHour,
    averageConfidence: Math.round(avg(confidences) * 100) / 100,
  };

  const allStats = Object.values(stats);
  const totalAnswers = allStats.reduce((sum, stat) => sum + stat.timesCorrect + stat.timesWrong, 0);
  const totalCorrect = allStats.reduce((sum, stat) => sum + stat.timesCorrect, 0);
  const globalAccuracy = percent(totalCorrect, totalAnswers);

  const nextProfile: UserProfileData = {
    ...profile,
    globalAccuracy,
    topicAccuracy,
    strongTopics,
    studyPatterns,
    currentDifficulty: difficultyFromAccuracy(globalAccuracy),
    streak,
    recentMistakes: nextMistakes.slice(0, 12),
    mistakeBank: bank.slice(0, 50),
    _hourStats: hourStats,
    _sessionLengths: sessionLengths,
    _confidences: confidences,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: Date.now(),
  };
  saveUserProfile(nextProfile);
  return nextProfile;
}

/**
 * Called when the user asks the AI to explain a wrong answer. Narrower than it used to be:
 * it only *enriches* the mistake-bank entry (explanation/mistakeType/missingConcept/mnemonic,
 * plus backfilling the real answer text) — recordQuizSession() is now the only writer of
 * topicAccuracy/globalAccuracy/currentDifficulty, so this can no longer disagree with it.
 */
export function updateUserProfileAfterAnswer(
  profileId: string,
  payload: {
    question: Question;
    isCorrect: boolean;
    userAnswer: string;
    correctAnswer: string;
    analysis?: AIAnalysisResult;
  }
) {
  const profile = loadUserProfile(profileId);
  const topics = topicsForQuestion(payload.question);

  const nextMistakes = payload.isCorrect
    ? profile.recentMistakes
    : [
        {
          questionId: payload.question.id,
          topic: topics[0],
          answer: payload.userAnswer,
          correctAnswer: payload.correctAnswer,
          mistakeType: payload.analysis?.mistakeType,
          timestamp: Date.now(),
        },
        ...profile.recentMistakes,
      ].slice(0, 12);

  const bank = [...profile.mistakeBank];
  if (!payload.isCorrect) {
    const existing = bank.find((entry) => entry.questionId === payload.question.id);
    if (existing) {
      existing.wrongCount += 1;
      existing.userAnswer = payload.userAnswer || existing.userAnswer;
      existing.correctAnswer = payload.correctAnswer || existing.correctAnswer;
      existing.explanation = payload.analysis?.explanation ?? existing.explanation;
      existing.mistakeType = payload.analysis?.mistakeType ?? existing.mistakeType;
      existing.recommendedTopic = payload.analysis?.recommendedTopic ?? existing.recommendedTopic;
      existing.missingConcept = payload.analysis?.missingConcept ?? existing.missingConcept;
      existing.sourceRefs = payload.analysis?.sources ?? existing.sourceRefs;
    } else {
      // Safety net — recordQuizSession() normally creates the base entry at quiz-end, but
      // this keeps working even if analyzeAnswer() somehow runs before that.
      const entry: MistakeBankEntry = {
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
        questionId: payload.question.id,
        questionText: payload.question.text,
        topic: topics[0],
        userAnswer: payload.userAnswer,
        correctAnswer: payload.correctAnswer,
        explanation: payload.analysis?.explanation,
        mistakeType: payload.analysis?.mistakeType,
        missingConcept: payload.analysis?.missingConcept,
        recommendedTopic: payload.analysis?.recommendedTopic,
        sourceRefs: payload.analysis?.sources,
        createdAt: Date.now(),
        wrongCount: 1,
      };
      bank.unshift(entry);
    }
  }

  const nextProfile: UserProfileData = {
    ...profile,
    recentMistakes: nextMistakes,
    mistakeBank: bank.slice(0, 50),
    recentQuestions: [payload.question.id, ...profile.recentQuestions.filter((id) => id !== payload.question.id)].slice(0, 20),
    updatedAt: Date.now(),
  };
  saveUserProfile(nextProfile);
  return nextProfile;
}

export function getWeakTopicsForProfile(profileId: string, limit = 5): WeakTopic[] {
  const profile = loadUserProfile(profileId);
  return Object.entries(profile.topicAccuracy)
    .map(([topic, stats]) => ({
      topic,
      accuracy: stats.accuracy,
      wrongCount: stats.total - stats.correct,
      total: stats.total,
      recencyScore: profile.recentMistakes.find((mistake) => mistake.topic === topic)?.timestamp ?? 0,
    }))
    .sort((a, b) => {
      const rankA = weaknessRank(a.total - a.wrongCount, a.total);
      const rankB = weaknessRank(b.total - b.wrongCount, b.total);
      return rankA - rankB || b.wrongCount - a.wrongCount;
    })
    .slice(0, limit);
}

export function getStrongTopicsForProfile(profileId: string): StrongTopic[] {
  return loadUserProfile(profileId).strongTopics;
}

export function generateFromMistakes(profileId: string) {
  const profile = loadUserProfile(profileId);
  return profile.mistakeBank
    .sort((a, b) => b.wrongCount - a.wrongCount || b.createdAt - a.createdAt)
    .slice(0, 10);
}

const TREND_LABEL: Record<TopicTrend, string> = {
  improving: 'în creștere',
  stable: 'stabil',
  worsening: 'în scădere',
};

/**
 * Compressed (~200 token) natural-language summary for injection into AI requests as a
 * system-prompt fragment. Synchronous (unlike the old userMemory.ts version) since the
 * canonical profile is localStorage-backed. Returns '' when there's nothing to say.
 */
export function getProfileSummaryText(profileId: string): string {
  const profile = loadUserProfile(profileId);
  const parts: string[] = [];

  const weakTopics = getWeakTopicsForProfile(profileId);
  if (weakTopics.length > 0) {
    const list = weakTopics
      .slice(0, 3)
      .map((t) => {
        const trend = deriveTrend(profile.topicAccuracy[t.topic]?.recent ?? []);
        return `${t.topic} (${t.wrongCount} greșeli, ${TREND_LABEL[trend]})`;
      })
      .join(', ');
    parts.push(`Are dificultăți cu: ${list}.`);
  }

  if (profile.strongTopics.length > 0) {
    const list = profile.strongTopics
      .slice(0, 3)
      .map((t) => `${t.topic} (${t.accuracy}%)`)
      .join(', ');
    parts.push(`Performanță bună la: ${list}.`);
  }

  const { preferredSessionLength, bestPerformanceHour, averageConfidence } = profile.studyPatterns;
  const patternBits: string[] = [];
  if (preferredSessionLength > 0) patternBits.push(`sesiuni tipice ~${preferredSessionLength} min`);
  if (bestPerformanceHour !== null) patternBits.push(`mai productiv în jurul orei ${bestPerformanceHour}:00`);
  if (averageConfidence > 0) patternBits.push(`încredere medie ${Math.round(averageConfidence * 100)}%`);
  if (patternBits.length > 0) parts.push(`Tipar de studiu: ${patternBits.join(', ')}.`);

  return parts.join(' ');
}

/** Resets only the behavioral-pattern slice (study patterns + rolling aggregates), preserving
 *  topicAccuracy/mistakeBank/recentMistakes — those aren't "AI memory" in the sense the
 *  Settings reset button describes, they're core profile data. */
export function clearStudyPatterns(profileId: string): void {
  const profile = loadUserProfile(profileId);
  saveUserProfile({
    ...profile,
    strongTopics: [],
    studyPatterns: { preferredSessionLength: 0, bestPerformanceHour: null, averageConfidence: 0 },
    _hourStats: {},
    _sessionLengths: [],
    _confidences: [],
  });
}

interface LegacyUserMemoryRecord {
  studyPatterns?: StudyPatterns;
  _hourStats?: Record<string, { correct: number; total: number }>;
  _sessionLengths?: number[];
  _confidences?: number[];
}

/**
 * One-time, best-effort port of the old userMemory.ts IndexedDB record (study patterns,
 * rolling aggregates) into the unified profile, so upgrading users don't lose accumulated
 * history. Guarded by schemaVersion so it's a no-op on every call after the first. Reads the
 * legacy IndexedDB key directly (rather than importing the now-deleted userMemory.ts module).
 */
export async function migrateLegacyUserMemory(profileId: string): Promise<void> {
  // Not gated on schemaVersion: a brand-new (or already-stamped) profile can still have an unported
  // legacy IndexedDB record, because a finished quiz stamps the current version before this runs.
  // A per-profile "done" flag keeps it to one IndexedDB read.
  const doneKey = `studyx-legacy-memory-ported:${profileId}`;
  try { if (localStorage.getItem(doneKey)) return; } catch { /* storage unavailable: just run */ }
  let legacy: LegacyUserMemoryRecord | null = null;
  try {
    legacy = await idbGet<LegacyUserMemoryRecord>(`studyx-user-memory-${profileId}`);
  } catch {
    // A transient IndexedDB failure must NOT mark the migration as done: the legacy record is
    // still there and the next launch can port it.
    return;
  }
  // Re-read after the await: the profile may have been updated (quiz finished, answer analysed)
  // while IndexedDB was answering, and saving the pre-await copy would silently undo that.
  const profile = loadUserProfile(profileId);
  if (legacy) {
    // Only fill what the live profile does not already have (a session finished meanwhile stamps
    // the new schema version, but must not cost the user the ported history).
    const hasPatterns = profile.studyPatterns.preferredSessionLength > 0 || profile.studyPatterns.bestPerformanceHour !== null;
    if (legacy.studyPatterns && !hasPatterns) profile.studyPatterns = legacy.studyPatterns;
    if (Object.keys(profile._hourStats).length === 0) profile._hourStats = legacy._hourStats ?? {};
    if (profile._sessionLengths.length === 0) profile._sessionLengths = legacy._sessionLengths ?? [];
    if (profile._confidences.length === 0) profile._confidences = legacy._confidences ?? [];
  }
  profile.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveUserProfile(profile);
  try { localStorage.setItem(doneKey, '1'); } catch { /* retried next launch; the merge is idempotent */ }
}
