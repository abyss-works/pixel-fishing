import { sizePercentile } from '../../../game/rules/logic';
import type { FishInstance } from '../../../game/rules/logic';
import type { Fish } from '../../../game/content/fish';
import { cx } from '../cx';
import { fmtSize } from '../format';
import IconButton from '../IconButton';
import PixelIcon from '../PixelIcon';
import SizeBar from '../SizeBar';

// 개체 한 마리의 표시 — 가방 탭과 판매 패널이 같은 줄을 쓴다.
// **고정 그리드**다: 값의 자릿수가 달라도 열이 흔들리면 개체끼리 크기 비교가 안 된다.
//   [체크] [크기] [막대(1fr — 남는 폭을 전부 먹어 좌우로 펼친다)] [백분위] [최대] [변이] [버튼들]
// 체크 열은 선택 표시(children)를 받는 판매 패널에만 있다. 조회 전용 줄은 그 자리를 비우지 않는다.
// 최대와 변이는 글자 대신 12px 아이콘(골드 왕관, 보라 반짝이)으로, 표시가 없어도 같은 폭을 차지한다.
// 아이콘 뜻은 줄마다 달지 않고 화면의 도움말 한 곳에서 알린다(aria-label만 둔다).
// 행이 어종 단위로 묶이므로 변이 여부는 이 줄이 아이콘으로 알린다 (bagRows 참고).
// 판정(방치/PERFECT)·잡은 날은 기록만 하고 걸지 않는다 — 여기서 내리는 판단은 "남길까 팔까"고
// 거기 쓰이는 건 크기뿐이다.
// 마지막 열은 auto — 진열·잠금 버튼 수가 화면마다 달라서(가방 둘, 판매 없음) 고정폭이면 넘친다.
// 버튼은 우측 정렬이라 자물쇠 위치는 줄마다 같다.
const CELL = 'grid items-center gap-2';
const COLS_CHECK = 'grid-cols-[13px_52px_1fr_34px_12px_12px_auto]';
const COLS_VIEW = 'grid-cols-[52px_1fr_34px_12px_12px_auto]';

function lineClass(hasCheck: boolean, interactive: boolean, dim: boolean) {
  return cx(CELL, hasCheck ? COLS_CHECK : COLS_VIEW, 'text-xs py-0.5 px-1',
            interactive && 'cursor-pointer hover:bg-surface-2', dim && 'text-text-dim');
}

function BestMark({ on }: { on: boolean | undefined }) {
  return on
    ? <span className="text-gold leading-none" role="img" aria-label="이 형태 최대"><PixelIcon glyph="crown" size={12} /></span>
    : <span />;
}

function VariantMark({ on }: { on: boolean }) {
  return on
    ? <span className="text-epic leading-none" role="img" aria-label="돌연변이"><PixelIcon glyph="sparkle" size={12} /></span>
    : <span />;
}

export interface InstanceLineProps {
  inst: FishInstance;
  fish: Fish;
  /** 이 행에서 가장 큰 개체 — 하나만 표시된다 */
  best?: boolean;
  /** 판매 선택용. 없으면 조회 전용 줄 */
  checked?: boolean;
  onToggle?: () => void;
  /** 개체 잠금 토글. 없으면 잠금 버튼을 걸지 않는다(판매 패널) */
  onLock?: () => void;
  /** 전시대 진열. 없으면 진열 버튼을 걸지 않는다 — 가방 탭만 쓴다 */
  onExhibit?: () => void;
  children?: React.ReactNode;
}

export default function InstanceLine({
  inst, fish, best, checked, onToggle, onLock, onExhibit, children,
}: InstanceLineProps) {
  const pct = inst.size === null ? null : sizePercentile(fish, inst.size);
  const label = [
    inst.size === null ? null : fmtSize(inst.size),
    inst.form === 'variant' ? '돌연변이' : null,
    fish.name,
  ].filter(Boolean).join(' ');

  return (
    <div className={lineClass(children !== undefined, !!onToggle, checked === false || inst.locked)}
         onClick={onToggle}
         role={onToggle ? 'button' : undefined}>
      {children !== undefined && <span>{children}</span>}
      {/* 값은 픽셀 폰트(pf-accent = Silkscreen). 한글 글리프가 없는 건 폰트 스택이 폴백한다 */}
      <span className="pf-accent">
        {inst.size === null ? <span className="text-text-dim">미상</span> : fmtSize(inst.size)}
      </span>
      <span className="min-w-0">{pct !== null && <SizeBar percentile={pct} />}</span>
      <span className="pf-accent text-text-dim text-right">{pct !== null && `${pct}%`}</span>
      <BestMark on={best} />
      <VariantMark on={inst.form === 'variant'} />
      {(onExhibit || onLock) && (
        <span className="flex items-center justify-end gap-0.5">
          {onExhibit && (
            <IconButton
              glyph="star" size={12} tone="dim" className="px-1"
              aria-label={`${label} 진열`}
              title="전시대에 올려요. 전시 중에는 팔리지 않아요"
              onClick={e => { e.stopPropagation(); onExhibit(); }} />
          )}
          {onLock && (
            <IconButton
              glyph={inst.locked ? 'lock' : 'lockOpen'} size={12}
              tone={inst.locked ? 'gold' : 'dim'}
              className="px-1"
              aria-label={`${label} ${inst.locked ? '잠금 해제' : '잠금'}`}
              onClick={e => { e.stopPropagation(); onLock(); }} />
          )}
        </span>
      )}
    </div>
  );
}

// 크기 미상 묶음 한 줄 — v0.4.0에서 넘어온 개체는 uid 말고 서로 다른 점이 없다.
// 개별로 그려도 고를 근거가 없고, 수천 마리면 화면이 죽는다. 그래서 마릿수로만 말한다.
// 선택·잠금도 묶음 단위: 구별할 수 없는 것을 하나씩 고르게 하는 UI는 선택이 아니라 노동이다.
export function UnsizedLine({
  count, form, locked, checked, onToggle, onLock, children,
}: {
  count: number;
  form: 'normal' | 'variant';
  locked: boolean;
  checked?: boolean;
  onToggle?: () => void;
  onLock?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={lineClass(children !== undefined, !!onToggle, checked === false || locked)}
         onClick={onToggle}
         role={onToggle ? 'button' : undefined}>
      {children !== undefined && <span>{children}</span>}
      <span className="pf-accent text-text-dim">미상</span>
      <span className="pf-accent text-text-dim">×{count}</span>
      <span />
      <span />
      <VariantMark on={form === 'variant'} />
      {onLock && (
        <IconButton
          glyph={locked ? 'lock' : 'lockOpen'} size={12}
          tone={locked ? 'gold' : 'dim'}
          className="justify-self-end px-1"
          aria-label={`크기 미상 ${form === 'variant' ? '돌연변이 ' : ''}${count}마리 ${locked ? '잠금 해제' : '잠금'}`}
          onClick={e => { e.stopPropagation(); onLock(); }} />
      )}
    </div>
  );
}
