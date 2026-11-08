import type { ReactNode } from 'react';
import { cx } from './cx';
import { useKeyBlocker } from './hotkeys';
import PageTitle from './PageTitle';
import CloseButton from './CloseButton';
import { SCROLL_Y } from './scrollArea';

/** 스테이지 창의 고정 높이(px). 탭 창처럼 높이가 변하지 않는 창이 고른다. 스테이지 높이에서 위아래 16px을 뺀 값을 넘지 않는다 */
export type ModalHeight = 400 | 480 | 520 | 560;
const HEIGHT_CLASS: Record<ModalHeight, string> = {
  400: 'h-[min(400px,calc(100%-32px))]',
  480: 'h-[min(480px,calc(100%-32px))] mobile:h-auto',
  520: 'h-[min(520px,calc(100%-32px))] mobile:h-auto',
  560: 'h-[min(560px,calc(100%-32px))] mobile:h-auto',
};

// 앱 모달의 본문 칸 — 박스가 넘치면 제목은 두고 이 칸만 스크롤한다. 오른쪽 음수 여백 14px은 막대 자리(6px)와 내용 사이 여백(8px)을
// 박스의 안쪽 여백(16px) 쪽으로 내어 내용 폭을 그대로 두고 막대를 박스 안쪽 가장자리에 놓는다.
// 본문 칸은 세로 flex라서, 줄 수로 높이를 정한 스크롤 칸(max-h)이 직계 자식이면 남는 높이에 맞춰 줄어든다.
const APP_BODY = `${SCROLL_Y} -mr-3.5 flex-auto min-h-0 flex flex-col`;

interface ModalBase {
  title?: string;
  /** app 전용 — 데이터량이 큰 모달(관리자 대시보드) 확폭 */
  wide?: boolean;
  /** 수배판처럼 2배 너비가 필요한 모달(앱·스테이지 모두) */
  xl?: boolean;
  /** app 전용 — 400 폭 창(설정 탭이 여는 창) */
  narrow?: boolean;
  /** stage 전용 — 목록이나 탭이 있는 중간 너비 창(680px) */
  md?: boolean;
  onClose: () => void;
  /** false면 닫기 X와 백드롭 닫기를 모두 막는다 (새 버전 안내처럼 출구가 하나뿐인 모달) */
  closable?: boolean;
  children: ReactNode;
}

// layer: app = 화면 전체(fixed) 박스형 모달(계정/도감 상세/관리자) ·
//        stage = 게임 스테이지 안(absolute) 투명 컨테이너(정비 — 내용이 직접 Panel 프레임을 가진다)
// 스테이지 모달의 투명 래퍼는 배치만 맡는다. 그래서 스테이지는 className을 받지 않고(타입으로 막는다),
// 필요한 높이만 height로 고른다. 스크롤은 ModalCard의 본문이 맡는다.
type ModalProps = ModalBase & (
  | { layer: 'stage'; height?: ModalHeight; className?: never; header?: never; footer?: never }
  | { layer?: 'app'; className?: string; height?: never; header?: ReactNode; footer?: ReactNode }
);

// 공통 모달 — 백드롭 클릭으로 닫히고, 내용 클릭은 전파를 막는다.
// 모바일 레이아웃에서는 폭 단계 대신 화면 폭에서 좌우 24px을 뺀 폭을 쓰고(바깥을 눌러 닫을 자리), 높이 상한(위아래 24px)을 넘으면 창 안에서 세로로 스크롤한다.
// 스크롤은 보이는 틀 안에서만 하고 제목은 고정이다: 앱 모달은 박스 안의 본문 한 칸(공용 세로 스크롤 칸)이 스크롤하고,
// 스테이지 모달의 투명 래퍼는 배치만 맡고 스크롤은 ModalCard의 본문이 맡는다.
// 앱 모달에서 제목 줄이 문자열 title로 안 되면 header로, 하단 고정 영역(버튼 줄)은 footer로 넘긴다. 둘 다 스크롤 칸 밖이다.
export default function Modal({ layer = 'app', title, wide, xl, md, narrow, onClose, closable = true, children, className, height, header, footer }: ModalProps) {
  // 모달이 떠 있는 동안 아래 레이어(필드 이동·사이드바 단축키)는 키를 못 받는다.
  // 예전엔 각자 `isTyping`으로 막았는데 그건 텍스트 포커스만 걸러서, 모달 버튼에 포커스가
  // 있으면 뒤에서 캐릭터가 움직이고 탭이 바뀌었다 (로그인 모달 키 탈취 사고).
  // Esc는 닫을 수 있는 창에서만 X와 같은 출구다.
  useKeyBlocker(closable ? onClose : undefined);
  const backdrop = layer === 'app'
    ? 'fixed inset-0 z-(--z-app-modal) bg-[rgba(4,9,18,0.7)]'
    : 'absolute inset-0 z-(--z-stage-modal) bg-[rgba(4,9,18,0.6)]';
  const box = layer === 'app'
    ? cx('relative flex flex-col bg-surface border border-line rounded-md shadow-panel p-4 max-w-[90vw] max-h-[80vh]',
        xl ? 'w-[min(920px,calc(100%-32px))]' : wide ? 'w-[560px]' : narrow ? 'w-[min(400px,calc(100%-32px))]' : 'w-[480px]',
        'mobile:w-[calc(100%-48px)] mobile:max-w-none mobile:max-h-[calc(100dvh-48px)]')
    : cx('max-h-[calc(100%-32px)] flex flex-col',
        xl ? 'w-[min(920px,calc(100%-32px))]' : md ? 'w-[min(680px,calc(100%-32px))]' : 'w-[min(400px,calc(100%-32px))]',
        'mobile:w-[calc(100%-48px)] mobile:max-h-[calc(100%-48px)]', height && HEIGHT_CLASS[height]);
  return (
    <div className={cx(backdrop, 'flex items-center justify-center animate-fade-in')}
         onClick={closable ? onClose : undefined}>
      <div className={cx(box, className)} onClick={e => e.stopPropagation()}
           role="dialog" aria-modal="true" aria-label={title}>
        {/* 앱 모달의 닫기 X — 스테이지 모달은 내용(Panel)이 자기 X를 가진다 */}
        {layer === 'app' && closable && <CloseButton onClose={onClose} className="top-3 right-3" />}
        {title && <PageTitle className={cx('mb-2', layer === 'app' && 'pr-6')}>{title}</PageTitle>}
        {layer === 'app' && header && <div className="shrink-0">{header}</div>}
        {layer === 'app' ? <div className={APP_BODY}>{children}</div> : children}
        {layer === 'app' && footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
