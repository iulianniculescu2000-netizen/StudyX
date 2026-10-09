/** "1 card", "9 carduri", "20 de carduri" — Romanian number agreement. */
export function cardsLabel(count: number) {
  if (count === 1) return '1 card';
  const rest = count % 100;
  return rest === 0 || rest >= 20 ? `${count} de carduri` : `${count} carduri`;
}
