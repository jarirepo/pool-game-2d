export function constrain(val: number, minVal: number, maxVal: number): number {
  return (val < minVal) ? minVal : (val > maxVal) ? maxVal : val;
}
