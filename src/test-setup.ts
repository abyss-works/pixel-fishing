import '@testing-library/jest-dom/vitest';

// jsdom에는 canvas 구현이 없음 — 게임 코드는 ctx null 가드로 렌더링을 건너뜀.
// node 환경 테스트(서버 소켓)에는 DOM이 없어 건너뛴다.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
