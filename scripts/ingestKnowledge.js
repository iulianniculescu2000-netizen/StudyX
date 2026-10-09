import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure paths
// Folderul cu materialele sursă; suprascrie-l cu variabila de mediu REZI_ROOT.
const REZI_ROOT = process.env.REZI_ROOT ?? 'C:/Users/Iulia/Desktop/Rezidentiat';
const BOOKS_DIR = path.join(REZI_ROOT, 'Carti');
const CAPITOLE_DIR = path.join(REZI_ROOT, 'Capitole');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'data', 'rezidentiat', 'knowledge_db.jsonl');

async function processPdfFile(filePath, category, sourceName, outputStream) {
  console.log(`\nProcessing PDF: ${sourceName} (${category})`);
  
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

    const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data: dataBuffer }).promise;
    
    let bufferText = '';
    const numPages = doc.numPages;
    console.log(`Total pages to process: ${numPages}`);
    
    // Process page by page to avoid RAM overflow on 130MB books
    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(' ').trim();
        
        if (pageText.length > 50) {
          // Chunk the page if it's too large, but for JSONL we can just store the whole page as a chunk
          const record = {
            id: `${sourceName.replace(/[^a-zA-Z0-9]/g, '')}_pg${i}`,
            source: sourceName,
            category: category,
            page: i,
            text: pageText.replace(/\s+/g, ' ') // Normalize spaces
          };
          
          outputStream.write(JSON.stringify(record) + '\n');
        }
        
        if (i % 50 === 0) {
          console.log(`Progress ${sourceName}: Page ${i}/${numPages}`);
        }
      } catch (pageErr) {
        console.warn(`Failed to process page ${i} of ${sourceName}`);
      }
    }
    
    console.log(`Completed PDF: ${sourceName}`);
  } catch (err) {
    console.error(`Error loading PDF ${filePath}:`, err.message);
  }
}

async function main() {
  console.log('--- STARTING MASSIVE INGESTION PIPELINE ---');
  
  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Use a write stream to avoid RAM explosion (writing line by line)
  const outputStream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w', encoding: 'utf8' });

  // 1. Process "Carti"
  if (fs.existsSync(BOOKS_DIR)) {
    const books = fs.readdirSync(BOOKS_DIR);
    for (const book of books) {
      if (book.toLowerCase().endsWith('.pdf')) {
        await processPdfFile(path.join(BOOKS_DIR, book), 'Carte Oficială', book, outputStream);
      }
    }
  }

  // 2. We can also add "Capitole" processing here (omitted in this block to keep test fast, will expand later)

  outputStream.end();
  
  outputStream.on('finish', () => {
    const statSize = fs.statSync(OUTPUT_FILE).size / (1024 * 1024);
    console.log(`\n✅ PIPELINE SUCCESS! Database saved to ${OUTPUT_FILE}`);
    console.log(`Final Database size: ${statSize.toFixed(2)} MB`);
  });
}

main().catch(console.error);
