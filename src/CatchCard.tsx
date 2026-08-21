import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { RARITY, priceOf } from './logic';
import type { CatchInfo, Fish } from './logic';
import { drawFishSprite } from './pixel';
import { RarityText } from './ui/RarityTag';

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
// 배경 파티클(전설 링/버스트)은 게임 캔버스가 계속 그린다 (pixel/index.ts drawCatchEffects).

function CatchSprite({ fish, mutated }: { fish: Fish; mutated: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.clearRect(0, 0, 160, 90);
    drawFishSprite(ctx, 80, 45, fish.shape, mutated ? fish.variant.color : fish.color, 4);
  }, [fish, mutated]);
  return <canvas ref={ref} width={160} height={90} className="catch-sprite" aria-hidden="true" />;
}

export default function CatchCard({ fish, info }: { fish: Fish; info: CatchInfo | null }) {
  const r = RARITY[fish.rarity];
  // 문구 선택은 이번 캐치의 크기 롤(이미 랜덤)에서 파생 — 렌더 순수성 유지 + 카드 떠 있는 동안 고정
  const mutatedLine = MUTATED_LINES[info ? Math.floor(info.size * 997) % MUTATED_LINES.length : 0];
  const sparks = fish.rarity === 'legendary' ? 20 : fish.rarity === 'epic' ? 12 : 0;
  return (
    <div className="catch-card" data-rarity={fish.rarity} data-mutated={info?.mutated ?? false}>
      {/* 이펙트 레이어 — 캔버스가 아니라 카드 위에 그린다 (카드가 캔버스 중앙을 덮어 캔버스 파티클은 안 보였음) */}
      <div className="catch-fx" aria-hidden="true">
        {/* 획득 순간 방사형 스파크 — 영웅 12개, 전설 20개·더 멀리·더 오래 (지속시간은 CSS가 등급으로 분기) */}
        {sparks > 0 && Array.from({ length: sparks }, (_, i) => (
          <span key={`s${i}`} className="fx-spark" style={{
            '--a': `${(i * 360) / sparks}deg`,
            '--d': `${(fish.rarity === 'legendary' ? 110 : 70) + (i % 3) * 18}px`,
          } as CSSProperties} />
        ))}
        {fish.rarity === 'legendary' && Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="fx-orbit" style={{ '--i': i } as CSSProperties} />
        ))}
        {info?.mutated && Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={`fx-wisp${i % 2 ? ' alt' : ''}`} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      {info?.isNew && <span className="catch-new">NEW!</span>}
      <span className="catch-rarity"><RarityText rarity={fish.rarity} /></span>
      <CatchSprite fish={fish} mutated={info?.mutated ?? false} />
      <b className="catch-name">{info?.mutated ? fish.variant.name : fish.name}</b>
      <span className="catch-size">
        {info && `${info.size.toFixed(1)}cm`}
        {info?.isBig && <b className="catch-big"> ★ 월척! 상위 {info.percentile}%</b>}
      </span>
      {info?.mutated && <span className="catch-mutated">{mutatedLine}</span>}
      <span className="catch-price">{r.name} 등급 · {priceOf(fish, info?.mutated ?? false)}G</span>
    </div>
  );
}
