import ConfirmDialog from '../ConfirmDialog';
import type { RenameCheck } from '../../hooks/useReindexSources';

/** Întrebarea „fișierul are alt nume decât cartea; îl folosim?”, în dialogul aplicației (nu cel nativ al sistemului). */
export default function ReindexNameConfirm({ check, onAnswer }: { check: RenameCheck | null; onAnswer: (accepted: boolean) => void }) {
  return (
    <ConfirmDialog
      open={check !== null}
      variant="warning"
      title="Alt nume de fișier"
      description={check ? `Fișierul „${check.fileName}" are alt nume decât „${check.sourceName}". Îl folosim pentru a reindexa „${check.sourceName}"? Indexul vechi rămâne neschimbat dacă ceva nu merge.` : undefined}
      confirmLabel="Folosește fișierul"
      cancelLabel="Anulează"
      onConfirm={() => onAnswer(true)}
      onCancel={() => onAnswer(false)}
    />
  );
}
