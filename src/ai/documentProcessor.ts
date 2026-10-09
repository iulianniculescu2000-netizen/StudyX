/**
 * Enhanced document processor for large PDF files
 * Handles complete document reading without truncation
 */

/**
 * Recurring clinical-note field labels ("Tratament", "Etiologie", "Tablou
 * clinic"...) that Romanian medical exam-prep books repeat under every single
 * disease entry. They have the exact shape of a heading (short, no terminal
 * punctuation, sometimes numbered) but aren't real topics — promoting them
 * fragments one disease into a dozen fake "chapters" instead of one. Compared
 * against `normalizeForHeadingMatch(...)` output, so case/diacritics don't
 * matter here.
 */
const GENERIC_MEDICAL_FIELD_LABELS = new Set([
  'DEFINITIE', 'CAUZE', 'FACTORI DE RISC', 'EPIDEMIOLOGIE', 'ETIOLOGIE',
  'FIZIOPATOLOGIE', 'PATOGENEZA', 'MORFOPATOLOGIE', 'MECANISM',
  'MECANISM DE ACTIUNE', 'TABLOU CLINIC', 'SIMPTOME', 'SEMNE',
  'DIAGNOSTIC', 'DIAGNOSTIC DIFERENTIAL', 'INVESTIGATII', 'EVALUARE',
  'TRATAMENT', 'UTILIZARE CLINICA', 'EFECTE ADVERSE', 'COMPLICATII',
  'PROGNOSTIC', 'PROFILAXIE', 'DESCRIERE', 'ANATOMIE', 'FIZIOLOGIE',
  'TIPURI', 'EXEMPLE', 'PUNCTE', 'PUNCTE CHEIE', 'REZUMAT',
  'LECTURI SUPLIMENTARE', 'BIBLIOGRAFIE RECOMANDATA', 'INTREBARI',
  'MODELE DE INTREBARI', 'NORMAL', 'LABORATOR', 'IMAGISTICA',
]);

export interface DocumentProcessingOptions {
  chunkSize?: number;
  overlap?: number;
  minChunkLength?: number;
  preserveStructure?: boolean;
  /** When the uploaded source matches a known reference book, its real chapter titles —
   *  checked before the generic heading heuristic, higher precision for those books. */
  knownHeadings?: string[];
}

export interface ProcessedDocument {
  id: string;
  name: string;
  content: string;
  chunks: Array<{
    id: string;
    text: string;
    metadata: {
      startIndex: number;
      endIndex: number;
      wordCount: number;
      charCount: number;
      /** Nearest preceding detected heading/chapter title, if any (best-effort). */
      heading?: string;
    };
  }>;
  statistics: {
    totalChars: number;
    totalWords: number;
    totalChunks: number;
    averageChunkSize: number;
    processingTime: number;
  };
}

interface PreparedHeading {
  title: string;
  normalized: string;
  prefix: string | null;
  words: string[];
}

export class DocumentProcessor {
  private preparedHeadings = new WeakMap<string[], PreparedHeading[]>();
  private defaultOptions: DocumentProcessingOptions = {
    chunkSize: 1500,
    overlap: 200,
    minChunkLength: 100,
    preserveStructure: true
  };
  private options: DocumentProcessingOptions;

