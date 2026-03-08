export const clamp  = (v, min, max) => Math.min(Math.max(v, min), max);
export const round2 = (v)           => Math.round(v * 100) / 100;

export function evaluate(left, op, right) {
  const n = (v) =>
    typeof v === 'boolean' ? (v ? 1 : 0) :
    typeof v === 'string'  ? (Number.isFinite(+v) ? +v : v) : v;
  const [l, r] = [n(left), n(right)];
  switch (op) {
    case 'EQ':  return l === r;
    case 'NEQ': return l !== r;
    case 'GT':  return +l >  +r;
    case 'GTE': return +l >= +r;
    case 'LT':  return +l <  +r;
    case 'LTE': return +l <= +r;
    default:    return false;
  }
}