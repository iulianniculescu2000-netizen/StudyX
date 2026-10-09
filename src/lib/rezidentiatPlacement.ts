import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import type { Folder } from '../types';
import { REZIDENTIAT_ROOT_NAME, findRezidentiatRootFolder, isUnderRezidentiatRoot } from './rezidentiatRoot';
import { isFolderSessionQuiz } from './rezidentiatOverview';
import { suggestFolderAppearance } from './folderAppearance';

interface NamedFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

/**
 * Every AI-generated set for Rezidențiat goes into one folder, "Grile", directly under the
 * Rezidențiat root — the folder the user already keeps for them — and is grouped there by
 * specialty, so the Rezidențiat page lists it like any other discipline.
 */
export const AI_GRILE_FOLDER_NAME = 'Grile';

export interface ResidencyPlacement {
  /** Always the "Grile" folder's name; kept as a field so callers can show the full path. */
  disciplineName: string;
  /** The specialty subfolder inside "Grile", or null to file the set directly in "Grile". */
  specialtyName: string | null;
  /** Existing folder ids, when the folder is already in the tree. */
  disciplineId: string | null;
  specialtyId: string | null;
}

const STOP_WORDS = new Set(['si', 'de', 'ale', 'al', 'la', 'in', 'cu', 'pe', 'a']);

/** The official chapter titles and the imported banks name the same specialty differently. */
const SPECIALTY_ALIASES: Record<string, string> = {
  'tulburarile psihice': 'psihiatrie',
  'afectiuni ginecologice si mamare': 'ginecologie obstetrica',
};

const plain = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');

// Romanian endings, longest first. A stem must keep at least 4 letters, so short words stay whole.
const SUFFIXES = ['ului', 'elor', 'ilor', 'ile', 'ele', 'ul', 'ea', 'ia', 'ie', 'ii', 'ei', 'le', 'a', 'e', 'i', 'u'];

function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Word stems of a specialty name, ignoring anything after a colon ("Urologie: afecțiunile…" → urolog). */
function specialtyStems(name: string): string[] {
  const head = plain(name.split(':')[0]).replace(/\s+/g, ' ').trim();
  const aliased = SPECIALTY_ALIASES[head] ?? head;
  return aliased.split(' ').filter((word) => word && !STOP_WORDS.has(word)).map(stem);
}

/**
 * Whether two names are the same specialty: diacritics, case, stop-words and
 * word endings are ignored ("DIABETUL ZAHARAT" = "Diabet zaharat", "Bolile
 * hepatice" = "Boli hepatice", "Otorinolaringologia: …" = "Otorinolaringologie"),
 * while genuinely different names stay different ("Neurochirurgie" ≠ "Neurologie",
 * "Pneumonia" ≠ "Pneumologie"). A longer official title also matches its shorter
 * name when the shorter one is a leading part of it (≥ 2 words).
 */
export function specialtyMatches(a: string, b: string): boolean {
  const first = specialtyStems(a);
  const second = specialtyStems(b);
  if (first.length === 0 || second.length === 0) return false;
  if (first.length === second.length) return first.every((word, i) => word === second[i]);
  const [short, long] = first.length < second.length ? [first, second] : [second, first];
  return short.length >= 2 && short.every((word, i) => word === long[i]);
}

/** "CARDIOLOGIE" → "Cardiologie"; already-mixed-case titles are left alone. */
export function tidySpecialtyName(raw: string): string {
  const cleaned = raw.replace(/^\s*\d+[.)]?\s*/, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return cleaned;
  const letters = cleaned.replace(/[^\p{L}]/gu, '');
  const isShouting = letters.length > 3 && letters === letters.toLocaleUpperCase('ro');
  const base = isShouting ? cleaned.toLocaleLowerCase('ro') : cleaned;
  return base.charAt(0).toLocaleUpperCase('ro') + base.slice(1);
}

const bookLabel = (sourceName: string) => sourceName.replace(/\.(pdf|docx|txt|md)$/i, '').trim();

