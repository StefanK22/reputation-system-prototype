/**
 * Math and condition utilities
 * Domain logic for numerical operations and condition evaluation
 */

/**
 * Clamp value between min and max
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round to 2 decimal places (common for reputation scores)
 */
export function round2(value) {
  const factor = Math.pow(10, 2);
  return Math.round(value * factor) / factor;
}

/**
 * Evaluate a condition with operator
 * Supports: EQ, NEQ, GT, GTE, LT, LTE
 * Normalizes boolean to number (true=1, false=0)
 * Converts strings to numbers for comparison if possible
 */
export function evaluate(leftRaw, operator, rightRaw) {
  // Normalize values for comparison
  const normalize = (val) => {
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  };

  const left = normalize(leftRaw);
  const right = normalize(rightRaw);

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

