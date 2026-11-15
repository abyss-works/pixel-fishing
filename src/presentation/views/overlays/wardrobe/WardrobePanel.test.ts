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

describe('옷장 창 - 업적 모자 상세 칸', () => {
  it('해금 조건은 말줄임하지 않고 칸 안에서 줄을 바꾼다', () => {
    const classes = unlockClasses();
    for (const name of ['truncate', 'overflow-hidden', 'text-ellipsis']) expect(classes).not.toContain(name);
    expect(classes).toContain('break-keep');
    expect(classes).toContain('break-words');
  });

  it('상세 칸은 두 경우 모두 높이 84px로 고정한다', () => {
    expect(source.match(/\bh-\[84px\]/g)).toHaveLength(2);
  });
});
