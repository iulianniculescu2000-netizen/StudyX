import { useRef, useState, type ChangeEvent } from 'react';
import type { AIKnowledgeSource, AIKnowledgeSourceType } from '../../store/aiStore';
import { friendlyAIError } from '../../lib/ai/friendlyError';
import { INDEX_STALL_MS, readTimeoutMs, withStallGuard } from './helpers';

type AddKnowledgeSource = (
  name: string,
  text: string,
  type: AIKnowledgeSourceType,
  options?: { onIndexProgress?: (info: { percent: number }) => void; folderId?: string | null },
) => Promise<AIKnowledgeSource | undefined | void>;

interface UseVaultUploadArgs {
  activeFolderId: string | null;
  addKnowledgeSource: AddKnowledgeSource;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string) => {
  let timeoutId: ReturnType<typeof window.setTimeout>;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId!);
  }
};

const yieldToPaint = async () => {
  await new Promise<void>((resolve) => { window.setTimeout(resolve, 0); });
};

/**
 * Încărcarea fișierelor în bibliotecă: parsare, OCR, indexare, plasare în folderul activ.
 *
 * - Timeoutul de citire crește cu mărimea fișierului (un 20 s fix tăia orice carte); indexarea nu are plafon de timp,
 *   doar un detector de blocaj (fără progres 2 minute).
 * - Folderul se dă de la început sursei: dacă pagina renunță, documentul rămâne în folderul ales, nu la „Neclasificate”.
 * - Un fișier care eșuează nu oprește restul: la final se spune care au intrat și care nu.
 */
export function useVaultUpload({ activeFolderId, addKnowledgeSource, addToast }: UseVaultUploadArgs) {
  const [loading, setLoading] = useState(false);
  const [processStep, setProcessStep] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setLoading(true);
    setProcessStep(files.length > 1 ? `Pregătim ${files.length} fișiere...` : 'Pregătim documentul...');
    await yieldToPaint();

    // Determine which folder to upload into
    const targetFolderId = activeFolderId === '__unfiled__' ? null
      : (activeFolderId ?? null);

    let added = 0;
    const failed: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        const filePrefix = files.length > 1 ? `[${index + 1}/${files.length}] ` : '';
        try {
          const name = file.name.toLowerCase();
          const isPdf = name.endsWith('.pdf');
          const isDocx = name.endsWith('.docx');
          const isImage = /\.(jpe?g|png|webp|bmp)$/i.test(name);

          let text = '';
          let type: AIKnowledgeSourceType = 'txt';

          setProcessStep(`${filePrefix}Citim ${file.name}...`);
          await yieldToPaint();

          if (isPdf) {
            const { parsePDF } = await import('../../ai/pdfParser');
            text = await withTimeout(parsePDF(file), readTimeoutMs(file.size, 'pdf'), `Citirea PDF-ului ${file.name} a durat prea mult. Încearcă din nou sau împarte cartea în capitole.`);
            type = 'pdf';
          } else if (isDocx) {
            const { parseDocx } = await import('../../ai/docxParser');
            text = await withTimeout(parseDocx(file), readTimeoutMs(file.size, 'docx'), `Citirea documentului ${file.name} a durat prea mult.`);
            type = 'docx';
          } else if (isImage) {
            setProcessStep(`${filePrefix}Analizăm imaginea (OCR)...`);
            await yieldToPaint();
            const { parseImageOCR } = await import('../../ai/ocrParser');
            text = await withTimeout(parseImageOCR(file), readTimeoutMs(file.size, 'image'), `OCR-ul pentru ${file.name} durează prea mult.`);
            type = 'image';
          } else {
            text = await withTimeout(file.text(), readTimeoutMs(file.size, 'text'), `Citirea fișierului ${file.name} a expirat.`);
          }

          if (text.trim().length < 5) {
            addToast(`Conținut insuficient în ${file.name}`, 'warning');
            failed.push(file.name);
            continue;
          }

          setProcessStep(`${filePrefix}Trimitem ${file.name} în indexare...`);
          await yieldToPaint();
          await withStallGuard(
            (touch) => Promise.resolve(addKnowledgeSource(file.name, text, type, {
              folderId: targetFolderId,
              onIndexProgress: ({ percent }: { percent: number }) => {
                touch();
                setProcessStep(`${filePrefix}Indexăm ${file.name}... ${percent}%`);
              },
            })),
            INDEX_STALL_MS,
            `Indexarea pentru ${file.name} nu mai avansează. Documentul rămâne în listă; dacă rămâne blocat, șterge-l și adaugă-l din nou.`,
          );

          added += 1;
          addToast(`"${file.name}" a intrat în bibliotecă.`, 'success');
        } catch (error) {
          failed.push(file.name);
          addToast(`„${file.name}": ${friendlyAIError(error) || 'eroare la procesare'}`, 'error');
        }
      }
      if (files.length > 1) {
        addToast(
          failed.length === 0
            ? `${added} fișiere adăugate.`
            : `${added} din ${files.length} fișiere adăugate; nu au intrat: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}.`,
          failed.length === 0 ? 'success' : 'warning',
        );
      }
    } finally {
      setLoading(false);
      setProcessStep('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return { loading, processStep, fileInputRef, handleFileUpload };
}
