import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { cx } from './cx';
import { HighlightRarityText } from './fish/RarityTag';
import { useKeyScope } from './hotkeys';
import PixelIcon from './PixelIcon';
import TooltipBubble from './TooltipBubble';
import { anchorOf } from './tooltipPlacement';
import type { Anchor } from './tooltipPlacement';
import { useCoarsePointer } from './useMediaQuery';

// 툴팁: 설명이 붙은 요소. 마우스를 올리거나 키보드로 포커스하면 설명 버블이 뜬다.
// 설명이 있다는 표시는 점선 밑줄 하나뿐이고, 따로 물음표 아이콘을 붙이지 않는다.
// 막대처럼 글자가 없는 요소는 plain으로 밑줄을 뺀다. 설명은 단문이나 구조형 카드(TipCard)·목록(TipList)이다.
// 버튼처럼 스스로 포커스를 받는 요소를 감쌀 때는 wraps로 감싼 쪽이 포커스를 받게 하고, 툴팁 자리에는 탭 정지를 두지 않는다.
// 터치처럼 마우스를 올릴 수 없는 거친 포인터에서는 누르면 열고 다시 누르거나 바깥을 누르면 닫는다.
// 열려 있는 동안 Esc를 누르거나 스크롤이 발생하면 닫힌다.
// 버튼을 감싼 툴팁(wraps)은 비활성 버튼을 누를 때 연다: 비활성 버튼은 누르기를 받지 않아 감싼 자리가 받는다.
// 켜진 버튼을 눌러도 설명을 띄워야 하면(스킬 머리처럼 누르기 동작과 설명이 함께 있을 때) pressOpens를 준다.
// hoverOnly는 거친 포인터(터치)에서 어떤 경로로도 열지 않는다. 누르면 동작이 실행되는 요소 안의 칸(헤더의 자원 바 칸 등)에 쓴다 -
// 감싼 칸의 여백을 눌러도 툴팁이 동작과 함께 열리지 않는다.
// 버블은 TooltipBubble이다. 요소의 왼쪽 아래에서 펼치고, 화면 끝에 닿으면 안쪽으로 들어온다.

const highlightText = (node: ReactNode): ReactNode =>
  typeof node === 'string' ? <HighlightRarityText text={node} /> : node;

