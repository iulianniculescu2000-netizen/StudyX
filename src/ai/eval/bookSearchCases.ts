/**
 * Setul de măsurare pentru căutarea în cărțile de bază: întrebări scrise ca un student, fiecare cu paginile
 * (din PDF-ul inclus, index + 1 în `*.pages.json`) pe care stă răspunsul. Paginile au fost verificate în textul
 * cărții (14 nov 2026), nu luate din planul de capitole: căutarea folosește titlurile din plan, deci planul
 * nu poate fi și arbitru.
 *
 * `kind`: „direct” = întrebarea numește subiectul ca în carte; „abreviere” = doar abrevierea; „parafrază” =
 * alte cuvinte decât cartea (aici se vede limita căutării pe cuvinte).
 *
 * Cum adaugi un caz: caută faptul în `src/data/rezidentiat/library/<carte>.pages.json`, citește pagina, trece
 * toate paginile pe care răspunsul e complet. Nu trece pagini „pe aproape”.
 */
import type { BookCode } from '../../lib/curriculum';

export type CaseKind = 'direct' | 'abreviere' | 'parafrază';

export interface BookSearchCase {
  book: BookCode;
  query: string;
  /** Paginile PDF acceptate (oricare dintre ele e un răspuns bun). */
  pages: number[];
  kind: CaseKind;
  /** Răspunsul stă complet și în altă carte: paginile acceptate de acolo. */
  alt?: Partial<Record<BookCode, number[]>>;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const BOOK_SEARCH_CASES: BookSearchCase[] = [
  // ── Kumar ──
  { book: 'K', kind: 'direct', query: 'Ce scor folosim ca să decidem anticoagularea în fibrilația atrială?', pages: [222, 223] },
  { book: 'K', kind: 'direct', query: 'Cum se tratează cetoacidoza diabetică?', pages: range(121, 124) },
  { book: 'K', kind: 'direct', query: 'Ce tratament de fond se folosește în poliartrita reumatoidă?', pages: [74, 75, 76] },
  { book: 'K', kind: 'direct', query: 'Cum tratăm criza acută de gută?', pages: [82, 83] },
  { book: 'K', kind: 'direct', query: 'Care sunt criteriile Berlin pentru ARDS?', pages: [50, 51] },
  { book: 'K', kind: 'direct', query: 'Ce este sindromul Brugada și cum se tratează?', pages: [225] },
  { book: 'K', kind: 'direct', query: 'Până la câte ore de la debut se poate face tromboliza în AVC-ul ischemic?', pages: [147, 148] },
  { book: 'K', kind: 'direct', query: 'Ce medicamente se dau în tuberculoză și cât timp?', pages: range(180, 182) },
  { book: 'K', kind: 'direct', query: 'Cum se tratează encefalopatia hepatică?', pages: [324, 325] },
  { book: 'K', kind: 'direct', query: 'Cum se definește sindromul nefrotic?', pages: [333, 334] },
  { book: 'K', kind: 'direct', query: 'Ce semne clinice are tamponada cardiacă?', pages: [275, 276] },
  { book: 'K', kind: 'direct', query: 'Cum supraveghem esofagul Barrett?', pages: [294, 295] },
  { book: 'K', kind: 'direct', query: 'Ce fac la un diabetic cu hipoglicemie severă, inconștient?', pages: [115, 116] },
  { book: 'K', kind: 'direct', query: 'Care este antidotul heparinei?', pages: [204, 205] },
  { book: 'K', kind: 'direct', query: 'Ce legătură are HLA-B27 cu spondilita anchilozantă?', pages: [78] },
  { book: 'K', kind: 'direct', query: 'Tratamentul astmului în trepte', pages: [163, 164] },
  { book: 'K', kind: 'direct', query: 'Cum se stadializează boala cronică de rinichi?', pages: [352, 353] },
  { book: 'K', kind: 'direct', query: 'Cum deosebesc anemia prin deficit de fier de anemia din bolile cronice?', pages: [56, 57] },
  { book: 'K', kind: 'direct', query: 'Ce antitiroidiene de sinteză se folosesc în hipertiroidism?', pages: [93, 94, 95] },
  { book: 'K', kind: 'direct', query: 'Tratamentul sindromului hepatorenal', pages: [325] },
  { book: 'K', kind: 'direct', query: 'Cum se tratează hemocromatoza?', pages: [328] },
  { book: 'K', kind: 'abreviere', query: 'TEP tratament anticoagulant', pages: range(196, 200) },
  { book: 'K', kind: 'abreviere', query: 'BCR stadii', pages: [352, 353] },
  { book: 'K', kind: 'parafrază', query: 'Care este cea mai frecventă cauză de moarte subită la tineri?', pages: [268] },
  { book: 'K', kind: 'parafrază', query: 'Zahăr mic în sânge la un diabetic: ce îi dau?', pages: [115, 116] },
  { book: 'K', kind: 'parafrază', query: 'Ce medicament dau ca să scadă amoniacul la un cirotic confuz?', pages: [324, 325] },
  { book: 'K', kind: 'parafrază', query: 'Cheag în plămân: cu ce anticoagulant tratez?', pages: range(196, 200) },
  { book: 'K', kind: 'parafrază', query: 'Atac de cord cu supradenivelare de ST: în cât timp trebuie făcută angioplastia?', pages: [249, 250] },

  // ── Lawrence ──
  { book: 'L', kind: 'direct', query: 'Care sunt pașii evaluării primare la un politraumatizat?', pages: [30, 31, 32] },
  { book: 'L', kind: 'direct', query: 'Cum se tratează intoxicația cu monoxid de carbon?', pages: [52, 53] },
  { book: 'L', kind: 'direct', query: 'Ce operație se face în acalazie?', pages: range(90, 93), alt: { K: [296] } },
  { book: 'L', kind: 'direct', query: 'Ce înseamnă regula lui 2 la diverticulul Meckel?', pages: [127, 128] },
  { book: 'L', kind: 'direct', query: 'Tratamentul inițial al volvulusului de sigmoid', pages: [142, 143] },
  { book: 'L', kind: 'direct', query: 'Ce este triada Charcot?', pages: [27, 161, 162] },
  { book: 'L', kind: 'direct', query: 'Care sunt cauzele pancreatitei acute?', pages: [173, 174] },
  { book: 'L', kind: 'direct', query: 'Cum se tratează chistul hidatic hepatic?', pages: [194] },
  { book: 'L', kind: 'direct', query: 'Ce medicament se dă în GIST?', pages: [101, 127] },
  { book: 'L', kind: 'direct', query: 'Ce vaccinuri primește un pacient după splenectomie?', pages: [42, 204] },
  { book: 'L', kind: 'abreviere', query: 'CID postoperator', pages: [15, 16] },
  { book: 'L', kind: 'parafrază', query: 'Operăm pietrele la fiere dacă pacientul nu are simptome?', pages: [158] },
  { book: 'L', kind: 'parafrază', query: 'Inflamația apendicelui: cum se operează?', pages: [131] },
  { book: 'L', kind: 'parafrază', query: 'Cum estimăm cât din suprafața corpului este arsă?', pages: [54, 55] },

  // ── Sinopsis ──
  { book: 'S', kind: 'direct', query: 'Cu ce se tratează scabia?', pages: [5, 6] },
  { book: 'S', kind: 'direct', query: 'Care e diferența dintre pemfigus vulgar și pemfigoidul bulos?', pages: [10, 11] },
  { book: 'S', kind: 'direct', query: 'Cât trebuie să dureze simptomele pentru diagnosticul de schizofrenie?', pages: [97, 98] },
  { book: 'S', kind: 'direct', query: 'Când e nefiziologic icterul nou-născutului?', pages: [26] },
  { book: 'S', kind: 'direct', query: 'Ce antibiotice se dau în boala inflamatorie pelvină?', pages: [61, 62] },
  { book: 'S', kind: 'direct', query: 'Ce proteină lipsește în distrofia musculară Duchenne?', pages: [34, 35] },
  { book: 'S', kind: 'direct', query: 'Cum arată carcinomul bazocelular?', pages: [12] },
  { book: 'S', kind: 'direct', query: 'Ce este tulburarea de panică?', pages: [101, 102] },
  { book: 'S', kind: 'parafrază', query: 'Copil cu tuse lătrătoare și stridor: ce boală este?', pages: [20, 21] },
  { book: 'S', kind: 'parafrază', query: 'Mâncărime noaptea și șanțuri între degete: ce tratament dau?', pages: [5] },
];
