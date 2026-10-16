import { beforeEach, describe, expect, it } from 'vitest';
import { clampPanel, defaultPanelPosition, loadPanelPosition, savePanelPosition, PANEL_POSITION_KEY } from './panelPosition';

const viewport = { width: 1600, height: 900 };
const size = { width: 520, height: 800 };

describe('개발 도구 패널 위치', () => {
  beforeEach(() => { localStorage.clear(); });

  it('기본 위치는 화면 오른쪽 위다', () => {
    expect(defaultPanelPosition(viewport, size)).toEqual({ x: 1600 - 520 - 16, y: 16 });
  });

  it('머리줄이 화면 밖으로 나가지 않게 가둔다', () => {
    expect(clampPanel({ x: -300, y: -50 }, viewport, size)).toEqual({ x: 0, y: 0 });
    expect(clampPanel({ x: 5000, y: 5000 }, viewport, size)).toEqual({ x: 1600 - 520, y: 900 - 40 });
  });

  it('옮긴 위치를 기기에 남기고, 깨진 값은 버린다', () => {
    savePanelPosition({ x: 100, y: 200 });
    expect(loadPanelPosition()).toEqual({ x: 100, y: 200 });
    localStorage.setItem(PANEL_POSITION_KEY, '{"x":"a"}');
    expect(loadPanelPosition()).toBeNull();
  });
});
