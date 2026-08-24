// 어종 스프라이트 — 어종마다 다른 몸 형태(shape)로 그린다 
// 고정 해상도 래스터(32/64px) 대신, 기존처럼 좌표를 s(스케일)에 곱한 사각형을 절차적으로
// 그린다 — 어떤 화면 크기에서도 픽셀이 깨지지 않고, 실루엣당 사각형 수만 늘려 디테일을 낸다.
// detail=false면 실루엣(도감 미획득 표시용) — 눈/하이라이트 생략, 몸 형태는 그대로 보여준다.
import { R, shade } from '../common.js';
import type { Ctx } from '../common.js';
import type { FishShape } from '../../data/fish.js';
export type { FishShape };

type Draw = (ctx: Ctx, cx: number, cy: number, s: number, color: string, detail: boolean) => void;

// 아주 작은 무리어(피라미)
const tiny: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 3 * s, cy - 1 * s, 6 * s, 2 * s, color);
  R(ctx, cx - 4 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx + 3 * s, cy - 1 * s, 2 * s, 1 * s, shade(color, 0.7));
  R(ctx, cx + 3 * s, cy, 2 * s, 1 * s, shade(color, 0.7));
  if (!detail) return;
  R(ctx, cx - 2 * s, cy - 1 * s, s, s, '#000');
};

// 통통한 몸(붕어/잉어/참돔) — 작은 부채꼬리 + 등지느러미
const round: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 5 * s, cy - 3 * s, 10 * s, 6 * s, color);
  R(ctx, cx - 6 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx + 5 * s, cy - 3 * s, 3 * s, 3 * s, shade(color, 0.7));
  R(ctx, cx + 5 * s, cy, 3 * s, 3 * s, shade(color, 0.7));
  R(ctx, cx - 1 * s, cy - 4 * s, 3 * s, 1 * s, shade(color, 0.7));
  if (!detail) return;
  R(ctx, cx - 3 * s, cy - 2 * s, s, s, '#000');
  R(ctx, cx - 1 * s, cy + 1 * s, 4 * s, s, 'rgba(255,255,255,0.35)');
};

// 어뢰형(은어/고등어/연어/무지개송어/참치) — 갈래꼬리 + 작은 등지느러미
const slim: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 6 * s, cy - 2 * s, 11 * s, 4 * s, color);
  R(ctx, cx - 7 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx - 1 * s, cy - 3 * s, 2 * s, 1 * s, shade(color, 0.7));
  R(ctx, cx + 5 * s, cy - 3 * s, 2 * s, 2 * s, shade(color, 0.6));
  R(ctx, cx + 5 * s, cy + 1 * s, 2 * s, 2 * s, shade(color, 0.6));
  if (!detail) return;
  R(ctx, cx - 4 * s, cy - 1 * s, s, s, '#000');
  R(ctx, cx - 2 * s, cy + 1 * s, 4 * s, s, 'rgba(255,255,255,0.35)');
};

// 육식어(쏘가리/방어) — slim + 뾰족하게 솟은 등지느러미
const predator: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 6 * s, cy - 2 * s, 11 * s, 4 * s, color);
  R(ctx, cx - 7 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx - 2 * s, cy - 5 * s, 1 * s, 3 * s, shade(color, 0.6));
  R(ctx, cx - 1 * s, cy - 4 * s, 1 * s, 2 * s, shade(color, 0.6));
  R(ctx, cx + 5 * s, cy - 3 * s, 2 * s, 2 * s, shade(color, 0.6));
  R(ctx, cx + 5 * s, cy + 1 * s, 2 * s, 2 * s, shade(color, 0.6));
  if (!detail) return;
  R(ctx, cx - 4 * s, cy - 1 * s, s, s, '#000');
};

