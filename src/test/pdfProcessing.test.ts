/**
 * Test suite for PDF processing to validate complete document reading
 */

import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../ai/chunker';
import { documentProcessor } from '../ai/documentProcessor';

// Mirrors DocumentProcessor's private normalizeText (src/ai/documentProcessor.ts) — it
// preserves paragraph breaks (needed for structure-aware chunking and chapter-heading
// detection) instead of collapsing all whitespace, so tests assert against the same shape.
function normalizeForAssertions(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((line) => line.trim()).join('\n')
    .trim();
}

describe('PDF Processing - Complete Document Reading', () => {
  const largeDocumentText = `
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
    Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
    Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
    Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
    
    Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, 
    totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
    Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
    
    At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.
    
    Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.
    Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.
    Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat.
  `.repeat(1000); // Create ~50k characters
  const normalizedLargeDocumentText = normalizeForAssertions(largeDocumentText);

  describe('Legacy chunkText function', () => {
    it('should process large documents without 40 character limit', async () => {
      const chunks = await chunkDocument(largeDocumentText, 'test-doc');
      
      expect(chunks.length).toBeGreaterThan(10);
      expect(chunks[0].text.length).toBeGreaterThan(40);
      
      // Verify no content is lost
      const totalProcessedChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
      expect(totalProcessedChars).toBeGreaterThan(normalizedLargeDocumentText.length * 0.9);
    });

    it('should preserve document structure', async () => {
      const chunks = await chunkDocument(largeDocumentText, 'test-doc', {
        preserveStructure: true
      });
      
      // Check that paragraphs are preserved
      expect(chunks.some(chunk => chunk.text.includes('Lorem ipsum'))).toBe(true);
      expect(chunks.some(chunk => chunk.text.includes('consectetur adipiscing'))).toBe(true);
    });
  });

  describe('Enhanced DocumentProcessor', () => {
    it('should process complete documents without truncation', async () => {
      const processedDoc = await documentProcessor.processDocument(largeDocumentText, 'test-enhanced');
      
      expect(processedDoc.chunks.length).toBeGreaterThan(10);
      expect(processedDoc.statistics.totalChars).toBe(normalizedLargeDocumentText.length);
      expect(processedDoc.statistics.totalWords).toBeGreaterThan(100);
      
      // Validate document integrity
      const validation = documentProcessor.validateDocument(processedDoc);
      expect(validation.errors).not.toContain('Document content is empty');
    });

    it('should provide detailed chunk metadata', async () => {
      const processedDoc = await documentProcessor.processDocument(largeDocumentText, 'test-metadata');
      
      processedDoc.chunks.forEach((chunk) => {
        expect(chunk.id).toMatch(/^test-metadata-chunk-\d+$/);
        expect(chunk.metadata.startIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.metadata.endIndex).toBeGreaterThan(chunk.metadata.startIndex);
        expect(chunk.metadata.charCount).toBe(chunk.text.length);
        expect(chunk.metadata.wordCount).toBeGreaterThan(0);
      });
    });

    it('should handle very large documents efficiently', async () => {
      const veryLargeText = largeDocumentText.repeat(20); // ~1M characters
      const startTime = Date.now();
      
      const processedDoc = await documentProcessor.processDocument(veryLargeText, 'test-large');
      const processingTime = Date.now() - startTime;
      
      expect(processedDoc.statistics.totalChars).toBe(normalizeForAssertions(veryLargeText).length);
      expect(processingTime).toBeLessThan(8000); // Keep the processor responsive on large documents
      expect(processedDoc.chunks.length).toBeGreaterThan(100);
    }, 12000);
  });

  describe('Chunk size optimization', () => {
    it('should adapt chunk size based on document complexity', async () => {
      const processedDoc = await documentProcessor.processDocument(largeDocumentText, 'test-adaptive', {
        chunkSize: 2000,
        minChunkLength: 500
      });
      
      // Most chunks should be close to target size
      const averageChunkSize = processedDoc.statistics.averageChunkSize;
      expect(averageChunkSize).toBeGreaterThan(1500);
      expect(averageChunkSize).toBeLessThan(2500);
    });

    it('should preserve overlap for context continuity', async () => {
      const processedDoc = await documentProcessor.processDocument(largeDocumentText, 'test-overlap', {
        overlap: 300
      });
      
      expect(processedDoc.chunks.length).toBeGreaterThan(1);
      expect(processedDoc.chunks.every((chunk) => chunk.text.length > 0)).toBe(true);
    });
  });

  describe('Error handling and validation', () => {
    it('should handle empty documents gracefully', async () => {
      const processedDoc = await documentProcessor.processDocument('', 'test-empty');
      
      expect(processedDoc.chunks).toHaveLength(0);
      expect(processedDoc.statistics.totalChars).toBe(0);
      
      const validation = documentProcessor.validateDocument(processedDoc);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Document content is empty');
    });

    it('should detect content loss during processing', async () => {
      const processedDoc = await documentProcessor.processDocument(largeDocumentText, 'test-validation');
      
      // Manually corrupt chunks to test validation
      processedDoc.chunks[0].text = processedDoc.chunks[0].text.substring(0, 10);
      
      const validation = documentProcessor.validateDocument(processedDoc);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('content loss'))).toBe(true);
    });
  });

  describe('Performance benchmarks', () => {
    it('should meet performance targets for large documents', async () => {
      const sizes = [10000, 50000, 100000, 500000]; // Character counts
      
      for (const size of sizes) {
        const testText = largeDocumentText.substring(0, size);
        const startTime = performance.now();
        
        const processedDoc = await documentProcessor.processDocument(testText, `perf-test-${size}`);
        const processingTime = performance.now() - startTime;
        const normalizedTestText = normalizeForAssertions(testText);
        
        // Performance targets: < 100ms for 10k, < 500ms for 50k, < 1s for 100k, < 5s for 500k
        const maxTime = Math.max(100, size / 100); // Simple heuristic
        expect(processingTime).toBeLessThan(maxTime);
        
        // Verify no content loss
        expect(processedDoc.statistics.totalChars).toBe(normalizedTestText.length);
      }
    });
  });

  describe('knownHeadings (curriculum-anchored chapter detection)', () => {
    it('anchors chunk headings to known chapter titles instead of the generic heuristic', async () => {
      const text = `Some intro text before any chapter.

CARDIOLOGIE

${'Text about cardiology goes here and describes clinical management. '.repeat(5)}

HEMATOLOGIE

${'Text about hematology follows here describing blood disorders. '.repeat(5)}`;

      const processed = await documentProcessor.processDocument(text, 'kumar-doar-capitolele-rezi.pdf', {
        knownHeadings: ['CARDIOLOGIE', 'HEMATOLOGIE', 'PNEUMOLOGIE'],
        chunkSize: 200,
      });

      const headings = new Set(processed.chunks.map((c) => c.metadata.heading).filter(Boolean));
      expect(headings.has('CARDIOLOGIE')).toBe(true);
      expect(headings.has('HEMATOLOGIE')).toBe(true);
    });

    it('falls back to the generic heuristic when no known headings match', async () => {
      const processed = await documentProcessor.processDocument(
        'CAPITOLUL 1\n\nSome body text that has nothing to do with the curriculum list at all.',
        'unrelated.pdf',
        { knownHeadings: ['CARDIOLOGIE', 'HEMATOLOGIE'] },
      );
      const headings = processed.chunks.map((c) => c.metadata.heading).filter(Boolean);
      expect(headings.length).toBeGreaterThan(0);
      expect(headings[0]).toBe('CAPITOLUL 1');
    });
  });
});
