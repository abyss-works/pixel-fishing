/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 헤더와 칩 줄의 구성을 소스로 고정한다. 같은 구조가 다시 어긋나지 않게 하는 가드다.
const root = 'src/presentation';
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');
const code = (src: string) => src.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('헤더 구성', () => {
  it('헤더에 의뢰 현황이 없다 - 의뢰는 메뉴 줄에서 연다', () => {
    const header = code(read('layouts/hud/HudHeader.tsx'));
    expect(header).not.toMatch(/QuestStatus/);
    expect(header).not.toMatch(/onOpenQuests/);
    const all = sourceFiles(root).map(path => readFileSync(path, 'utf-8')).join('\n');
    expect(all).not.toMatch(/QuestStatus/);
  });
});

describe('미니맵 위 칩 줄', () => {
  // 칩 줄의 항목 순서와 조건 없이 그려지는 것은 HudLayout.test가 렌더링 결과로 검증한다
  it('시계는 칩 줄에서만 그린다 - 미니맵 안과 거점 그림 안, 메뉴 버튼 옆에는 두지 않는다', () => {
    const users = sourceFiles(root).filter(path => /<TimeBadge\b/.test(readFileSync(path, 'utf-8')));
    expect(users.map(path => path.replace(/\\/g, '/'))).toEqual(['src/presentation/layouts/hud/HudLayout.tsx']);
  });
});
