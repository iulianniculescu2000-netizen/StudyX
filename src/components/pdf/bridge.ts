export interface ReadResult { ok: boolean; data?: Uint8Array; error?: string; code?: string }

export interface PdfBridge {
  organizarePickRoot?: () => Promise<string | null>;
  organizareReadPdf?: (root: string, relPath: string) => Promise<ReadResult>;
  /** Găsește folderul cu Carti/Capitole pornind de la alegerea utilizatorului (subfolder, părinte, vecin). */
  organizareResolveRoot?: (root: string, expected: string[]) => Promise<{ ok: boolean; root?: string; via?: 'same' | 'parent' | 'child' | 'other'; books?: number; hasCapitole?: boolean; code?: string }>;
  /** Caută singur folderul cu materialele în locurile obișnuite (Desktop, Documente, Descărcări, Drive). */
  organizareDetectRoot?: (expected: string[]) => Promise<{ ok: boolean; root?: string; books?: number; hasCapitole?: boolean; code?: string }>;
  /** Folderul salvat pe disc, pe profil (nu depinde de originea paginii). */
  organizareRootGet?: (profileId: string) => Promise<string | null>;
  organizareRootSet?: (profileId: string, root: string | null) => Promise<boolean>;
}

/** Puntea Electron pentru citirea PDF-urilor (preload.cjs); lipsește în varianta web. */
export const bridge = (): PdfBridge | undefined => (typeof window === 'undefined' ? undefined : (window.electronAPI as unknown as PdfBridge | undefined));

/** Rădăcina-sentinelă pentru cărțile livrate cu aplicația (Electron o traduce în resources/books). */
export const BUNDLED_ROOT = 'studyx:bundled';

/** True când aplicația desktop poate citi PDF-uri din folderul ales. */
export const canReadBookPdf = () => !!bridge()?.organizareReadPdf;
