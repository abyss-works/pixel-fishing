// PC 레이아웃 스테이지 안 배치의 쌓기 단계 - 스테이지 폭 464 미만이면 메시지 창과 오른쪽 아래 열을 모바일 레이아웃의 게임 영역처럼 쌓는다.
// 경계 464px은 이 파일에만 적는다. 한 행 단계에서 메시지 창(좁을 때 58%)과 오른쪽 아래 열(32.5%, 최소 156px)이 간격 12px을 두고 나란히 들어가는
// 가장 좁은 폭 457.2px을 4px 단위로 올리고 4px 여유를 더한 값이다. 경계는 stage 컨테이너 쿼리라 뷰포트 폭이 아니라 스테이지 폭으로 판정한다.
// 접두사 pc:는 모바일 레이아웃(뷰포트 768 미만)을 제외한다. 모바일 레이아웃은 같은 배치를 mobile: 변형으로 이미 갖고 있다.
// @max-[Npx]는 폭이 N 미만일 때다. 값(여백 8px, 열 156px, 메시지 창 5줄)은 모바일 레이아웃과 같다.

/** 줄기 - 오른쪽 아래 열과 메시지 창을 담아 스테이지 아래에 세로로 쌓는다(HudLayout) */
export const STACK_TRUNK_CLASS = 'pc:@max-[464px]:absolute pc:@max-[464px]:inset-x-2 pc:@max-[464px]:bottom-2 pc:@max-[464px]:flex pc:@max-[464px]:flex-col pc:@max-[464px]:items-end pc:@max-[464px]:gap-2 pc:@max-[464px]:pointer-events-none';

/** 오른쪽 아래 열 - 줄기 안 오른쪽 정렬의 첫 자식이 된다 */
export const STACK_COLUMN_CLASS = 'pc:@max-[464px]:relative pc:@max-[464px]:right-auto pc:@max-[464px]:bottom-auto pc:@max-[464px]:w-[156px]';

/** 메시지 창 - 줄기의 마지막 자식으로 폭 전체를 쓰고 기록 5줄을 보인다(--log-lines) */
export const STACK_LOG_CLASS = 'pc:@max-[464px]:relative pc:@max-[464px]:left-auto pc:@max-[464px]:bottom-auto pc:@max-[464px]:w-full pc:@max-[464px]:[--log-lines:5]';

/** 부가 줄 - 렌더링 역할이 생략인 글자. 숨기고 툴팁으로 넘긴다(useOmitted) */
export const STACK_OMIT_CLASS = 'pc:@max-[464px]:hidden';

/** 16:9 그림 프레임 - 스테이지 전체로 넓히고 그림 위아래 남는 자리를 바탕색(--fill-top, --fill-bottom)으로 채운다(GameFrame fill) */
export const STACK_FRAME_FILL_CLASS = 'pc:@max-[464px]:absolute pc:@max-[464px]:inset-0 pc:@max-[464px]:w-auto pc:@max-[464px]:aspect-auto pc:@max-[464px]:bg-[linear-gradient(var(--fill-top)_50%,var(--fill-bottom)_50%)]';

/** 거점 카드 메뉴 - PC 레이아웃은 헤더가 스테이지 위에 겹치므로 메뉴 영역을 헤더 아래부터 시작하게 한다(모든 폭 단계 공통, 카드는 영역 위쪽부터 놓인다). 여백은 헤더 최대 높이(두 행 단계 약 56px)보다 조금 크게 잡는다. 모바일 레이아웃은 영역이 이미 헤더 아래라 0이다 */
export const STACK_MENU_CLASS = 'pc:top-16';
