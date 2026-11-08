import { cx } from './cx';

// 수 배지 - 메뉴 줄처럼 작은 줄에 붙는 채움 배지. 색은 tone이 정한다: danger는 처리할 알림(받은 요청, 받지 않은 우편),
// gold와 epic은 일반 의뢰와 네임드 의뢰의 오늘 남은 클리어다. 100 이상은 99+로 줄인다.
// 어느 종류인지는 data-badge로 남겨 읽는 쪽이 색 없이도 구분한다.
const TONE = { danger: 'bg-danger', gold: 'bg-gold', epic: 'bg-epic' } as const;
export type CountBadgeTone = keyof typeof TONE;

export default function CountBadge({ tone, count }: { tone: CountBadgeTone; count: number }) {
  return (
    <span data-badge={tone} className={cx('pf-accent px-1 text-2xs text-bg', TONE[tone])}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
