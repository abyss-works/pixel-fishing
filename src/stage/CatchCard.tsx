import type { CSSProperties } from 'react';
import { RARITY, priceOf } from '../game/logic';
import type { CatchInfo, Fish } from '../game/logic';
import { cx } from '../ui/cx';
import FishSprite from '../ui/FishSprite';
import { RarityText } from '../ui/RarityTag';

// 변이 문구 풀 — 대놓고 "변이"라 하지 않고 낮춰 말하는 의미심장한 한 줄 (매번 랜덤)
const MUTATED_LINES = [
  '…조금 다르게 생겼다.',
  '…흔치 않은 빛깔을 띠고 있다.',
  '…어딘가 낯선 기운이 감돈다.',
  '…이런 색은 도감에서 본 적이 없다.',
  '…물빛 때문일까, 색이 묘하다.',
  '…자꾸만 눈이 가는 녀석이다.',
] as const;

// 획득 오버레이 — 게임 프레임 중앙에 뜨는 DOM 카드 (v0.3.0)
// 스프라이트만 캔버스, 나머지(이름/크기/월척/변이/NEW)는 전부 DOM — 폰트·그림자·CSS 애니메이션.
export default function CatchCard({ fish, info }: { fish: Fish; info: CatchInfo | null }) {
  const r = RARITY[fish.rarity];
  // 문구 선택은 이번 캐치의 크기 롤(이미 랜덤)에서 파생 — 렌더 순수성 유지 + 카드 떠 있는 동안 고정
  const mutatedLine = MUTATED_LINES[info ? Math.floor(info.size * 997) % MUTATED_LINES.length : 0];
  // 연출 파라미터는 등급 데이터 소관 — 등급 리터럴 하드코딩 금지 (6등급 개편 대비)
  const { sparks, sparkDist, halo } = r;
  return (
    <div data-rarity={fish.rarity}
         className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-(--z-card)
                    flex flex-col items-center gap-1 min-w-[240px] px-4 py-3
                    bg-[rgba(6,12,24,0.82)] backdrop-blur-[4px] rounded-md shadow-panel
                    border border-[color-mix(in_srgb,var(--rarity-color)_45%,transparent)]
                    pointer-events-none animate-catch-pop">
      {/* 이펙트 레이어 — 캔버스가 아니라 카드 위에 그린다 (카드가 캔버스 중앙을 덮어 캔버스 파티클은 안 보였음) */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* 획득 순간 방사형 스파크 — 영웅 12개, 전설 20개·더 멀리·더 오래 */}
        {sparks > 0 && Array.from({ length: sparks }, (_, i) => (
          <span key={`s${i}`}
                className={cx(
                  'absolute left-1/2 top-1/2 size-1 -m-0.5 bg-(--rarity-color) shadow-[0_0_6px_var(--rarity-color)]',
                  'animate-fx-spark opacity-0',
                  halo && '[animation-duration:0.85s]',
                )}
                style={{
                  '--a': `${(i * 360) / sparks}deg`,
                  '--d': `${sparkDist + (i % 3) * 18}px`,
                } as CSSProperties} />
        ))}
        {/* 최고급(halo) — 카드를 도는 골드 궤도 점 (도트 감성: 원형 없음) */}
        {halo && Array.from({ length: 10 }, (_, i) => (
          <span key={i}
                className="absolute left-1/2 top-1/2 size-1 -m-0.5 bg-legend shadow-[0_0_6px_var(--c-legend)]
                           animate-fx-orbit [animation-delay:calc(var(--i)*-0.24s)]"
                style={{ '--i': i } as CSSProperties} />
        ))}
        {/* 변이 — 신비로운 잔광: 카드 곁에서 피어올라 흩어지는 보랏빛/물빛.
            정적 X 오프셋은 transform, 상승은 keyframe의 translate 속성 — 서로 충돌하지 않는다 */}
        {info?.mutated && Array.from({ length: 8 }, (_, i) => (
          <span key={i}
                className={cx(
                  'absolute left-1/2 top-[60%] size-[5px] opacity-0',
                  '[transform:translateX(calc((var(--i)-3.5)*38px))]',
                  'animate-fx-wisp [animation-delay:calc(var(--i)*-0.4s)]',
                  i % 2
                    ? 'bg-[#a0e7fc] shadow-[0_0_8px_2px_rgba(160,231,252,0.8)]'
                    : 'bg-[#e0c3fc] shadow-[0_0_8px_2px_rgba(224,195,252,0.8)]',
                )}
                style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      {/* 신규 발견 — 왼쪽 위 모서리에 기울어진 리본 */}
      {info?.isNew && (
        <span className="absolute -top-2.5 -left-3.5 [transform:rotate(-12deg)] bg-[#ff4081] text-white
                         font-bold text-xs px-2 py-0.5 rounded-sm shadow-panel animate-new-bounce">
          NEW!
        </span>
      )}
      <span className="text-xs"><RarityText rarity={fish.rarity} /></span>
      <FishSprite fish={fish} preset="card" mutated={info?.mutated ?? false} />
      {/* 변이 — 이름만 은은히 빛나고, 문구는 오히려 낮춰 말한다 (의미심장한 한 줄) */}
      <b className={cx('text-base', info?.mutated && 'animate-mutated-shimmer')}>
        {info?.mutated ? fish.variant.name : fish.name}
      </b>
      <span className="text-xs text-text-dim">
        {info && `${info.size.toFixed(1)}cm`}
        {info?.isBig && <b className="text-gold"> ★ 월척! 상위 {info.percentile}%</b>}
      </span>
      {info?.mutated && <span className="text-xs italic text-text-dim">{mutatedLine}</span>}
      <span className="text-xs text-text-dim">{r.name} 등급 · {priceOf(fish, info?.mutated ?? false)}G</span>
    </div>
  );
}