/** Keywords of a free-form topic → the specialty it belongs to (names as in the imported banks). */
const TOPIC_RULES: Array<{ test: RegExp; specialty: string }> = [
  // Before the broader rules: "hematom subdural" is not hematology, "diabet insipid" is not diabetes mellitus.
  { test: /hematom (subdural|epidural|intracranian)|subdural|epidural/, specialty: 'Neurochirurgie' },
  { test: /diabet insipid/, specialty: 'Endocrinologie' },
  { test: /mielom|limfom|leucemi|anemi|hemofili|trombocitopeni|coagulopat|talasemi|policitemi|mielodisplaz|hematolog/, specialty: 'Hematologie' },
  { test: /infarct|angin[aă] pectoral|aritmi|fibrila[tț]i|insuficien[tț][aă] cardiac|valvulopat|endocardit|pericardit|cardiomiopat|sincop|cardio/, specialty: 'Cardiologie' },
  { test: /hipertensiune arterial|\bhta\b/, specialty: 'Hipertensiune arterială' },
  { test: /pneumoni|astm|bpoc|tuberculoz|pneumotorax|embolie pulmonar|pleuraz|pleuriz|bronsit|pneumolog/, specialty: 'Pneumologie' },
  { test: /ciroz|hepatit|colestaz|encefalopatie hepatic|hepatic/, specialty: 'Boli hepatice' },
  { test: /ulcer|gastrit|colit[aă]|crohn|reflux|boal[aă] celiac|gastroenter/, specialty: 'Gastroenterologie' },
  { test: /insuficien[tț][aă] renal|glomerulo|nefrit|nefrotic|dializ|pielonefrit|nefrolog/, specialty: 'Tulburări renale și ale tractului urinar' },
  { test: /diabet|cetoacidoz|hipoglicemi/, specialty: 'Diabet zaharat' },
  { test: /tiroid|cushing|addison|acromegal|feocromocitom|suprarenal|hipofiz|paratiroid|endocrin/, specialty: 'Endocrinologie' },
  { test: /\bavc\b|accident vascular|epilepsi|parkinson|scleroz[aă] multipl|migren|cefale|meningit|neurolog/, specialty: 'Neurologie' },
  { test: /artrit|lupus|spondilit|gut[aă]\b|vasculit|sclerodermi|reumat/, specialty: 'Reumatologie' },
  { test: /tromboz|embolie|anticoagul/, specialty: 'Boala venoasă tromboembolică' },
  { test: /sepsis|\bhiv\b|\bsida\b|sifilis|gonoree|chlamydia|infec[tț]i/, specialty: 'Sepsisul și tratamentul infecțiilor bacteriene' },
  { test: /hiponatremi|hipernatremi|hiperkaliemi|hipokaliemi|acidoz|alcaloz|deshidrat|electrolit/, specialty: 'Echilibrul hidro-electrolitic și acido-bazic' },
  { test: /[sș]oc septic|\bsdra\b|insuficien[tț][aă] respiratorie acut|ventila[tț]i|terapie intensiv/, specialty: 'Terapie intensivă' },
  { test: /psihi|depresi|schizofreni|anxietat|bipolar/, specialty: 'Psihiatrie' },
  { test: /derma|psoriazis|eczem|acnee|melanom/, specialty: 'Dermatologie' },
  { test: /pediatr|copil|nou-n[aă]scut|neonat/, specialty: 'Pediatrie' },
  { test: /pancreat/, specialty: 'Pancreasul' },
  { test: /colecist|litiaz[aă] biliar|coledoc|c[aă]ile biliare/, specialty: 'Căile biliare' },
  { test: /apendicit|ocluzie intestinal|intestin sub[tț]ire/, specialty: 'Intestinul subțire și apendicele' },
  { test: /hernie|hernii|eventra/, specialty: 'Herniile peretelui abdominal' },
  { test: /esofag|achalazi/, specialty: 'Esofagul' },
  { test: /cancer gastric|stomac|duoden/, specialty: 'Stomacul și duodenul' },
  { test: /\bcolon|\brect|hemoroid|diverticul/, specialty: 'Colon, rect și anus' },
  { test: /arsur/, specialty: 'Arsurile' },
  { test: /traumatism|politraumatiz|fractur/, specialty: 'Traumatologie' },
  { test: /splin/, specialty: 'Ficatul și splina' },
  { test: /varice|anevrism|arteriopatie|ischemie acut/, specialty: 'Bolile sistemului vascular' },
  { test: /litiaz[aă] renal|prostat|urolog|cistit/, specialty: 'Urologie' },
  { test: /otit|sinuzit|amigdal|laring|otorino/, specialty: 'Otorinolaringologie' },
];

/** The "Grile" folder directly under the Rezidențiat root, if it exists (diacritic- and case-insensitive). */
function findGrileFolder(folders: NamedFolder[]): NamedFolder | null {
  const root = findRezidentiatRootFolder(folders);
  if (!root) return null;
  const wanted = plain(AI_GRILE_FOLDER_NAME).trim();
  return folders.find((f) => f.parentId === root.id && plain(f.name).trim() === wanted) ?? null;
}

function placementIn(folders: NamedFolder[], specialtyName: string | null): ResidencyPlacement {
  const grile = findGrileFolder(folders);
  const match = specialtyName && grile
    ? folders.find((f) => f.parentId === grile.id && specialtyMatches(f.name, specialtyName))
    : undefined;
  return {
    disciplineName: grile?.name ?? AI_GRILE_FOLDER_NAME,
    specialtyName: match?.name ?? specialtyName,
    disciplineId: grile?.id ?? null,
    specialtyId: match?.id ?? null,
  };
}

