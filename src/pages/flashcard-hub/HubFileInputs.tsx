import type { RefObject } from 'react';

interface HubFileInputsProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  csvInputRef: RefObject<HTMLInputElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  onPdfFile: (file: File) => void | Promise<void>;
  onCsvFile: (file: File) => void | Promise<void>;
  onPhotoFiles: (files: File[]) => void | Promise<void>;
}

/** Cele trei <input type="file"> ascunse, declanșate din butoanele „Creează pachet nou”. */
export function HubFileInputs({ fileInputRef, csvInputRef, photoInputRef, onPdfFile, onCsvFile, onPhotoFiles }: HubFileInputsProps) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          await onPdfFile(file);
        }}
      />

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void onCsvFile(file);
          }
        }}
      />

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.currentTarget.value = '';
          if (files.length > 0) {
            void onPhotoFiles(files);
          }
        }}
      />
    </>
  );
}
