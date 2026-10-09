import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suprascrie folderul sursă cu variabila de mediu REZI_ROOT.
const ROOT_DIR = path.join(process.env.REZI_ROOT ?? 'C:/Users/Iulia/Desktop/Rezidentiat', 'Capitole');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'data', 'rezidentiat', 'capitole_db.json');

async function extractPdfText(filePath) {
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text.trim();
  } catch (err) {
    console.error(`Error reading PDF ${filePath}:`, err.message);
    return '';
  }
}

async function extractDocxText(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.trim();
  } catch (err) {
    console.error(`Error reading DOCX ${filePath}:`, err.message);
    return '';
  }
}

async function processDirectory(dirPath, database = {}, currentPath = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      const newPath = [...currentPath, entry.name];
      await processDirectory(fullPath, database, newPath);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      let content = '';

      if (ext === '.pdf') {
        console.log(`Processing PDF: ${entry.name}`);
        content = await extractPdfText(fullPath);
      } else if (ext === '.docx') {
        console.log(`Processing DOCX: ${entry.name}`);
        content = await extractDocxText(fullPath);
      } else if (ext === '.txt') {
        console.log(`Processing TXT: ${entry.name}`);
        content = fs.readFileSync(fullPath, 'utf8').trim();
      }

      if (content) {
        let currentNode = database;
        // Build the tree hierarchy based on folder structure
        for (const segment of currentPath) {
          if (!currentNode[segment]) {
            currentNode[segment] = { _files: [] };
          }
          currentNode = currentNode[segment];
        }
        
        // Add file content
        if (!currentNode._files) currentNode._files = [];
        currentNode._files.push({
          fileName: entry.name,
          text: content
        });
      }
    }
  }
  return database;
}

async function main() {
  console.log(`Starting extraction from: ${ROOT_DIR}`);
  const db = await processDirectory(ROOT_DIR);
  
  // Create output directory if it doesn't exist
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log(`\nSuccess! Database saved to ${OUTPUT_FILE}`);
  
  // Stats
  const statSize = fs.statSync(OUTPUT_FILE).size / (1024 * 1024);
  console.log(`Database size: ${statSize.toFixed(2)} MB`);
}

main().catch(console.error);
