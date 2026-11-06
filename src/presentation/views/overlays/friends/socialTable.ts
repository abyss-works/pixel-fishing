import { cx } from '../../../ui/cx';

// 소셜 창 표의 공통 모양(표 배치는 DataTable): 표 머리는 칸 위에 붙어 있고, 행은 34px 높이에 사이마다 옅은 선을 긋는다.

export const SOCIAL_HEAD = {
  row: 'sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim',
  left: 'h-[30px] text-left font-normal border-b border-line',
  right: 'h-[30px] px-2 text-right font-normal border-b border-line last:pr-0',
};

/** 행의 칸. 첫 행 위에는 선을 긋지 않는다 */
export const SOCIAL_CELL = (index: number) => cx('h-[34px]', index > 0 && 'border-t border-line/60');
