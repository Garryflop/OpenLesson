/** Russian plural form: plural(3, "день", "дня", "дней") → "дня". */
export function plural(n: number, one: string, few: string, many: string): string {
  const n100 = Math.abs(n) % 100;
  const n10 = n100 % 10;
  if (n100 > 10 && n100 < 20) return many;
  if (n10 === 1) return one;
  if (n10 >= 2 && n10 <= 4) return few;
  return many;
}

/** English plural form: pluralEn(1, "day", "days") → "day". */
export function pluralEn(n: number, one: string, many: string): string {
  return Math.abs(n) === 1 ? one : many;
}
