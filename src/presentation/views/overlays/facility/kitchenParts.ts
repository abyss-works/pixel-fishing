import type { GameAction } from '../../../../game/rules/actions';
import type { DispatchResult } from '../../../../features/gameplay/service/types';

// 부엌 창의 탭들이 함께 쓰는 조각.

/** 창이 확정 동작을 맡기는 함수 — 바쁜 동안은 받지 않고, 거부는 메시지 창에 알리며, 성공하면 onOk를 부른다 */
export type KitchenAct = (action: GameAction, onOk?: (r: Extract<DispatchResult, { status: 'ok' }>) => void) => void;
