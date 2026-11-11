// PC 레이아웃 헤더의 단계 - 스테이지 폭(헤더 행의 폭)으로 정하는 밀도 조절이다. 단계 경계(772px, 640px)는 이 파일에만 적는다.
// 헤더 행이 이 클래스를 달아 단계마다 CSS 변수 값을 바꾸고, 자원 바, 메뉴 버튼, 헤더 틀은 변수만 읽는다.
// 경계는 stage 컨테이너 쿼리라 뷰포트 폭이 아니라 스테이지 폭으로 판정하고, 레이아웃 판정(모바일/PC)과 별개다.
// @max-[Npx]는 폭이 N 미만일 때다.
//
// 기본(772 이상): 칸 사이 18px, 틀 안쪽 좌우 18px, 게이지 88px, 틀과 메뉴 버튼 60px, 행 바깥 여백 12px. 다섯 칸 한 행(wide)을 그린다.
// 간격 축소(640 이상 772 미만): 칸 사이 8px, 틀 안쪽 좌우 12px, 게이지 48px만 줄인다. 라벨과 글자 크기는 그대로다.
// 두 행(640 미만): 모바일 레이아웃 헤더와 같은 구성(rows). 틀 안쪽 좌우 6px, 위아래 4px, 메뉴 버튼 40px, 행 바깥 여백 8px, 틀 높이는 내용이 정한다.
//   wide와 rows는 같은 버튼 안의 두 본문이고 변수 --hdr-wide, --hdr-rows가 display 값을 골라 하나만 보인다.
export const HEADER_TIER_CLASS = [
  '[--hdr-inset:12px] [--hdr-gap:18px] [--hdr-pad:18px] [--hdr-pad-y:0px] [--hdr-gauge:88px] [--hdr-bar-h:60px] [--hdr-menu:60px] [--hdr-wide:flex] [--hdr-rows:none]',
  '@max-[772px]:[--hdr-gap:8px] @max-[772px]:[--hdr-pad:12px] @max-[772px]:[--hdr-gauge:48px]',
  '@max-[640px]:[--hdr-inset:8px] @max-[640px]:[--hdr-pad:6px] @max-[640px]:[--hdr-pad-y:4px] @max-[640px]:[--hdr-bar-h:auto] @max-[640px]:[--hdr-menu:40px] @max-[640px]:[--hdr-wide:none] @max-[640px]:[--hdr-rows:flex]',
].join(' ');

// 헤더가 두 행 단계인 스테이지 폭(640 미만)에서 숨기는 글자의 클래스다. PC 레이아웃에만 적용한다. 숨기는 글자는 입력을 받지 않는 표시의 생략 글자(낚시 상태 띠의 판정 영역 설명)다.
export const HEADER_ROWS_OMIT_CLASS = 'pc:@max-[640px]:hidden';
