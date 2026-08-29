/**
 * Money is handled in integer cents throughout (Business rules #1/#2/Money precision assumption)
 * to avoid float drift when summing currency, then converted back to a 2-decimal JSON number.
 */
export function toCents(price: string): number {
  return Math.round(Number(price) * 100);
}

export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}