  constructor(options: DocumentProcessingOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Process document text into chunks without truncation
   */
  async processDocument(
    text: string,
    sourceName: string,
    options?: DocumentProcessingOptions
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();
    const processingOptions = { ...this.options, ...options };
    
    // Normalize text
    const normalizedText = this.normalizeText(text);
    
    // Extract metadata
    const statistics = this.extractStatistics(normalizedText);
    
    // Create chunks
    const chunks = this.createChunks(normalizedText, sourceName, processingOptions);
    
    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      name: sourceName,
      content: normalizedText,
      chunks,
      statistics: {
        ...statistics,
        totalChunks: chunks.length,
        // Guard the empty-document case: dividing by 0 produced NaN, which
        // serializes to null and poisons any stats UI reading it.
        averageChunkSize: chunks.length > 0 ? Math.round(statistics.totalChars / chunks.length) : 0,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Normalize text for processing. Preserves paragraph breaks (needed for
   * createStructureAwareChunks' paragraph split and heading detection) — only
   * horizontal whitespace and excessive blank lines get collapsed.
   */
  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n').map((line) => line.trim()).join('\n')
      .trim();
  }

  /**
   * Extract document statistics
   */
  private extractStatistics(text: string) {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return {
      totalChars: text.length,
      totalWords: words.length
    };
  }

  /**
   * Create chunks preserving document structure
   */
  private createChunks(
    text: string,
    sourceName: string,
    options: DocumentProcessingOptions
  ) {
    const { chunkSize = 1500, overlap = 200, minChunkLength = 100, preserveStructure = true, knownHeadings } = options;

    // The curated list only earns "authoritative, skip the generic heuristic"
    // trust (see isolateHeadings/createStructureAwareChunks) once it's proven
    // to actually apply to THIS text — a book matched to the wrong curriculum
    // entry, or a random unrelated document sharing a name pattern, should
    // still fall back to the generic heuristic rather than come back with zero
    // headings at all.
    const effectiveKnownHeadings =
      knownHeadings?.length && this.hasAnyKnownHeadingMatch(text, knownHeadings) ? knownHeadings : undefined;

    if (preserveStructure) {
      return this.createStructureAwareChunks(text, sourceName, chunkSize, overlap, minChunkLength, effectiveKnownHeadings);
    } else {
      return this.createSimpleChunks(text, sourceName, chunkSize, overlap, minChunkLength);
    }
  }

  /**
   * Diacritics/case-insensitive normalization shared by known-heading matching.
   */
  private normalizeForHeadingMatch(text: string): string {
    return text
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Whether at least one known heading actually appears somewhere in the text, line by line. */
  private hasAnyKnownHeadingMatch(text: string, knownHeadings: string[]): boolean {
    return text.split('\n').some((line) => this.matchesKnownHeading(line, knownHeadings) !== null);
  }

  /**
   * Authoritative match against a known reference book's real chapter titles — checked
   * before the generic heuristic, since it's far less likely to false-positive/negative.
   */
  private matchesKnownHeading(paragraph: string, knownHeadings: string[]): string | null {
    const trimmed = paragraph.trim();
    if (!trimmed || trimmed.includes('\n') || trimmed.length > 120) return null;
    const normalizedParagraph = this.normalizeForHeadingMatch(trimmed);
    let squashedLine: string | undefined;

    // The curriculum title is returned rather than the printed line, so every
    // chunk of a chapter is filed under one canonical name.
    for (const heading of this.prepareHeadings(knownHeadings)) {
      if (normalizedParagraph.includes(heading.normalized)) return heading.title;

      // Long titles ("INFECȚII TRANSMISIBILE PE CALE SEXUALĂ ȘI …") are wrapped
      // onto two lines in the printed book, so the full string never appears on
      // one line. A distinctive prefix is enough to anchor the chapter.
      if (heading.prefix !== null && normalizedParagraph.includes(heading.prefix)) return heading.title;

      squashedLine ??= normalizedParagraph.replace(/\s+/g, '');
      if (this.matchesSquashedTitle(squashedLine, heading.words)) return heading.title;
    }
    return null;
  }

  /**
   * Normalised form, prefix and significant words of every curated title, computed once per
   * list (matching runs for every line of a multi-megabyte book, up to three times).
   */
  private prepareHeadings(knownHeadings: string[]): PreparedHeading[] {
    let prepared = this.preparedHeadings.get(knownHeadings);
    if (!prepared) {
      prepared = knownHeadings.map((title) => {
        const normalized = this.normalizeForHeadingMatch(title);
        return {
          title,
          normalized,
          prefix: this.headingPrefix(normalized),
          words: normalized.split(' ').filter((word) => word.length >= 5),
        };
      });
      this.preparedHeadings.set(knownHeadings, prepared);
    }
    return prepared;
  }

  /** First words of a long chapter title — only when they stay distinctive enough. */
  private headingPrefix(normalizedHeading: string): string | null {
    const words = normalizedHeading.split(' ');
    if (words.length < 6) return null;
    const prefix = words.slice(0, 4).join(' ');
    return prefix.length >= 24 ? prefix : null;
  }

  /**
   * Last-resort match for titles the extractor breaks up mid-word.
   *
   * Some scanned books yield glyph runs like "AFECTIUNI LE GINECOLOGICE SI
   * MAMA RE" for "AFECȚIUNI GINECOLOGICE ȘI MAMARE" — spaces inside words plus
   * an inflected ending. Comparing with all whitespace removed repairs the
   * split words, and requiring every significant word of the title to appear in
   * order keeps this from matching unrelated lines.
   */
  private matchesSquashedTitle(squashedLine: string, words: string[]): boolean {
    if (words.length < 2) return false;

    let cursor = 0;
    for (const word of words) {
      const at = squashedLine.indexOf(word, cursor);
      if (at === -1) return false;
      cursor = at + word.length;
    }
    return true;
  }

  /**
   * Promotes heading lines to standalone paragraphs.
   *
   * Extracted books arrive as long runs of single-newline lines with almost no
   * blank lines, so a chapter title would otherwise be swallowed by the
   * paragraph around it and every chunk would end up with no chapter at all.
   */
  private isolateHeadings(text: string, knownHeadings?: string[]): string {
    if (!text.includes('\n')) return text;

    const lines = text.split('\n');
    const out: string[] = [];
    // When this book has a curated, verified chapter list (residencyCurriculum.ts —
    // matched against the official exam Tematica), that list is authoritative and
    // COMPLETE for real top-level structure. Also running the generic heuristic in
    // that case used to "detect" a heading out of every ALL-CAPS fragment, numbered
    // list item, chemical formula, or stray sentence in the book — the real chapters
    // (CARDIOLOGIE, HEMATOLOGIE, ...) ended up buried among dozens of one-line noise
    // entries like "CH 20COCH" or "capilarelor şi atinge concentraţii...". Without a
    // curated list (any book the user adds themselves), the heuristic is still the
    // only option, so it stays as the fallback.
    const isCandidate = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (knownHeadings?.length) return this.matchesKnownHeading(trimmed, knownHeadings) !== null;
      return this.isLikelyHeading(trimmed);
    };

    let i = 0;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (isCandidate(lines[i])) {
        // A real title that's too long for one line in the printed book wraps
        // onto a second physical line that ALSO looks like its own
        // heading-shaped line ("PACIENTUL CU" / "DISFUNCTIE RENALĂ") — merge
        // consecutive heading-shaped lines into one before treating them as a
        // heading, so the chapter list shows the whole title instead of a
        // truncated half. Capped at 2 lines / 80 chars combined so a run of
        // unrelated short ALL-CAPS lines doesn't get glued into one heading.
        let merged = trimmed;
        let next = i + 1;
        if (next < lines.length && isCandidate(lines[next]) && merged.length <= 50) {
          const candidate = `${merged} ${lines[next].trim()}`;
          if (candidate.length <= 80) {
            merged = candidate;
            next += 1;
          }
        }
        if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
        out.push(merged);
        out.push('');
        i = next;
        continue;
      }
      out.push(lines[i]);
      i += 1;
    }

    return out.join('\n');
  }

  /**
   * Best-effort check for whether a single paragraph is a chapter/section heading
   * rather than body text — short single line, no sentence-ending punctuation,
   * and either an explicit chapter/section marker or a short all-caps title.
   * Conservative on purpose: under-detecting just falls back to one "whole
   * document" bucket in the UI, over-detecting would fragment chapters wrongly.
   */
  private isLikelyHeading(paragraph: string): boolean {
    const trimmed = paragraph.trim();
    if (!trimmed || trimmed.includes('\n')) return false;
    if (trimmed.length < 3 || trimmed.length > 80) return false;
    if (/[.!?]$/.test(trimmed)) return false;

    // Strip a leading "N." / "N.N" numbering before comparing against the
    // generic-label blocklist — "6. Tratament" is the same recurring field as
    // bare "Tratament".
    const withoutNumbering = trimmed.replace(/^\d+(\.\d+){0,3}\.?\s+/, '');
    if (GENERIC_MEDICAL_FIELD_LABELS.has(this.normalizeForHeadingMatch(withoutNumbering))) return false;

    if (/^(cap(itolul)?|chapter|partea|sec(ț|t)iunea)\s*[\divxlcIVXLC]+/i.test(trimmed)) return true;
    if (/^\d+(\.\d+){0,3}\.?\s+[A-ZĂÂÎȘȚ]/.test(trimmed)) {
      // Same numeric-prefix shape also matches numbered clinical facts under a
      // disease topic ("2. Etiologie = ...", "3. Tratament= boala este
      // autolimitată; steroizi topici") — common in exam-prep books structured
      // as disease → numbered fields. A real numbered heading ("1.2 Diagnostic
      // diferențial") is a short title: no "=" (field/value marker) and no
      // internal comma (that's prose, not a title).
      // Also reject cryptic short fragments ("2. 1/E") — too short to be a
      // real title once the numbering is removed — and full declarative facts
      // ("Cel mai frecvent defect cardiac congenital") — real topic names
      // (disease/drug names) run 1-3 words, a recall-fact reads as a clause.
      const wordCount = withoutNumbering.split(/\s+/).filter(Boolean).length;
      return !trimmed.includes('=') && !trimmed.includes(',') && trimmed.length <= 50
        && withoutNumbering.length >= 6 && wordCount <= 3;
    }

    // Figure/diagram text ("----LH", "?--DHEA", "47XXX") is mostly digits and
    // punctuation with a token of letters riding along — trivially "already
    // uppercase" since it has nothing lowercase to differ from. Counting actual
    // letters (not just overall length) and rejecting comma/paren clutter
    // filters that out while keeping real short all-caps titles.
    const letterCount = (trimmed.match(/[a-zA-ZĂÂÎȘȚăâîșț]/g) ?? []).length;
    const hasClutter = /[,()]/.test(trimmed);
    // A running header split by OCR into single letters ("D E R M AT O L O G I
    // E") reads as one word once collapsed, but as tokens it's mostly
    // single-character fragments — a shape a real title never has.
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const singleCharTokens = tokens.filter((token) => token.length === 1).length;
    const looksLetterSpaced = tokens.length >= 3 && singleCharTokens / tokens.length >= 0.5;
    if (
      letterCount >= 4 && !hasClutter && !looksLetterSpaced
      && trimmed === trimmed.toUpperCase() && trimmed.length >= 5 && trimmed.length <= 60
    ) return true;

    return false;
  }

  /**
   * Create structure-aware chunks (preserves paragraphs and sections)
   */
  private createStructureAwareChunks(
    text: string,
    sourceName: string,
    chunkSize: number,
    overlap: number,
    minChunkLength: number,
    knownHeadings?: string[]
  ) {
    const entries: Array<{ text: string; heading?: string }> = [];
    const paragraphs = this.isolateHeadings(text, knownHeadings).split(/\n\s*\n/);
    let currentChunk = '';
    let currentHeading: string | undefined;

    /**
     * Trailing slice of a chunk, repeated at the start of the next one so a
     * sentence split across the boundary is still searchable from both sides.
     * Cut at a word boundary to avoid starting on half a word.
     */
    const tailFor = (chunkText: string): string => {
      if (overlap <= 0) return '';
      if (chunkText.length <= overlap) return chunkText;
      const slice = chunkText.slice(-overlap);
      const boundary = slice.search(/\s/);
      return boundary >= 0 ? slice.slice(boundary + 1) : slice;
    };

    const push = (chunkText: string) => {
      const trimmed = chunkText.trim();
      if (trimmed.length > 0) entries.push({ text: trimmed, heading: currentHeading });
    };

    for (const raw of paragraphs) {
      const paragraph = raw.trim();
      if (!paragraph) continue;

      const knownHeading = knownHeadings?.length ? this.matchesKnownHeading(paragraph, knownHeadings) : null;
      // Same "curated list is authoritative" rule as isolateHeadings above — see
      // the comment there for why the generic heuristic is skipped entirely
      // when a verified chapter list exists for this book.
      const isHeading = knownHeadings?.length ? knownHeading !== null : this.isLikelyHeading(paragraph);

      if (isHeading) {
        // A chapter title closes the previous chapter's chunk before becoming
        // the current heading — otherwise the previous chapter's trailing text
        // is stored under the NEW chapter's name, and a chapter short enough to
        // sit beside the next one vanishes from the chapter list entirely.
        // Deliberately no overlap here: carrying text across a chapter boundary
        // would reintroduce exactly that mix-up.
        push(currentChunk);
        currentChunk = '';
        currentHeading = knownHeading ?? paragraph;
      }

      const potentialChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      if (potentialChunk.length <= chunkSize) {
        currentChunk = potentialChunk;
        continue;
      }

      const carry = tailFor(currentChunk.trim());
      push(currentChunk);
      currentChunk = '';

      if (paragraph.length > chunkSize) {
        this.splitOversizedText(paragraph, chunkSize).forEach(push);
      } else {
        currentChunk = carry ? `${carry}\n\n${paragraph}` : paragraph;
      }
    }
    push(currentChunk);

    // Fold an undersized chunk into the previous one from the SAME chapter.
    // Merging rather than dropping means `minChunkLength` can never lose text.
    const merged: Array<{ text: string; heading?: string }> = [];
    for (const entry of entries) {
      const previous = merged[merged.length - 1];
      const fitsInPrevious = previous
        && entry.text.length < minChunkLength
        && previous.heading === entry.heading
        && previous.text.length + entry.text.length + 2 <= chunkSize;

      if (fitsInPrevious) {
        previous.text = `${previous.text}\n\n${entry.text}`;
        continue;
      }
      merged.push({ ...entry });
    }

    let globalIndex = 0;
    return merged.map((entry, index) => {
      const chunk = this.createChunk(entry.text, sourceName, index, globalIndex, entry.heading);
      globalIndex += entry.text.length;
      return chunk;
    });
  }

  /**
   * Create simple chunks (fixed size)
   */
  private createSimpleChunks(
    text: string,
    sourceName: string,
    chunkSize: number,
    overlap: number,
    minChunkLength: number
  ) {
    void minChunkLength;
    const chunks: Array<{
      id: string;
      text: string;
      metadata: { startIndex: number; endIndex: number; wordCount: number; charCount: number; };
    }> = [];

    let index = 0;
    let position = 0;

    while (position < text.length) {
      let end = Math.min(position + chunkSize, text.length);
      let chunk = text.slice(position, end);

      // Apply overlap if not the first chunk
      if (position > 0 && overlap > 0) {
        const overlapStart = Math.max(0, position - overlap);
        chunk = text.slice(overlapStart, end);
        position = overlapStart;
      }

      // Ensure minimum chunk length (disabled - include all content)
      if (chunk.length < 1 && end < text.length) {
        end = Math.min(position + 1, text.length);
        chunk = text.slice(position, end);
      }

      chunks.push(this.createChunk(chunk, sourceName, index++, position));
      position = end;
    }

    return chunks;
  }

  /**
   * Split oversized text into smaller pieces
   */
  private splitOversizedText(text: string, maxSize: number): string[] {
    if (text.length <= maxSize) return [text];

    const chunks: string[] = [];
    const separators = ['\n\n', '\n', '. ', '; ', ', ', ' '];

    for (const separator of separators) {
      if (!text.includes(separator)) continue;

      // Re-attach the punctuation part of the separator ("." of ". ") to the part it
      // ended; splitting used to drop it, so every chunk lost its final period.
      const closing = separator.trimEnd();
      const gap = separator.slice(closing.length);
      const parts = text.split(separator).map((part, i, all) => (i < all.length - 1 ? part + closing : part));
      const result: string[] = [];
      let current = '';

      for (const part of parts) {
        const next = current ? `${current}${gap}${part}` : part;
        if (next.length <= maxSize) {
          current = next;
          continue;
        }

        if (current.trim().length > 0) {
          result.push(current.trim());
        }

        if (part.length > maxSize) {
          result.push(...this.splitOversizedText(part, maxSize));
          current = '';
        } else {
          current = part;
        }
      }

      if (current.trim().length > 0) {
        result.push(current.trim());
      }

      if (result.length > 1) return result;
    }

    // Fallback: fixed-size chunks
    for (let start = 0; start < text.length; start += maxSize) {
      const chunk = text.slice(start, start + maxSize).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }

  /**
   * Create chunk object with metadata
   */
  private createChunk(
    text: string,
    sourceName: string,
    index: number,
    startIndex: number,
    heading?: string
  ) {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return {
      id: `${sourceName}-chunk-${index}`,
      text: text.trim(),
      metadata: {
        startIndex,
        endIndex: startIndex + text.length,
        wordCount: words.length,
        charCount: text.length,
        ...(heading ? { heading } : {}),
      }
    };
  }

  /**
   * Validate processed document
   */
  validateDocument(doc: ProcessedDocument): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!doc.content || doc.content.length === 0) {
      errors.push('Document content is empty');
    }

    if (doc.chunks.length === 0) {
      errors.push('No chunks were created');
    }

    if (doc.statistics.totalChunks !== doc.chunks.length) {
      errors.push('Chunk count mismatch');
    }

    // Verify no content is lost. Chunks legitimately repeat the tail of the
    // previous chunk (overlap) and are joined with different whitespace than the
    // source, so a raw length difference reports "loss" for any multi-chunk
    // document. Only a SHORTFALL in non-whitespace characters means text went missing.
    const nonWs = (value: string) => value.replace(/\s+/g, '').length;
    const missing = nonWs(doc.content) - nonWs(doc.chunks.map(chunk => chunk.text).join(' '));
    // Overlap can hide a shortfall in the total, so also check every chunk against the word count recorded when it was cut:
    // a chunk that lost a large part of its words is a real loss however big the document is.
    const wordsIn = (value: string) => value.split(/\s+/).filter(word => word.length > 0).length;
    const truncatedChunk = doc.chunks.some((chunk) => {
      const lost = chunk.metadata.wordCount - wordsIn(chunk.text);
      return lost >= 5 && lost > chunk.metadata.wordCount * 0.3;
    });
    if (missing > Math.max(100, nonWs(doc.content) * 0.005) || truncatedChunk) {
      errors.push('Significant content loss detected during chunking');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const documentProcessor = new DocumentProcessor();

export default DocumentProcessor;
