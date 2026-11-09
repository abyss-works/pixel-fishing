// 실시간 채널이 끊겨 있던 시간의 계산. 끊긴 채로 단계가 끝나도 그 단계에 속한 시간이 빠지지 않게 나눠 돌려준다.

export class Downtime {
  private since: number | null = null;

  /** 끊긴 시점부터 센다 */
  begin(now: number): void {
    this.since = now;
  }

  /** 끊겨 있는 동안 지금까지 쌓인 시간(ms)을 돌려주고 센 시점을 지금으로 옮긴다. 끊겨 있지 않으면 0이다 */
  take(now: number): number {
    if (this.since === null) return 0;
    const ms = now - this.since;
    this.since = now;
    return ms;
  }

  /** 다시 연결됐다. 아직 돌려주지 않은 시간을 돌려주고 센 것을 끝낸다 */
  end(now: number): number {
    const ms = this.take(now);
    this.since = null;
    return ms;
  }
}
