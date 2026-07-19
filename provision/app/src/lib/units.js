// Unit pluralisation. Naive `unit + 's'` produces "bunchs" and "eachs"; measure
// abbreviations (lb, kg, L) are conventionally invariant. Kept in one place so every
// surface says the same thing.
const INVARIANT = new Set(['each', 'lb', 'kg', 'L', 'g', 'ml', 'oz']);

export function plural(n, unit) {
  if (!unit) return '';
  if (Number(n) === 1 || INVARIANT.has(unit)) return unit;
  return /(s|x|z|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

// "12 bottles" / "1 bunch" / "6 lb"
export const qty = (n, unit) => `${n} ${plural(n, unit)}`;
