// 패치노트 데이터 가드 — 버전은 중복 없이 내림차순이고 앞으로 낼 버전의 항목은 미리 넣지 않는다.
import { describe, expect, it } from 'vitest';
import { latestNewsAtOrBelow } from '../../features/announcements/model/whatsNew';
import { APP_VERSION } from '../../version';
import { PATCH_NOTES } from './patchnotes';

const parts = (v: string) => v.split('.').map(Number);
const cmp = (a: string, b: string) => {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

describe('PATCH_NOTES 데이터', () => {
  it('버전이 중복 없이 내림차순이다', () => {
    for (let i = 1; i < PATCH_NOTES.length; i++) {
      expect(cmp(PATCH_NOTES[i - 1].version, PATCH_NOTES[i].version), PATCH_NOTES[i].version).toBeGreaterThan(0);
    }
  });

  it('첫 항목이 현재 버전 이하이고 가장 최근 소식과 같다', () => {
    expect(cmp(PATCH_NOTES[0].version, APP_VERSION)).toBeLessThanOrEqual(0);
    expect(latestNewsAtOrBelow(PATCH_NOTES, APP_VERSION)).toBe(PATCH_NOTES[0]);
  });
});