// 화려한 관상어(금붕어/황금잉어) — 층진 부채꼬리
const flowing: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 4 * s, cy - 3 * s, 8 * s, 6 * s, color);
  R(ctx, cx - 5 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx + 4 * s, cy - 4 * s, 3 * s, 3 * s, shade(color, 0.85));
  R(ctx, cx + 4 * s, cy + 1 * s, 3 * s, 3 * s, shade(color, 0.85));
  R(ctx, cx + 6 * s, cy - 3 * s, 2 * s, 2 * s, shade(color, 1.15));
  R(ctx, cx + 6 * s, cy + 1 * s, 2 * s, 2 * s, shade(color, 1.15));
  R(ctx, cx - 1 * s, cy - 4 * s, 2 * s, 1 * s, shade(color, 0.85));
  if (!detail) return;
  R(ctx, cx - 2 * s, cy - 2 * s, s, s, '#000');
  R(ctx, cx, cy + 1 * s, 3 * s, s, 'rgba(255,255,255,0.35)');
};

// 길고 가는 몸(미꾸라지) — 살짝 구불거리는 3분절
const eel: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 8 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx - 7 * s, cy - 1 * s, 6 * s, 2 * s, color);
  R(ctx, cx - 2 * s, cy, 6 * s, 2 * s, color);
  R(ctx, cx + 3 * s, cy - 1 * s, 4 * s, 2 * s, color);
  if (!detail) return;
  R(ctx, cx - 6 * s, cy - 1 * s, s, s, '#000');
};

// 리본형(갈치/산갈치) — 아주 길고 얇게, 끝은 더 얇아진다
const ribbon: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 9 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx - 8 * s, cy - 1 * s, 5 * s, 2 * s, color);
  R(ctx, cx - 3 * s, cy - 1 * s, 6 * s, 1 * s, color);
  R(ctx, cx + 3 * s, cy, 5 * s, 1 * s, shade(color, 0.85));
  if (!detail) return;
  R(ctx, cx - 7 * s, cy - 1 * s, s, s, '#000');
  R(ctx, cx - 5 * s, cy - 1 * s, 3 * s, s, 'rgba(255,255,255,0.3)');
};

// 넓적한 머리+수염(메기)
const whiskered: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 7 * s, cy - 2 * s, 2 * s, 4 * s, color);
  R(ctx, cx - 6 * s, cy - 2 * s, 11 * s, 4 * s, color);
  R(ctx, cx + 5 * s, cy - 2 * s, 2 * s, 2 * s, shade(color, 0.6));
  R(ctx, cx + 5 * s, cy + 1 * s, 2 * s, 2 * s, shade(color, 0.6));
  if (!detail) return;
  R(ctx, cx - 6 * s, cy - 1 * s, s, s, '#000');
  R(ctx, cx - 8 * s, cy + 1 * s, 3 * s, 1, shade(color, 0.5));
  R(ctx, cx - 8 * s, cy + 2 * s, 3 * s, 1, shade(color, 0.5));
};

// 상어 — 큰 삼각 등지느러미 + 초승달 꼬리 + 밝은 배
const shark: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 7 * s, cy - 2 * s, 12 * s, 4 * s, color);
  R(ctx, cx - 8 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx - 2 * s, cy - 6 * s, 1 * s, 4 * s, shade(color, 0.7));
  R(ctx, cx - 1 * s, cy - 4 * s, 1 * s, 2 * s, shade(color, 0.7));
  R(ctx, cx + 5 * s, cy - 4 * s, 2 * s, 3 * s, shade(color, 0.7));
  R(ctx, cx + 5 * s, cy + 1 * s, 2 * s, 3 * s, shade(color, 0.7));
  if (!detail) return;
  R(ctx, cx - 5 * s, cy - 1 * s, s, s, '#000');
  R(ctx, cx - 3 * s, cy + 1 * s, 5 * s, s, 'rgba(255,255,255,0.4)');
};

// 아귀 — 큰 머리+아래턱, 발광 촉수
const anglerfish: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 5 * s, cy - 4 * s, 9 * s, 8 * s, color);
  R(ctx, cx + 3 * s, cy - 2 * s, 3 * s, 4 * s, shade(color, 0.6));
  R(ctx, cx - 5 * s, cy + 1 * s, 5 * s, 3 * s, shade(color, 0.5));
  if (!detail) return;
  R(ctx, cx - 2 * s, cy - 2 * s, s, s, '#000');
  R(ctx, cx - 1 * s, cy - 6 * s, 1, 3 * s, '#ddd');
  R(ctx, cx - 1 * s, cy - 7 * s, 2, 2, '#00e5ff');
};