function TipClose({ onClose }: { onClose: () => void }) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useKeyScope(e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeRef.current();
    return true;
  });

  useEffect(() => {
    const onScroll = () => closeRef.current();
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  return null;
}

export default function Tip({ text, plain, wraps, pressOpens, hoverOnly, onlyIf, className, style, children }: {
  text: ReactNode;
  /** 밑줄 없이 감싼다(진행 막대 등) */
  plain?: boolean;
  /** 포커스를 받는 요소(버튼 등)를 감싼다. 감싼 요소의 포커스로 띄우고, 밑줄을 두지 않는다 */
  wraps?: boolean;
  /** 감싼 요소를 눌러 동작하면서 설명도 함께 연다(거친 포인터). 켜진 버튼을 감싸도 설명이 뜨는 곳에 쓴다 */
  pressOpens?: boolean;
  /** 거친 포인터(터치)에서는 열지 않는다. 마우스 호버와 키보드 포커스에서만 뜬다 */
  hoverOnly?: boolean;
  /** 주어지면 이 판정이 참일 때만 설명을 연다(보이지 않는 내용을 대신 알리는 곳에 쓴다) */
  onlyIf?: () => boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // open이 false면 닫힘, anchor가 null이면 rect를 못 주는 환경이다
  const [open, setOpen] = useState<{ anchor: Anchor | null } | null>(null);

  const coarse = useCoarsePointer();

  const show = () => { if (hoverOnly && coarse) return; if (!onlyIf || onlyIf()) setOpen({ anchor: anchorOf(ref.current) }); };
  const hide = () => setOpen(null);

  // 거친 포인터: 열려 있는 동안 대상 바깥을 누르면 닫는다
  const isOpen = open !== null;
  useEffect(() => {
    if (!coarse || !isOpen) return;
    const onDown = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [coarse, isOpen]);

  const hover = coarse ? {
    onClick: (e: MouseEvent<HTMLSpanElement>) => {
      if (wraps && !pressOpens && e.target !== e.currentTarget) return;
      if (open) hide(); else show();
    },
  } : { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };

  return (
    <>
      <span ref={ref} tabIndex={wraps ? undefined : 0} {...hover} style={style}
            className={cx(coarse && wraps && '[&_:disabled]:pointer-events-none', !wraps && 'cursor-help', !plain && !wraps && 'underline decoration-dotted decoration-text-dim underline-offset-[3px]', className)}>
        {children}
      </span>
      {isOpen && <TipClose onClose={hide} />}
      {open && <TooltipBubble anchor={open.anchor} className="font-sans font-normal">{highlightText(text)}</TooltipBubble>}
    </>
  );
}

export type TipRow =
  | { label: ReactNode; value: ReactNode; badge?: ReactNode }
  | { text: ReactNode };

/** 구조형 툴팁 카드 — 헤더(제목·배지·부제) → 본문/목록 → 구분선 아래 상태/잠금 → 하단 주석 순서를 고정한다 */
export function TipCard({ title, subtitle, badge, description, rows, status, note }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  rows?: readonly TipRow[];
  status?: { tone: 'lock' | 'warn' | 'info'; lines: readonly ReactNode[] };
  note?: ReactNode;
}) {
  const hasHeader = Boolean(title || subtitle || badge);
  const hasBody = Boolean(description) || (rows !== undefined && rows.length > 0);
  const hasStatus = Boolean(status && status.lines.length > 0);
  return (
    <span className="flex flex-col gap-1.5 min-w-40">
      {hasHeader && (
        <span className="flex flex-col gap-0.5">
          {(title || badge) && (
            <span className="flex items-center justify-between gap-2">
              {title && <b className="text-text font-bold leading-snug">{highlightText(title)}</b>}
              {badge && <span className="shrink-0">{badge}</span>}
            </span>
          )}
          {subtitle && <span className="text-2xs text-text-dim leading-snug">{highlightText(subtitle)}</span>}
        </span>
      )}
      {hasBody && (
        <span className={cx('flex flex-col gap-1', hasHeader && 'pt-1.5 border-t border-line')}>
          {description && <span className="text-text leading-snug">{highlightText(description)}</span>}
          {rows && rows.length > 0 && (
            <span className="flex flex-col">
              {rows.map((r, i) => 'text' in r ? (
                <span key={typeof r.text === 'string' ? `${i}-${r.text}` : i} className="py-0.5 text-text leading-snug">
                  {highlightText(r.text)}
                </span>
              ) : (
                <span key={typeof r.label === 'string' ? `${i}-${r.label}` : i} className="flex items-center justify-between gap-4 py-0.5">
                  <span className="flex items-center gap-1.5 text-text-dim">
                    <span>{highlightText(r.label)}</span>
                    {r.badge}
                  </span>
                  <span className="pf-accent text-text shrink-0">{highlightText(r.value)}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
      {hasStatus && status && (
        <span className={cx('flex items-start gap-1.5', (hasHeader || hasBody) && 'pt-1.5 border-t border-line')}>
          {status.tone === 'lock' && <PixelIcon glyph="lock" size={11} className="shrink-0 mt-[3px] text-text-dim" />}
          {status.tone === 'warn' && <PixelIcon glyph="warn" size={11} className="shrink-0 mt-[3px] text-danger" />}
          <span className="flex flex-col gap-0.5 min-w-0">
            {status.lines.map((line, i) => (
              <span key={typeof line === 'string' ? `${i}-${line}` : i}
                    className={cx('block leading-snug', i === 0 ? (status.tone === 'warn' ? 'text-danger' : 'text-text') : 'text-text-dim')}>
                {i === 0 && status.tone === 'warn' ? line : highlightText(line)}
              </span>
            ))}
          </span>
        </span>
      )}
      {note && (
        <span className={cx('text-2xs text-text-dim leading-snug', (hasHeader || hasBody || hasStatus) && 'pt-1.5 border-t border-line')}>
          {highlightText(note)}
        </span>
      )}
    </span>
  );
}

/** 툴팁 안의 목록: 이름은 왼쪽, 값은 오른쪽. 아래에 덧붙일 한 줄(note)을 둘 수 있다 */
export function TipList({ rows, note }: { rows: readonly { label: ReactNode; value: ReactNode }[]; note?: ReactNode }) {
  return (
    <span className="flex flex-col gap-1 min-w-40">
      <span className="flex flex-col">
        {rows.map((r, i) => (
          <span key={typeof r.label === 'string' ? `${i}-${r.label}` : i} className="flex items-center justify-between gap-4 py-0.5">
            <span className="text-text-dim">{highlightText(r.label)}</span><span className="pf-accent text-text">{highlightText(r.value)}</span>
          </span>
        ))}
      </span>
      {note && <span className="pt-1 border-t border-line text-2xs text-text-dim">{highlightText(note)}</span>}
    </span>
  );
}
