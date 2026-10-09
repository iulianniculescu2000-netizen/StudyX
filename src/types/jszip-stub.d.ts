/**
 * TYPE-ONLY stand-in for `jszip`, used exclusively via `tsconfig.app.json`'s `paths`
 * mapping so TypeScript type-checks against this instead of jszip's own shipped
 * `index.d.ts` (which unconditionally does `/// <reference types="node" />` and
 * leaks Node's ambient `setTimeout`/`Timeout` globals into this browser-only
 * project's whole compilation — a real, confirmed conflict, not theoretical).
 *
 * Vite's runtime bundling is untouched: `paths` only affects TypeScript's type
 * resolution, not the actual `import JSZip from 'jszip'` at build/run time, which
 * still resolves to the real npm package.
 *
 * Covers only the subset of the API actually used in `src/lib/anki/ankiParser.ts`.
 */
export interface JSZipObject {
  name: string;
  dir: boolean;
  async(type: 'string'): Promise<string>;
  async(type: 'uint8array'): Promise<Uint8Array>;
  async(type: 'arraybuffer'): Promise<ArrayBuffer>;
  async(type: 'blob'): Promise<Blob>;
}

export default class JSZip {
  static loadAsync(data: File | Blob | ArrayBuffer | Uint8Array): Promise<JSZip>;
  file(name: string): JSZipObject | null;
}
