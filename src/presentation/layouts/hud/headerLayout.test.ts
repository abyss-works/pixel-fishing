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
  const layout = code(read('layouts/hud/HudLayout.tsx'));
  const at = (needle: string) => {
    const i = layout.indexOf(needle);
    expect(i, `${needle}를 찾지 못했다`).toBeGreaterThanOrEqual(0);
    return i;
  };

  it('순서는 접속 칩, 미끼 칩, 시계, 지도 버튼이다 - 표시 상태를 바꾸는 버튼이 줄 끝이다', () => {
    const order = [at('{chips}'), at('aria-label="활성 미끼"'), at('<TimeBadge />'), at('aria-label="미니맵 보이기"')];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('시계는 칩 줄에서만 그린다 - 미니맵 안과 거점 그림 안, 메뉴 버튼 옆에는 두지 않는다', () => {
    const users = sourceFiles(root).filter(path => /<TimeBadge\b/.test(readFileSync(path, 'utf-8')));
    expect(users.map(path => path.replace(/\\/g, '/'))).toEqual(['src/presentation/layouts/hud/HudLayout.tsx']);
  });

  it('칩 줄은 미니맵을 숨겨도, 활성 미끼가 없어도 시계를 위해 늘 그린다', () => {
    const before = layout.slice(0, at('<TimeBadge />'));
    expect(before).not.toMatch(/\(chips \|\| activeBait/);
  });
});
