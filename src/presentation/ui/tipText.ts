/** 다줄·복수 문장 툴팁 문구를 불릿 항목 배열로 나눈다 */
export function splitTipLines(text: string): string[] {
  const byNewline = text.split('\n').map(line => line.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  const single = byNewline[0];
  if (!single) return [];
  return single.split(/(?<=[.!?])\s+/).map(line => line.trim()).filter(Boolean);
}
