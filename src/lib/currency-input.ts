/** Round to 2 decimal places for currency amounts. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
