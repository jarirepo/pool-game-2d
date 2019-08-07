const { floor, pow } = Math;

export function constrain(val: number, minVal: number, maxVal: number): number {
  return (val < minVal) ? minVal : (val > maxVal) ? maxVal : val;
}

export function roundTo(value: number, n = 1): number {
  const p = pow(10, n);
  return floor(value * p + .5) / p;
}

export function bitmask(n: number): number {
  return pow(2, n) - 1;
}
