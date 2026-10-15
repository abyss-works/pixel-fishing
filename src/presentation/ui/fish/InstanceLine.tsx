import { sizePercentile } from '../../../game/rules/logic';
import type { FishInstance } from '../../../game/rules/logic';
import type { Fish } from '../../../game/content/fish';
import { cx } from '../cx';
import IconButton from '../IconButton';
import SizeBar from '../SizeBar';

// 개체 한 마리의 표시 — 가방 탭과 판매 패널이 같은 줄을 쓴다.
// **고정 그리드**다: 값의 자릿수가 달라도 열이 흔들리면 개체끼리 크기 비교가 안 된다.
//   [체크] [크기] [막대(1fr — 남는 폭을 전부 먹어 좌우로 펼친다)] [백분위] [최대] [변이] [버튼들]
// 행이 어종 단위로 묶이므로 변이 여부는 이 줄이 배지로 알린다 (bagRows 참고).
// 판정(방치/PERFECT)·잡은 날은 기록만 하고 걸지 않는다 — 여기서 내리는 판단은 "남길까 팔까"고
// 거기 쓰이는 건 크기뿐이다.
// 마지막 열은 auto — 진열·잠금 버튼 수가 화면마다 달라서(가방 둘, 판매 없음) 고정폭이면 넘친다.
// 버튼은 우측 정렬이라 자물쇠 위치는 줄마다 같다.
export const CELL = 'grid grid-cols-[13px_52px_1fr_34px_26px_26px_auto] items-center gap-2';

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
    inst.size === null ? null : `${inst.size.toFixed(1)}cm`,
    inst.form === 'variant' ? '변이' : null,
    fish.name,
  ].filter(Boolean).join(' ');

  return (
    <div className={cx(CELL, 'text-xs py-0.5 pl-4 pr-1',
                       onToggle && 'cursor-pointer hover:bg-surface-2',
                       (checked === false || inst.locked) && 'text-text-dim')}
         onClick={onToggle}
         role={onToggle ? 'button' : undefined}>
      <span>{children}</span>
      {/* 값은 픽셀 폰트(pf-accent = Silkscreen). 한글 글리프가 없는 건 폰트 스택이 폴백한다 */}
      <span className="pf-accent">
        {inst.size === null ? <span className="text-text-dim">미상</span> : `${inst.size.toFixed(1)}cm`}
      </span>
      <span className="min-w-0">{pct !== null && <SizeBar percentile={pct} />}</span>
      <span className="pf-accent text-text-dim text-right">{pct !== null && `${pct}%`}</span>
      <span className="text-gold text-center">{best && '최대'}</span>
      <span className="text-epic text-center">{inst.form === 'variant' && '변이'}</span>
      {(onExhibit || onLock) && (
        <span className="flex items-center justify-end gap-0.5">
          {onExhibit && (
            <IconButton
              glyph="star" size={12} tone="dim" className="px-1"
              aria-label={`${label} 진열`}
              title="전시대에 올린다 — 전시 중에는 팔리지 않는다"
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
    <div className={cx(CELL, 'text-xs py-0.5 pl-4 pr-1',
                       onToggle && 'cursor-pointer hover:bg-surface-2',
                       (checked === false || locked) && 'text-text-dim')}
         onClick={onToggle}
         role={onToggle ? 'button' : undefined}>
      <span>{children}</span>
      <span className="pf-accent text-text-dim">미상</span>
      <span className="pf-accent text-text-dim">×{count}</span>
      <span />
      <span />
      <span className="text-epic text-center">{form === 'variant' && '변이'}</span>
      {onLock && (
        <IconButton
          glyph={locked ? 'lock' : 'lockOpen'} size={12}
          tone={locked ? 'gold' : 'dim'}
          className="justify-self-end px-1"
          aria-label={`크기 미상 ${form === 'variant' ? '변이 ' : ''}${count}마리 ${locked ? '잠금 해제' : '잠금'}`}
          onClick={e => { e.stopPropagation(); onLock(); }} />
      )}
    </div>
  );
}
