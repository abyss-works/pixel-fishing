import { useId, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Button from './Button';
import PixelIcon from './PixelIcon';
import Tip from './Tip';
import { useOmitted } from './useOmitted';

/** 글자의 렌더링 역할. required는 화면 용어의 필수, omittable은 생략이다. 역할을 정하지 않은 글자는 required다 */
export type TextRole = 'required' | 'omittable';

interface MenuCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'children'> {
  icon: ReactNode;
  /** 필수 — 카드가 좁아져도 자르지도 숨기지도 않는다 */
  title: string;
  sub?: string;
  /** sub의 역할. omittable이면 메뉴 영역이 좁거나 낮을 때 숨기고 마우스 호버와 키보드 포커스로 툴팁에 보인다 */
  subRole?: TextRole;
  /** 잠금 안내 줄들. 주어지면 카드는 흐려지고 오른쪽 위에 자물쇠가 붙는다. 누르거나 호버하거나 포커스하면 이 줄들이 공용 툴팁으로 열리고 onClick은 실행되지 않는다 */
  lock?: readonly string[];
}

// 메뉴 영역 카드 — 이름 붙은 size 컨테이너(basemenu) 안에서 쓴다. 폭과 아이콘 높이는 화면이 아니라 그 컨테이너 크기에서 정한다.
// 카드 폭(c)은 폭 기준 값과 높이 기준 값 중 작은 쪽을 54~128px로 자른다. 아이콘 높이는 0.44c를 24~56px로 자른다.
// 실측 카드 높이는 아이콘 높이 + 42.4px(테두리·여백 20, 간격 4, 제목 줄 약 18)이고, 설명 줄이 있으면 20.3px가 더해진다.
// 구역 한 줄 높이 = 카드 높이 + 50.5px(구역 여백·제목·간격), 메뉴 전체 = 헤더 문구와 간격 36 + 구역 줄 + 줄 사이 간격 12px.
//  - 폭 기준: 4장 구역(카드 4장 + 카드 사이 24px + 구역 여백 20px)이 좌우 여백 12%를 뺀 폭에 들어가야 한다. c <= 22% - 14px.
//    폭 320에서 카드 56.4px, 4장 구역 269.6px이 가용 폭 281.6px 안에 든다.
//    정보와 상점 구역(6장)이 한 줄에 놓이면 구역은 두 줄로 끝난다. 그 폭은 c <= 14.6% - 15px다.
//  - 높이 기준은 줄 수별로 다음 식에서 c를 푼 값이다(여유 6px 포함). 설명 줄이 없는 compact에서는
//    두 줄: 36 + 2 * (93 + 0.44c) + 12 + 6 <= H, c <= (H - 240) / 0.88
//    세 줄: 36 + 3 * (93 + 0.44c) + 24 + 6 <= H, c <= (H - 345) / 1.32
//    compact의 카드 폭 = max(min(두 줄 폭 기준, 두 줄 높이 기준), min(세 줄 폭 기준, 세 줄 높이 기준)).
//    두 줄 배치는 c가 두 줄 폭 기준 이하일 때, 세 줄 배치는 그 초과일 때 놓이므로 어느 쪽으로 놓여도 높이에 든다.
//    compact가 아닌 영역은 폭이 710px 이상이라 두 줄 이하로 놓이고 설명 줄(+20.3px)이 있다. c <= (H - 281) / 0.88
//  - 높이가 가장 작은 카드 폭(54px)으로도 모자라는 영역은 지원하는 화면 크기(PC 1280x720 이상, 모바일 360x780)에 없다. 메뉴는 세로로 스크롤하지 않는다.
// 카드 안쪽 폭은 폭 - 12px(테두리 4px, 좌우 여백 8px)이다. 54px 카드의 안쪽 42px에 제목 3글자(약 41px)가 들어간다.
// 생략 글자를 숨기는 조건은 menu-compact 변형이 정한다.
// 누르면 동작이 실행되는 카드이므로 터치(거친 포인터)에서는 생략한 설명을 툴팁으로 띄우지 않는다. 제목만으로 동작을 알 수 있다고 본다.
const CARD_WIDTH = [
  '[--card:clamp(54px,min(calc(14.6cqw-15px),calc((100cqh-281px)/0.88)),128px)]',
  'menu-compact:[--card:clamp(54px,max(min(calc(14.6cqw-15px),calc((100cqh-240px)/0.88)),min(calc(22cqw-14px),calc((100cqh-345px)/1.32))),128px)]',
].join(' ');

export default function MenuCard({ icon, title, sub, subRole = 'required', lock, className, onClick, ...rest }: MenuCardProps) {
  const { ref: subRef, isOmitted } = useOmitted<HTMLSpanElement>();
  const omittable = !!sub && subRole === 'omittable';
  const lockReasonId = useId();
  // 잠금 툴팁을 열 때 설명 줄이 숨겨져 있었는지. 숨겨졌다면 잠금 안내 아래에 설명도 함께 보인다
  const [subHidden, setSubHidden] = useState(false);
  const card = (
    <Button type="button" aria-label={sub ? `${title} ${sub}` : title} {...rest}
            onClick={lock ? undefined : onClick} aria-disabled={lock ? true : undefined}
            aria-describedby={lock ? lockReasonId : undefined}
            className={`relative flex w-(--card) flex-col items-center gap-1 px-1 py-2 ${CARD_WIDTH} ${lock ? 'opacity-55 cursor-not-allowed' : ''} ${className ?? ''}`}>
      {lock && <PixelIcon glyph="lock" size={14} className="absolute top-1 right-1 text-text" />}
      <span className="h-[clamp(24px,calc(var(--card)*0.44),56px)] w-full">{icon}</span>
      <span className="pf-accent text-sm text-gold">{title}</span>
      {sub && (omittable
        ? <span ref={subRef} data-omittable className="text-xs text-text-dim menu-compact:hidden">{sub}</span>
        : <span className="text-xs text-text-dim">{sub}</span>)}
    </Button>
  );
  if (lock) {
    const text = (
      <>
        {lock.map((line, i) => <span key={`${i}-${line}`} className="block">{line}</span>)}
        {omittable && subHidden && <span className="block text-text-dim">{sub}</span>}
      </>
    );
    // 판정은 툴팁을 여는 순간에 하므로 열기 전에 설명 줄의 숨김 여부를 읽어 둔다
    const readSubHidden = () => { setSubHidden(isOmitted()); return true; };
    return <Tip wraps pressOpens className="flex" onlyIf={readSubHidden} text={text}>
      {card}
      <span id={lockReasonId} className="sr-only">{lock.join(' ')}</span>
    </Tip>;
  }
  if (!omittable) return card;
  // 생략되어 보이지 않을 때만 툴팁으로 내용을 보인다. 감싼 칸이 같은 행의 카드 높이를 따르도록 flex로 둔다
  return <Tip wraps className="flex" onlyIf={isOmitted} text={sub}>{card}</Tip>;
}
