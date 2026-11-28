import type { CSSProperties } from 'react';
import { formName, priceOf } from '../../../game/rules/logic';
import type { CatchInfo, Fish, RarityId } from '../../../game/rules/logic';
import { cx } from '../cx';
import { fmtGold, fmtSize } from '../format';
import Inset from '../Inset';
import type { InsetBorder } from '../Inset';
import { NOTCH_SM } from '../notch';
import PixelIcon from '../PixelIcon';
import HudPanel from './HudPanel';
import FishSprite from '../fish/FishSprite';
import { RarityText } from '../fish/RarityTag';
import type { FxPlayIntensity } from '../../../features/display/model/fxPolicy';
import { catchCardLayers } from './catchCardFx';

const PORTRAIT_BORDER: Record<RarityId, InsetBorder> = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legend',
};

const CORNER_BRACKETS = [
  '-top-[3px] -left-[3px] border-t-[2px] border-l-[2px]',
  '-top-[3px] -right-[3px] border-t-[2px] border-r-[2px]',
  '-bottom-[3px] -left-[3px] border-b-[2px] border-l-[2px]',
  '-bottom-[3px] -right-[3px] border-b-[2px] border-r-[2px]',
] as const;

// 변이 문구 풀 — 대놓고 "변이"라 하지 않고 낮춰 말하는 의미심장한 한 줄 (매번 랜덤)
const VARIANT_LINES = [
  '…조금 다르게 생겼다.',
  '…흔치 않은 빛깔을 띠고 있다.',
  '…어딘가 낯선 기운이 감돈다.',
  '…이런 색은 도감에서 본 적이 없다.',
  '…물빛 때문일까, 색이 묘하다.',
  '…자꾸만 눈이 가는 녀석이다.',
] as const;

