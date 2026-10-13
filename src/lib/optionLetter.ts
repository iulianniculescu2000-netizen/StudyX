/**
 * Litera arătată pentru a n-a variantă de răspuns (A, B, C…). Se ia după poziție, nu din id-ul intern al variantei:
 * întrebările importate sau generate au id-uri de tip „3-1-6976F9”, iar după ștergerea unei variante id-urile
 * „a, c, d” nu mai coincid cu pozițiile.
 */
export function optionLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}
