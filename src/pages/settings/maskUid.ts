/** uid 화면 표시 — 가운데 세 마디(4자 × 3)를 가린다.
 *  어깨너머·스크린샷·방송으로 새는 걸 줄이되, 앞 8자·뒤 12자는 남겨 "그 계정 맞나"를 눈으로
 *  확인할 수 있게 한다. **복사는 항상 전체 값**이다 — 가리는 건 화면뿐이고 문의에는 전체가 필요하다.
 *    fa224eb3-4486-4e9d-b821-5765495da903 → fa224eb3-****-****-****-5765495da903
 *  uuid 모양이 아니면 손대지 않는다(익명 세션 형식이 바뀌어도 화면이 안 깨지게). */
export function maskUid(uid: string): string {
  const parts = uid.split('-');
  if (parts.length !== 5) return uid;
  return [parts[0], '****', '****', '****', parts[4]].join('-');
}
