// 패치노트 데이터 가드 — 버전은 중복 없이 내림차순이고 앞으로 낼 버전의 항목은 미리 넣지 않는다.
// 태그, 태그 순서, 요약, 문장 규칙도 함께 지킨다.
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

  it('첫 항목이 현재 버전 이하이고, 가장 최근 소식은 공개 항목이 있는 첫 버전이다', () => {
    expect(cmp(PATCH_NOTES[0].version, APP_VERSION)).toBeLessThanOrEqual(0);
    const firstPublic = PATCH_NOTES.find(p => p.notes.some(n => n.visible !== false));
    expect(latestNewsAtOrBelow(PATCH_NOTES, APP_VERSION)?.version).toBe(firstPublic?.version);
  });

  it('태그는 기능, UI, 밸런스, 수정, 기타 다섯 개 안에 있다', () => {
    for (const p of PATCH_NOTES) {
      for (const n of p.notes) expect(NOTE_TAGS, `${p.version} ${n.text}`).toContain(n.tag);
    }
  });

  it('한 버전 안에서 공개 항목의 태그는 기능, UI, 밸런스, 수정, 기타 순서를 지킨다', () => {
    for (const p of PATCH_NOTES) {
      const order = p.notes.filter(n => n.visible !== false).map(n => NOTE_TAGS.indexOf(n.tag));
      expect(order, p.version).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('공개 항목이 있는 버전은 요약이 비어 있지 않다', () => {
    for (const p of PATCH_NOTES) {
      if (p.notes.some(n => n.visible !== false)) expect(p.summary?.trim(), p.version).toBeTruthy();
    }
  });

  it('문장과 요약에 숫자가 없다. 그래픽 이름 v2가 든 문안만 예외다', () => {
    const exceptions = new Set([
      '실험 중인 v2 그래픽에서 마다가스카르의 물고기와 문어, 상어를 다시 그렸어요.',
      'v2 그래픽에서 픽셀이 끊겨 보이던 문제를 고쳤어요.',
      '설정에서 물고기 그래픽을 고를 수 있어요. 새로 그린 v2는 실험 중이라 일부 물고기의 모양이 실제와 다를 수 있어요.',
      'v2 그래픽에서는 돌연변이가 다른 모습으로 그려지고, 획득 카드와 도감에서 물고기가 움직여요.',
    ]);
    for (const p of PATCH_NOTES) {
      expect(p.summary ?? '', p.version).not.toMatch(/[0-9]/);
      for (const n of p.notes) {
        if (!exceptions.has(n.text)) expect(n.text, p.version).not.toMatch(/[0-9]/);
      }
    }
  });
});
