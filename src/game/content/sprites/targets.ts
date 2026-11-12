// 대상별 스프라이트 정의 — 격자 크기·안전 여백·표시 프리셋·팔레트 방식·상태 행·움직임을 한 곳에 둔다.
// 생성 도구, 검사, 검수 시트, 에디터, 화면 컴포넌트가 이 정의를 함께 읽는다.
// 새 대상은 SPRITE_TARGETS에 한 행을 더하고 원화 PNG 폴더를 둔다. 대상 종류 목록은 그 키에서 유도한다.
// 이어서 모든 격자 규칙 테스트의 격자 표에 그 대상의 행을 더하고, 에디터용 대상 정의 스크립트를 생성기로 다시 만든다.

export interface SpriteGrid { w: number; h: number }
/** 표시 프리셋 — 캔버스 크기와 정수 배율 */
export interface SpritePreset { w: number; h: number; scale: number }

export interface SpriteLayout {
  grid: SpriteGrid;
  /** 안전 여백 — 불투명 셀은 가장자리에서 이 칸 수 안쪽에만 둔다 */
  margin: number;
  presets: Readonly<Record<string, SpritePreset>>;
}

export interface SpriteTarget {
  /** SPRITE_TARGETS의 키와 같다 */
  kind: string;
  /** 생성 파일 머리 주석에서 id를 부르는 이름. 없으면 id */
  idLabel?: string;
  /** 격자와 표시 배율. null이면 아직 정해지지 않은 대상이라 생성 도구가 거부한다 */
  layout: SpriteLayout | null;
  /** per-sprite: 원화마다 고유 팔레트(원화 PNG 색 그대로). shared: 대상 전체가 공용 팔레트를 쓰는 코드 생성 대상 */
  palette: 'per-sprite' | 'shared';
  /** 상태별 그림 행. 상태가 그림을 바꾸지 않는 대상은 'default' 하나 */
  states: readonly string[];
  /** 머무는 화면에서 재생하는 움직임 */
  motion: 'swim' | 'none';
}

/** 캔버스를 격자 × 배율로 잡는 프리셋 묶음 */
function gridPresets<K extends string>(grid: SpriteGrid, scales: Record<K, number>): Record<K, SpritePreset> {
  const out = {} as Record<K, SpritePreset>;
  for (const k of Object.keys(scales) as K[]) out[k] = { w: grid.w * scales[k], h: grid.h * scales[k], scale: scales[k] };
  return out;
}

const GRID_32X16: SpriteGrid = { w: 32, h: 16 };
const SHIP_PRESETS = gridPresets(GRID_32X16, { thumb: 1, row: 2, hero: 3 });

export const SPRITE_TARGETS = {
  fish: {
    kind: 'fish',
    idLabel: '어종 id',
    layout: {
      grid: GRID_32X16,
      margin: 2,
      presets: {
        thumb: { w: 30, h: 16, scale: 1 },
        icon: { w: 84, h: 44, scale: 3 },
        portrait: { w: 240, h: 140, scale: 6 },
        card: { w: 160, h: 90, scale: 4 },
      },
    },
    palette: 'per-sprite',
    states: ['normal', 'variant', 'hidden'],
    motion: 'swim',
  },
  // 배·장비는 명세가 안전 여백을 정하지 않아 0이다(여백 검사가 아무것도 거르지 않는다).
  boat: {
    kind: 'boat',
    layout: { grid: GRID_32X16, margin: 0, presets: SHIP_PRESETS },
    palette: 'shared',
    states: ['default'],
    motion: 'none',
  },
  gear: {
    kind: 'gear',
    layout: { grid: GRID_32X16, margin: 0, presets: SHIP_PRESETS },
    palette: 'shared',
    states: ['default'],
    motion: 'none',
  },
  // 요리·미끼·유물: 정사각 격자를 쓰는 것까지만 정해졌고 크기와 배율은 미정이다. layout이 null인 동안
  // 생성 도구가 이 대상을 거부하며, 값이 정해지면 layout을 채운다.
  dish: { kind: 'dish', layout: null, palette: 'per-sprite', states: ['default'], motion: 'none' },
  bait: { kind: 'bait', layout: null, palette: 'per-sprite', states: ['default'], motion: 'none' },
  artifact: { kind: 'artifact', layout: null, palette: 'per-sprite', states: ['default'], motion: 'none' },
} as const satisfies Record<string, SpriteTarget>;

/** 정의된 대상 종류 — SPRITE_TARGETS의 키 */
export type SpriteKind = keyof typeof SPRITE_TARGETS;
export const SPRITE_KINDS = Object.keys(SPRITE_TARGETS) as SpriteKind[];

/** 격자가 정해진 대상의 layout. 미정이면 던진다 */
export function definedLayout(target: SpriteTarget): SpriteLayout {
  if (!target.layout) throw new Error(`${target.kind}: 격자와 표시 배율이 아직 정해지지 않았습니다`);
  return target.layout;
}

/** 프리셋이 쓰는 배율을 작은 것부터, 중복 없이 */
export function presetScales(layout: SpriteLayout): number[] {
  return [...new Set(Object.values(layout.presets).map(p => p.scale))].sort((a, b) => a - b);
}
