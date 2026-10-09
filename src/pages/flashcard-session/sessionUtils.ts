export function shuffleArr<T>(array: T[]): T[] {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function getAnswerTone(answer: string, dense: boolean) {
  const length = answer.trim().length;
  if (dense) {
    if (length > 240) return 'text-sm sm:text-base font-semibold leading-relaxed';
    if (length > 150) return 'text-base sm:text-lg font-bold leading-relaxed';
    if (length > 90) return 'text-lg sm:text-xl font-bold leading-snug';
    return 'text-xl sm:text-2xl font-black leading-tight';
  }
  if (length > 260) return 'text-base sm:text-lg font-semibold leading-relaxed';
  if (length > 170) return 'text-lg sm:text-xl font-bold leading-relaxed';
  if (length > 110) return 'text-xl sm:text-2xl font-bold leading-snug';
  return 'text-2xl sm:text-3xl font-black leading-tight';
}

export function getQuestionTone(question: string, crampedHeight: boolean, dense: boolean) {
  const length = question.trim().length;

  if (dense) {
    if (length > 220) return 'text-base sm:text-lg font-bold leading-relaxed';
    if (length > 130) return 'text-lg sm:text-xl font-black leading-snug';
    return 'text-xl sm:text-2xl font-black leading-tight';
  }

  if (crampedHeight) {
    if (length > 240) return 'text-lg sm:text-xl font-bold leading-relaxed';
    if (length > 140) return 'text-xl sm:text-2xl font-black leading-snug';
    return 'text-2xl sm:text-3xl font-black leading-tight';
  }

  if (length > 260) return 'text-xl sm:text-2xl font-bold leading-relaxed';
  if (length > 150) return 'text-2xl sm:text-3xl font-black leading-snug';
  return 'text-3xl sm:text-[2.6rem] font-black leading-tight';
}
