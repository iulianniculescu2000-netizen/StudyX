/**
 * Counts profile loads. Work that outlives a profile switch (an AI generation, a
 * document being indexed) captures the epoch when it starts and checks it before
 * writing: the stores are global, so a result that lands after the switch would
 * otherwise be saved into the other profile. A plain "same profile id?" check is
 * not enough — A → B → A would pass it.
 */
let epoch = 0;

export function bumpProfileEpoch(): number {
  epoch += 1;
  return epoch;
}

export function currentProfileEpoch(): number {
  return epoch;
}

/** Thrown when long-running work finds that the profile changed underneath it. */
export class ProfileChangedError extends Error {
  constructor() {
    super('Profilul s-a schimbat în timpul operației, deci rezultatul nu a fost salvat.');
    this.name = 'ProfileChangedError';
  }
}

/** Capture now, call later: throws `ProfileChangedError` if a profile was loaded in between. */
export function profileGuard(): () => void {
  const startedAt = epoch;
  return () => {
    if (epoch !== startedAt) throw new ProfileChangedError();
  };
}