// 획득 오버레이 — 2열 가로형 고정 크기(340×160) 노치 카드(좌측 어종 액자 + 우측 등급·배지·이름·변이 문구·크기/판매가).
// 스프라이트만 캔버스, 나머지(등급/배지/이름/변이 문구/크기/판매가)는 전부 DOM — 폰트·그림자·CSS 애니메이션.
// 돌연변이여도 초상화 액자의 겉 테두리는 어종 등급색으로 고정하고, 우상단 배지는 왕관 → 돌연변이 → NEW 순서로 우측 정렬한다.
export default function CatchCard({ fish, info, fxIntensity = null }: {
  fish: Fish;
  info: CatchInfo | null;
  /** 효과 중재자가 정한 강도. 없으면 작게로 그린다 */
  fxIntensity?: FxPlayIntensity | null;
}) {
  // 문구 선택은 이번 캐치의 크기 롤(이미 랜덤)에서 파생 — 렌더 순수성 유지 + 카드 떠 있는 동안 고정
  const isVariant = info?.form === 'variant';
  const variantLine = VARIANT_LINES[info ? Math.floor(info.size * 997) % VARIANT_LINES.length : 0];
  const layers = catchCardLayers(fish.rarity, isVariant, fxIntensity);
  return (
    <div data-rarity={fish.rarity} className="relative w-[340px] max-w-full h-[160px] shrink-0 pointer-events-none">
      {/* 이펙트 레이어 — 카드의 쌓임 맥락 안에 두면 카드 층에 갇혀 채팅과 헤더 뒤로 가려지므로
          카드와 형제로 두고 이펙트 층(catch-fx)에 놓는다. 패널의 노치가 잘라 내지 않도록 패널 바깥 층이다 */}
      <div data-catch-fx className="absolute inset-0 z-(--z-catch-fx) pointer-events-none" aria-hidden="true">
        {/* 영웅·전설 네 모서리 발광 L-브래킷(10×10px, 2px 테두리) */}
        {layers.cornerGlow && CORNER_BRACKETS.map((posClass, i) => (
          <span key={`c${i}`}
                data-catch-corner
                className={cx('absolute size-[10px] border-solid', posClass)}
                style={{
                  borderColor: 'var(--rarity-color)',
                  filter: 'drop-shadow(0 0 4px var(--rarity-color))',
                }} />
        ))}
        {/* 변이 — 신비로운 잔광: 카드 곁에서 피어올라 흩어지는 자홍빛.
            정적 X 오프셋은 transform, 상승은 keyframe의 translate 속성 — 서로 충돌하지 않는다 */}
        {layers.wisps && Array.from({ length: 8 }, (_, i) => (
          <span key={i}
                className={cx(
                  'absolute left-1/2 top-[60%] size-[5px] opacity-0',
                  '[transform:translateX(calc((var(--i)-3.5)*38px))]',
                  'animate-fx-wisp [animation-delay:calc(var(--i)*-0.4s)]',
                  i % 2
                    ? 'bg-[color-mix(in_oklab,var(--c-mutation)_60%,white)] shadow-[0_0_8px_2px_rgba(244,114,182,0.8)]'
                    : 'bg-mutation shadow-[0_0_8px_2px_rgba(244,114,182,0.85)]',
                )}
                style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="relative z-(--z-stage-card) w-full h-full animate-catch-pop">
        <div className={cx('w-full h-full', layers.legendGlow && 'animate-glow-legend')}>
          <HudPanel tone="none"
                    className="relative w-full h-full p-3 grid grid-cols-[120px_minmax(0,1fr)] gap-3 items-stretch overflow-hidden
                               bg-[color-mix(in_oklab,var(--c-bg)_85%,transparent)] shadow-panel
                               border-[color-mix(in_srgb,var(--rarity-color)_70%,transparent)]">
            {/* 좌측 열: 등급색 겉 테두리 고정 어종 액자 */}
            <Inset data-catch-portrait tone="deep" border={PORTRAIT_BORDER[fish.rarity]}
                   className="relative w-[120px] h-full p-2 flex items-center justify-center overflow-hidden">
              {layers.cornerGlow && (
                <div data-portrait-glow
                     aria-hidden="true"
                     className="absolute inset-0 pointer-events-none catch-portrait-glow"
                     style={{ '--fx-color': 'var(--rarity-color)' } as CSSProperties} />
              )}
              <FishSprite fish={fish} preset="card" form={info?.form ?? 'normal'} animate className="relative w-full h-auto max-h-full object-contain" />
            </Inset>
            {/* 우측 열: 등급·우상단 배지(왕관→돌연변이→NEW), 이름, 고정 높이 변이 로어 자리, 크기·판매가 2종 */}
            <div className="relative h-full min-w-0 grid grid-rows-[20px_28px_18px_56px] gap-y-1">
              <div className="h-[20px] flex items-center justify-between gap-2 overflow-hidden">
                <span className="text-xs font-bold leading-none whitespace-nowrap"><RarityText rarity={fish.rarity} /></span>
                <div data-catch-badges className="flex items-center justify-end gap-1.5 shrink-0">
                  {info?.isBig && (
                    <span data-catch-badge="record" className="inline-flex items-center justify-center shrink-0 text-gold">
                      <PixelIcon glyph="crown" size={14} />
                    </span>
                  )}
                  {isVariant && (
                    <span data-catch-badge="variant" className="inline-flex items-center justify-center shrink-0 text-mutation">
                      <PixelIcon glyph="sparkle" size={14} />
                    </span>
                  )}
                  {info?.isNew && (
                    <span data-catch-badge="new"
                          className={cx('inline-flex items-center justify-center px-1.5 h-4 pf-accent text-2xs leading-none bg-gold border border-gold-dark text-bg shrink-0', NOTCH_SM)}>
                      NEW
                    </span>
                  )}
                </div>
              </div>
              <b data-catch-name className={cx('block h-[28px] leading-[28px] text-lg font-bold truncate', isVariant ? cx('text-mutation', layers.shimmer && 'animate-mutated-shimmer') : 'text-text')}>
                {formName(fish, info?.form ?? 'normal')}
              </b>
              {isVariant ? (
                <span data-catch-variant className="block h-[18px] leading-[18px] text-xs text-text-dim truncate">{variantLine}</span>
              ) : (
                <span aria-hidden="true" data-catch-variant-slot className="block h-[18px]" />
              )}
              <div data-catch-metrics
                   className={cx('h-[56px] grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5 text-xs text-text-dim bg-bg border border-line-dim overflow-hidden', NOTCH_SM)}>
                <span>크기</span>
                <b className="pf-accent tabular-nums text-sm text-text text-right whitespace-nowrap">{info ? fmtSize(info.size) : ''}</b>
                <span>판매가</span>
                <b className="pf-accent tabular-nums text-sm text-gold text-right whitespace-nowrap">{fmtGold(priceOf(fish, info?.form ?? 'normal'))}</b>
              </div>
            </div>
            {/* 전설 등급 전용 내부 대각 빛줄기 오버레이 */}
            {layers.sweep && <span className="catch-card-sweep pointer-events-none" aria-hidden="true" />}
          </HudPanel>
        </div>
      </div>
    </div>
  );
}
