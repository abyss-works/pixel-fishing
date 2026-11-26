// 최초 구글 연결 환영 보상 계약 — 서버의 멱등 우편 발송과 화면의 보상 안내가 공유하는 단일 정본.

export const FIRST_LINK_REWARD_KEY = 'google-first-link-reward';

export const FIRST_LINK_REWARD_ITEMS = [
  { id: 'luck-small', qty: 1 },
  { id: 'cook-lunch-bundle', qty: 1 },
  { id: 'cook-bait-legendary', qty: 3 },
] as const;

export const FIRST_LINK_REWARD_MAIL = {
  title: '출항 연결 선물',
  body: '구글 계정을 처음 연결해 출항 준비 선물을 보냈어요. 작은 바다 영약, 생선 탈리, 용연향 미끼를 가방의 아이템 탭에서 사용해 보세요.',
} as const;
