import '@testing-library/jest-dom/vitest';

// jsdom에는 canvas 구현이 없음 — 게임 코드는 ctx null 가드로 렌더링을 건너뜀
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
