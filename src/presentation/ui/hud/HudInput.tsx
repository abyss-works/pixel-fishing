import type { ComponentProps } from 'react';
import { cx } from '../cx';
import { NOTCH_SM } from '../notch';
import Tip from '../Tip';

// HUD 입력 칸 — 캔버스 위 입력 줄의 오목한 노치 칸(채팅 입력 등). 높이 28px, 포커스를 받으면 골드 테두리다.
// blocked를 주면 입력 대신 같은 모양의 흐린 칸에 안내 문구를 두고, 이유를 게임 툴팁으로 보인다.
export const HUD_INPUT_BOX = cx('h-7 min-w-0 flex-1 flex items-center px-2 text-xs border-2 border-line', NOTCH_SM,
  'bg-[color-mix(in_oklab,var(--c-bg)_80%,transparent)] shadow-[inset_2px_2px_0_var(--bevel-hi)]');

export default function HudInput({ blocked, className, ...props }: ComponentProps<'input'> & {
  /** 쓸 수 없는 입력 칸 — 칸에 보일 안내(text)와 툴팁으로 보일 이유(reason) */
  blocked?: { text: string; reason: string };
}) {
  if (blocked) {
    return (
      <span className={cx(HUD_INPUT_BOX, 'text-text-dim opacity-60', className)}>
        <Tip text={blocked.reason} className="truncate">{blocked.text}</Tip>
      </span>
    );
  }
  return (
    <input className={cx(HUD_INPUT_BOX, 'text-text placeholder:text-text-dim outline-none focus:border-gold', className)}
           {...props} />
  );
}
