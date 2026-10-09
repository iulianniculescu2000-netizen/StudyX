import { createRequestGovernor } from '../aiRequestGovernor';

// ── Request Queue & Rate Limiting ──────────────────────────────────────────
// Two governors:
//  - groqGovernor: chat / stream / analysis / hints — serial, generous spacing
//  - generationGovernor: question generation — 2 concurrent, tighter spacing
export const groqGovernor = createRequestGovernor({ concurrency: 1, baseSpacingMs: 400 });
export const generationGovernor = createRequestGovernor({ concurrency: 2, baseSpacingMs: 450 });
// Sarcinile utilitare de fundal (titlu, rezumat, extragere de memorie): bandă proprie, ca să nu țină chatul la coadă.
export const backgroundGovernor = createRequestGovernor({ concurrency: 1, baseSpacingMs: 400 });
