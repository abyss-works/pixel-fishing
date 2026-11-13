import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_TARGETS } from '../../src/game/content/sprites/targets';
import { OUTLINE_DARK, SILHOUETTE } from '../../src/game/content/sprites/common';
import { targetsScript } from './targetsScript';

const here = dirname(fileURLToPath(import.meta.url));

/** 생성된 스크립트가 에디터 페이지에 싣는 데이터를 꺼낸다 */
function evalScript(src: string): { outline: string; silhouette: string; targets: typeof SPRITE_TARGETS } {
  const win: Record<string, unknown> = {};
  new Function('window', src)(win);
  return win.SPRITE_EDITOR_DATA as ReturnType<typeof evalScript>;
}

describe('에디터용 대상 정의 스크립트', () => {
  it('모든 대상 정의와 공통 색을 그대로 싣는다', () => {
    const data = evalScript(targetsScript());
    expect(data.targets).toEqual(JSON.parse(JSON.stringify(SPRITE_TARGETS)));
    expect(data.outline).toBe(OUTLINE_DARK);
    expect(data.silhouette).toBe(SILHOUETTE);
  });

  it('격자가 미정인 대상은 layout이 null로 실린다', () => {
    const data = evalScript(targetsScript());
    expect(data.targets.artifact.layout).toBeNull();
  });

  it('저장소의 생성 파일이 정의와 같다', () => {
    const file = readFileSync(resolve(here, 'targets.generated.js'), 'utf-8');
    expect(file).toBe(targetsScript());
  });

  it('에디터 페이지가 그 스크립트를 불러온다', () => {
    const html = readFileSync(resolve(here, 'index.html'), 'utf-8');
    expect(html).toContain('<script src="targets.generated.js"></script>');
  });
});