// 두족류(오징어/크라켄) — 외투(머리) + 촉수 여러 개
const cephalopod: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 4 * s, cy - 5 * s, 8 * s, 6 * s, color);
  [-4, -2, 0, 2].forEach((dx, i) => {
    const len = 3 * s + (i % 2 === 0 ? s : 2 * s);
    R(ctx, cx + dx * s, cy + 1 * s, s, len, shade(color, 0.85));
  });
  if (!detail) return;
  R(ctx, cx - 2 * s, cy - 3 * s, s, s, '#000');
  R(ctx, cx + 1 * s, cy - 3 * s, s, s, '#000');
};

// 원시어(실러캔스) — 두꺼운 엽상 지느러미 + 삼중 꼬리
const ancient: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 6 * s, cy - 2 * s, 11 * s, 4 * s, color);
  R(ctx, cx - 7 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx - 2 * s, cy - 4 * s, 3 * s, 2 * s, shade(color, 0.7));
  R(ctx, cx - 3 * s, cy + 2 * s, 3 * s, 2 * s, shade(color, 0.7));
  R(ctx, cx + 5 * s, cy - 3 * s, 2 * s, 2 * s, shade(color, 0.6));
  R(ctx, cx + 5 * s, cy + 1 * s, 2 * s, 2 * s, shade(color, 0.6));
  R(ctx, cx + 6 * s, cy - 1 * s, 2 * s, 2 * s, shade(color, 0.6));
  if (!detail) return;
  R(ctx, cx - 4 * s, cy - 1 * s, s, s, '#000');
};

// 전설의 뱀장어형(강의 주인) — 긴 몸 + 등을 따라 이어지는 갈기 지느러미 + 수염
const serpent: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 9 * s, cy - 1 * s, 1 * s, 2 * s, color);
  R(ctx, cx - 8 * s, cy - 2 * s, 14 * s, 4 * s, color);
  for (let i = -6; i <= 4; i += 2) R(ctx, cx + i * s, cy - 4 * s, 1 * s, 2 * s, shade(color, 0.7));
  R(ctx, cx + 6 * s, cy - 3 * s, 2 * s, 2 * s, shade(color, 0.6));
  R(ctx, cx + 6 * s, cy + 1 * s, 2 * s, 2 * s, shade(color, 0.6));
  if (!detail) return;
  R(ctx, cx - 6 * s, cy - 1 * s, s, s, '#000');
  R(ctx, cx - 7 * s, cy + 1 * s, 2 * s, 1, shade(color, 0.5));
};

// 가오리 — 납작하고 넓적한 몸 + 물결치는 날개 + 길게 늘어진 꼬리
const ray: Draw = (ctx, cx, cy, s, color, detail) => {
  R(ctx, cx - 5 * s, cy - 2 * s, 9 * s, 4 * s, color);
  R(ctx, cx - 7 * s, cy - 1 * s, 2 * s, 2 * s, color);
  R(ctx, cx - 7 * s, cy - 3 * s, 4 * s, s, shade(color, 0.8));
  R(ctx, cx - 7 * s, cy + 2 * s, 4 * s, s, shade(color, 0.8));
  R(ctx, cx + 4 * s, cy - 1 * s, 6 * s, s, shade(color, 0.9));
  if (!detail) return;
  R(ctx, cx - 4 * s, cy - 1 * s, s, s, '#000');
  R(ctx, cx - 2 * s, cy + 1 * s, 3 * s, s, 'rgba(255,255,255,0.3)');
};

const SHAPES: Record<FishShape, Draw> = {
  tiny, round, slim, predator, flowing, eel, ribbon,
  whiskered, shark, anglerfish, cephalopod, ancient, serpent, ray,
};

export function drawFishSprite(
  ctx: Ctx, cx: number, cy: number, shape: FishShape, color: string, s: number, detail = true,
) {
  SHAPES[shape](ctx, cx, cy, s, color, detail);
}