/**
 * Where quizzes generated from a book (or one of its chapters) go: Rezidențiat →
 * Grile → the chapter's specialty (an existing subfolder is reused, matching
 * "DIABETUL ZAHARAT" with "Diabet zaharat"), or the book's name for a whole-book pack.
 * Pure: takes the current quiz folders, returns names (and ids when found).
 */
export function resolveResidencyPlacement(
  sourceName: string,
  chapterHeading: string | null,
  folders: NamedFolder[],
): ResidencyPlacement {
  return placementIn(folders, chapterHeading ? tidySpecialtyName(chapterHeading) : bookLabel(sourceName));
}

/**
 * Same for a free-form request ("5 grile despre mielom multiplu"): the topic's
 * keywords pick the specialty (mielom → Hematologie); an unrecognised topic goes
 * straight into "Grile" instead of inventing a folder for it.
 */
export function resolveTopicPlacement(topic: string, folders: NamedFolder[]): ResidencyPlacement {
  const text = plain(topic);
  const rule = TOPIC_RULES.find((entry) => entry.test.test(text));
  return placementIn(folders, rule?.specialty ?? null);
}

/** Finds a same-named child folder, or creates it — case- and diacritic-insensitive on the name. */
function findOrCreateChild(name: string, parentId: string | null, emoji?: string): Folder {
  const { folders, addFolder } = useFolderStore.getState();
  const wanted = plain(name).trim();
  const found = folders.find((f) => (f.parentId ?? null) === parentId && plain(f.name).trim() === wanted);
  if (found) return found;
  // Icon and color follow the name (Cardiologie gets a heart), so new folders look intentional.
  const appearance = suggestFolderAppearance(name);
  const id = addFolder(name, emoji ?? appearance.emoji, appearance.color, parentId);
  return useFolderStore.getState().folders.find((f) => f.id === id) as Folder;
}

/**
 * Makes sure Rezidențiat → Grile (→ specialty) exists and returns the folder to file the
 * quizzes into. Call it only once there is something to file: creating it up front left
 * empty folders behind when a generation failed or was stopped.
 */
export function ensureFolderForPlacement(placement: ResidencyPlacement): Folder {
  const state = () => useFolderStore.getState().folders;
  const root = findOrCreateChild(REZIDENTIAT_ROOT_NAME, null, '🩺');
  const grile = (placement.disciplineId && state().find((f) => f.id === placement.disciplineId))
    || findOrCreateChild(AI_GRILE_FOLDER_NAME, root.id);
  if (!placement.specialtyName) return grile;
  return (placement.specialtyId && state().find((f) => f.id === placement.specialtyId))
    || findOrCreateChild(placement.specialtyName, grile.id);
}

/** Book / chapter variant of {@link ensureFolderForPlacement}. */
export function ensureResidencyFolder(sourceName: string, chapterHeading: string | null): Folder {
  return ensureFolderForPlacement(resolveResidencyPlacement(sourceName, chapterHeading, useFolderStore.getState().folders));
}

/** Free-form topic variant of {@link ensureFolderForPlacement}. */
export function ensureTopicFolder(topic: string): Folder {
  return ensureFolderForPlacement(resolveTopicPlacement(topic, useFolderStore.getState().folders));
}

/** "Rezidențiat › Grile › Hematologie", for messages and the Studio panel. */
export function describePlacement(placement: ResidencyPlacement): string {
  return [REZIDENTIAT_ROOT_NAME, placement.disciplineName, placement.specialtyName].filter(Boolean).join(' › ');
}

/**
 * Sets made earlier by the agent were filed straight into the Rezidențiat root, where the
 * Rezidențiat page has no discipline to list them under. Moves them into "Grile" (by topic,
 * when it's recognisable) so nothing is stranded. Safe to run repeatedly; returns how many moved.
 */
export function adoptStrayResidencyQuizzes(): number {
  const root = findRezidentiatRootFolder(useFolderStore.getState().folders);
  if (!root) return 0;
  const stray = useQuizStore.getState().quizzes.filter((quiz) => (
    quiz.folderId === root.id
    && !quiz.archived
    && quiz.kind !== 'flashcard'
    && !isFolderSessionQuiz(quiz)
    && !(quiz.tags ?? []).some((tag) => tag.startsWith('rezidentiat-bank:'))
  ));
  for (const quiz of stray) {
    const target = ensureTopicFolder(quiz.title);
    useQuizStore.getState().updateQuiz(quiz.id, { folderId: target.id, ...(quiz.category ? {} : { category: target.name }) });
  }
  return stray.length;
}

/** True when a library source is filed anywhere under the AI library's Rezidențiat section. */
export function isResidencySource(source: { folderId?: string | null }, libraryFolders: NamedFolder[]): boolean {
  return !!source.folderId && isUnderRezidentiatRoot(source.folderId, libraryFolders);
}
