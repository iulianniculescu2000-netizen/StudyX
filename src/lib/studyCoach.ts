import type { PerformanceSummary } from './aiContext';
import type { AIKnowledgeSource } from '../store/aiStore';
import type { DueExamSession } from './studyPlan';

export interface StudyCoachAction {
  title: string;
  detail: string;
  tone: 'accent' | 'success' | 'warning';
  route?: string;
}

export interface StudyCoachPlan {
  headline: string;
  summary: string;
  focusTopic: string;
  sourceQualityLabel: string;
  actions: StudyCoachAction[];
}

// Single source of truth for the "good enough" bar — the label and the cleanup-action
// decision below used to disagree (label said "bună" for 60-64% while the action still
// suggested cleaning it up), which contradicted itself in the same plan.
const SOURCE_QUALITY_EXCELLENT = 78;
const SOURCE_QUALITY_GOOD = 65;

export function buildStudyCoachPlan(
  summary: PerformanceSummary,
  sources: AIKnowledgeSource[],
  dueExamSession: DueExamSession | null = null,
): StudyCoachPlan {
  const focusTopic = summary.weakTopics[0]?.tag ?? summary.strongTopics[0]?.tag ?? 'Consolidare generală';
  const avgSourceQuality = Math.round(
    sources.reduce((acc, source) => acc + (source.qualityScore ?? 60), 0) / Math.max(sources.length, 1),
  );

  const sourceQualityLabel = sources.length === 0
    ? 'Fără surse AI încărcate'
    : avgSourceQuality >= SOURCE_QUALITY_EXCELLENT
      ? `Biblioteca AI excelentă (${avgSourceQuality}%)`
      : avgSourceQuality >= SOURCE_QUALITY_GOOD
        ? `Biblioteca AI bună (${avgSourceQuality}%)`
        : `Biblioteca AI cere curățare (${avgSourceQuality}%)`;

  const actions: StudyCoachAction[] = [];

  if (summary.dueCount > 0) {
    actions.push({
      title: `Recapitulare rapidă pentru ${summary.dueCount} itemi`,
      detail: 'Pornește o sesiune scurtă de recovery și închide întâi restanța de azi.',
      tone: 'accent',
      route: '/daily-review',
    });
  }

  if (dueExamSession) {
    const { session, folderId, folderName } = dueExamSession;
    const chapterLabel = session.chapters.length === 1
      ? session.chapters[0].label
      : `${session.chapters.length} capitole`;
    const passLabel = session.kind === 'first-pass' ? 'Prima trecere' : `Recapitulare ${session.passIndex}`;
    actions.push({
      title: `Plan de examen: ${chapterLabel}`,
      detail: `${passLabel} din planul tău pentru „${folderName}" e programată acum.`,
      tone: 'accent',
      route: `/vault?folder=${folderId}`,
    });
  }

  if (summary.weakTopics.length > 0) {
    actions.push({
      title: `Repară topicul slab: ${focusTopic}`,
      detail: `Acuratețea pe ${focusTopic} este încă joasă. Mergi pe întrebări explicate și repetiție ghidată.`,
      tone: 'warning',
      route: '/review',
    });
  }

  if (sources.length === 0) {
    actions.push({
      title: 'Alimentează AI-ul cu cursurile tale',
      detail: 'Adaugă PDF-uri sau DOCX-uri pentru răspunsuri mai serioase și mai ancorate în materia ta.',
      tone: 'success',
      route: '/vault',
    });
  } else if (avgSourceQuality < SOURCE_QUALITY_GOOD) {
    actions.push({
      title: 'Curăță documentele slab extrase',
      detail: 'Unele importuri par scanate prost. Refă OCR-ul pentru context AI mai clar și răspunsuri mai bune.',
      tone: 'warning',
      route: '/vault',
    });
  } else {
    actions.push({
      title: 'Folosește AI-ul ca studiu activ',
      detail: `Întreabă AI-ul direct din chat despre ${focusTopic} și cere întrebări noi doar din biblioteca ta.`,
      tone: 'success',
      route: '/vault',
    });
  }

  return {
    headline: summary.weakTopics.length > 0
      ? `Astăzi merită să ataci ${focusTopic}`
      : 'Astăzi ești într-o zonă bună de ritm',
    summary: summary.totalAnswered === 0
      ? 'Începe cu o sesiune ghidată și lasă AI-ul să-și construiască profilul tău de învățare.'
      : `Ai ${summary.globalAccuracy}% acuratețe globală, ${summary.streakDays} ${summary.streakDays === 1 ? 'zi' : 'zile'} streak și ${summary.dueCount} itemi care cer atenție acum.`,
    focusTopic,
    sourceQualityLabel,
    actions: actions.slice(0, 3),
  };
}
