import type { Point } from '../world';

/** 마지막으로 막힌 자리에서 막히지 않은 채 이만큼(월드 좌표) 떨어지면 다음에 막힐 때 안내를 다시 낸다 */
export const BLOCK_RENEW_DISTANCE = 24;

/**
 * 막힘 안내의 재알림 판정. 한 번 안내한 뒤에는 같은 경계에 계속 막히는 동안 다시 내지 않는다.
 * 안내를 다시 내는 때는 이동 입력이 끊겼다 다시 시작됐을 때, 또는 마지막으로 막힌 자리에서 막히지 않은 채 일정 거리 이상 떨어졌다 다시 막혔을 때다.
 * 막혀 있는 동안은 기준 자리를 마지막으로 막힌 자리로 옮겨, 경계를 따라 미끄러지는 이동은 다시 알리지 않는다.
 * 프레임 간격이 고르지 않아 막히지 않은 프레임이 끼어도 거리가 그대로라 다시 내지 않는다.
 */
export class BlockNotice {
  private anchor: Point | null = null;

  /** 이동 입력이 없는 프레임이거나 입력이 끊겼다. 다음 막힘은 새 시도로 본다 */
  release(): void {
    this.anchor = null;
  }

  /** 이번 프레임의 막힘 여부와 자리를 넣고, 안내를 내야 하면 true를 돌려준다 */
  step(blocked: boolean, pos: Point): boolean {
    if (blocked) {
      const first = this.anchor === null;
      this.anchor = { x: pos.x, y: pos.y };
      return first;
    }
    if (this.anchor && Math.hypot(pos.x - this.anchor.x, pos.y - this.anchor.y) >= BLOCK_RENEW_DISTANCE) {
      this.anchor = null;
    }
    return false;
  }
}
