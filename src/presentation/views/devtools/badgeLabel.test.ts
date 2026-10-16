import { describe, expect, it } from 'vitest';
import { envBadgeLabel } from './badgeLabel';

describe('환경 배지', () => {
  it('운영 빌드는 배지가 없다', () => {
    expect(envBadgeLabel('production')).toBeNull();
  });

  it('알 수 없는 환경도 배지를 띄우지 않는다 — 운영일 수 있으면 숨긴다', () => {
    expect(envBadgeLabel('')).toBeNull();
    expect(envBadgeLabel('staging?')).toBeNull();
  });

  it('스테이징·개발·로컬 빌드는 이름을 붙인다', () => {
    expect(envBadgeLabel('preview')).toBe('PREVIEW');
    expect(envBadgeLabel('development')).toBe('DEV BUILD');
    expect(envBadgeLabel('local')).toBe('LOCAL DEV');
  });
});
