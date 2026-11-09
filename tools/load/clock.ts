// 위치 메시지를 보낸 시각의 기록. 가상 플레이어가 모두 한 프로세스에 있어 보낸 쪽이 적어 둔 시각을
// 받는 쪽이 같은 시계로 읽는다. 메시지 형식에 시각을 싣지 않고, 서버 검사에 걸릴 값도 만들지 않는다.

interface Pos { x: number; y: number; line: boolean; bob?: { x: number; y: number } | null }

const keyOf = (uid: string, p: Pos): string => `${uid}|${p.x}|${p.y}|${p.line ? 1 : 0}|${p.bob ? `${p.bob.x},${p.bob.y}` : ''}`;

export class MoveClock {
  private readonly sentAt = new Map<string, number>();

  mark(uid: string, p: Pos, now: number): void {
    this.sentAt.set(keyOf(uid, p), now);
  }

  /** 그 메시지를 보낸 시각과 받은 시각의 차(ms). 기록이 없으면 null이다 */
  delay(uid: string, p: Pos, now: number): number | null {
    const at = this.sentAt.get(keyOf(uid, p));
    return at === undefined ? null : now - at;
  }

  /** 오래된 기록을 지운다 */
  prune(now: number, maxAgeMs: number): void {
    for (const [key, at] of this.sentAt) if (now - at > maxAgeMs) this.sentAt.delete(key);
  }
}
