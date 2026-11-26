// 개발 도구 패널 노출 조건 — 로컬 오리진 또는 서버가 내려 준 사용 판정.
import { describe, expect, it } from 'vitest';
import { canSeeDevTools } from './gate';

describe('개발 도구 패널 노출', () => {
  const where = (localOrigin: boolean) => ({ localOrigin });

  it('서버 판정이 참이면 비로컬 오리진에서도 열린다', () => {
    expect(canSeeDevTools(true, where(false))).toBe(true);
  });

  it('서버 판정이 거짓이거나 없으면 비로컬 오리진에서 닫힌다', () => {
    expect(canSeeDevTools(false, where(false))).toBe(false);
    expect(canSeeDevTools(undefined, where(false))).toBe(false);
  });

  it('로컬 오리진은 서버 판정과 무관하게 열린다', () => {
    expect(canSeeDevTools(false, where(true))).toBe(true);
    expect(canSeeDevTools(undefined, where(true))).toBe(true);
    expect(canSeeDevTools(true, where(true))).toBe(true);
  });
});
