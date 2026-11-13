// 패치노트 데이터 가드 — 버전은 중복 없이 내림차순이고 앞으로 낼 버전의 항목은 미리 넣지 않는다.
// 태그, 태그 순서, 요약도 함께 지킨다.
import { describe, expect, it } from 'vitest';
import { latestNewsAtOrBelow } from '../../features/announcements/model/whatsNew';
import { APP_VERSION } from '../../version';
import { NOTE_TAGS, PATCH_NOTES } from './patchnotes';

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

  it('첫 항목이 현재 버전 이하이고, 가장 최근 소식은 첫 버전이다', () => {
    expect(cmp(PATCH_NOTES[0].version, APP_VERSION)).toBeLessThanOrEqual(0);
    expect(latestNewsAtOrBelow(PATCH_NOTES, APP_VERSION)?.version).toBe(PATCH_NOTES[0].version);
  });

  it('태그는 기능, UI, 밸런스, 수정, 기타 다섯 개 안에 있다', () => {
    expect(NOTE_TAGS).toEqual(['기능', 'UI', '밸런스', '수정', '기타']);
    for (const p of PATCH_NOTES) {
      for (const n of p.notes) expect(NOTE_TAGS, `${p.version} ${n.text}`).toContain(n.tag);
    }
  });

  it('한 버전 안에서 항목의 태그는 기능, UI, 밸런스, 수정, 기타 순서를 지킨다', () => {
    for (const p of PATCH_NOTES) {
      const order = p.notes.map(n => NOTE_TAGS.indexOf(n.tag));
      expect(order, p.version).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('모든 버전은 요약이 비어 있지 않다', () => {
    for (const p of PATCH_NOTES) {
      expect(p.summary?.trim(), p.version).toBeTruthy();
    }
  });
});
