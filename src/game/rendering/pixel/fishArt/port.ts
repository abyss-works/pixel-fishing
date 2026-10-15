// 물고기 그래픽 포트 — 화면(도감·가방·카드)과 필드 연출은 이 계약으로만 물고기를 그린다.
// 그림체마다 어댑터가 하나씩 있고(v1 = 스프라이트화 직전 스냅샷, v2 = 격자 스프라이트),
// 사용자가 설정에서 고른 스타일로 어댑터를 바꿔 끼운다. 어떤 격자·색·링을 쓰는지는 어댑터 안의 일이다.
import type { Ctx } from '../common.js';
import type { Fish, FormId } from '../../../content/fish.js';

export type FishArtStyle = 'v1' | 'v2';

/** 그리는 데 필요한 어종 필드 — 네임드도 같은 모양을 가진다 */
export type FishArtSubject = Pick<Fish, 'id' | 'shape' | 'color' | 'variant' | 'rarity'>;

export interface FishArtDraw {
  /** 정수 배율 */
  scale: number;
  form?: FormId;
  /** false면 실루엣 — 형태만 보이고 색은 숨긴다(도감 스포일러 규칙) */
  discovered?: boolean;
  /** 좌우 반전 — motion을 지원하는 어댑터만 반영한다 */
  flip?: boolean;
  /** 초 단위 시각 — 유영 흔들기. motion을 지원하는 어댑터만 반영한다 */
  t?: number;
}

export interface FishArt {
  readonly style: FishArtStyle;
  /** 움직임 연출(유영 흔들기·훅 점프) 지원 여부. false면 호출자는 정지 화면만 그린다 */
  readonly motion: boolean;
  /** 몸 중심을 (cx, cy)에 맞춰 그린다 */
  drawCentered(ctx: Ctx, fish: FishArtSubject, cx: number, cy: number, o: FishArtDraw): void;
}
