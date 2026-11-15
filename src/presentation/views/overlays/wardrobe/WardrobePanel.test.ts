/// <reference types="node" />
// 옷장 창 소스 가드 - 업적 모자 상세 칸의 해금 조건은 말줄임하지 않고 칸 안에서 줄을 바꾼다.
// jsdom은 레이아웃을 계산하지 못해 넘침 자체를 증명하지 못한다. 여기서는 그것을 막는 클래스와 고정 높이를 고정한다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/presentation/views/overlays/wardrobe/WardrobePanel.tsx', 'utf-8');

/** 해금 조건 줄 span의 className 목록 */
const unlockClasses = () => {
  const found = /<span className="([^"]*)"[^>]*>해금 조건/.exec(source);
  if (!found) throw new Error('해금 조건 span을 찾지 못했다');
  return found[1].split(/\s+/);
};

/** 상세 칸을 그리는 Inset 두 자리의 className 목록. 찾지 못하면 통과하지 않고 실패한다. */
const detailCellClasses = () => {
  const start = source.indexOf('function HatDetailBox');
  if (start < 0) throw new Error('상세 칸 컴포넌트를 찾지 못했다');
  const rest = source.slice(start + 1);
  const next = rest.search(/\nfunction /);
  const body = next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
  const cells = [...body.matchAll(/<Inset className="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
  if (cells.length !== 2) throw new Error(`상세 칸 Inset 두 자리를 찾지 못했다 (찾은 수: ${cells.length})`);
  return cells;
};

describe('옷장 창 - 업적 모자 상세 칸', () => {
  it('해금 조건은 말줄임하지 않고 칸 안에서 줄을 바꾼다', () => {
    const classes = unlockClasses();
    for (const name of ['truncate', 'overflow-hidden', 'text-ellipsis']) expect(classes).not.toContain(name);
    expect(classes).toContain('break-keep');
    expect(classes).toContain('break-words');
  });

  it('상세 칸은 두 경우 모두 높이 84px로 고정한다', () => {
    for (const classes of detailCellClasses()) {
      expect(classes).toContain('h-[84px]');
      expect(classes.filter((name) => /^(min-h-|max-h-)/.test(name))).toEqual([]);
      expect(classes).toContain('shrink-0');
    }
  });
});
