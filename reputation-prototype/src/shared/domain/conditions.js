function normalizeComparable(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const maybeNum = Number(value);
    if (Number.isFinite(maybeNum)) {
      return maybeNum;
    }
    return value;
  }

  return value;
}

export function evaluateCondition(leftRaw, operator, rightRaw) {
  const left = normalizeComparable(leftRaw);
  const right = normalizeComparable(rightRaw);

  switch (operator) {
    case 'EQ':
      return left === right;
    case 'NEQ':
      return left !== right;
    case 'GT':
      return Number(left) > Number(right);
    case 'GTE':
      return Number(left) >= Number(right);
    case 'LT':
      return Number(left) < Number(right);
    case 'LTE':
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}
