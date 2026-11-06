import { describe, expect, it } from 'vitest';
import { isSheetDragClose, pressSheetTab } from './sheet';

const hasViews = (tab: string) => tab === 'bag' || tab === 'dex';

describe('pressSheetTab', () => {
  it('닫혀 있을 때 탭을 누르면 시트가 열린다. 고른 탭이 그대로면 탭 내용은 바꾸지 않는다', () => {
    expect(pressSheetTab({ open: false, active: 'bag' }, 'bag', hasViews)).toEqual({ open: true, select: false });
    expect(pressSheetTab({ open: false, active: 'bag' }, 'dex', hasViews)).toEqual({ open: true, select: true });
  });

  it('열려 있을 때 보기가 없는 같은 탭을 다시 누르면 닫힌다', () => {
    expect(pressSheetTab({ open: true, active: 'help' }, 'help', hasViews)).toEqual({ open: false, select: false });
  });

  it('열려 있을 때 보기가 있는 같은 탭을 다시 누르면 열어 둔 채 보기를 순환한다', () => {
    expect(pressSheetTab({ open: true, active: 'bag' }, 'bag', hasViews)).toEqual({ open: true, select: true });
    expect(pressSheetTab({ open: true, active: 'dex' }, 'dex', hasViews)).toEqual({ open: true, select: true });
  });

  it('닫혀 있을 때 보기가 있는 활성 탭을 누르면 열기만 한다', () => {
    expect(pressSheetTab({ open: false, active: 'dex' }, 'dex', hasViews)).toEqual({ open: true, select: false });
  });

  it('열려 있을 때 다른 탭을 누르면 내용만 바뀐다', () => {
    expect(pressSheetTab({ open: true, active: 'bag' }, 'help', hasViews)).toEqual({ open: true, select: true });
  });
});

describe('isSheetDragClose', () => {
  it('아래로 48px 이상 끌면 닫는다', () => {
    expect(isSheetDragClose(100, 148)).toBe(true);
    expect(isSheetDragClose(100, 147)).toBe(false);
  });
  it('위로 끌거나 제자리면 닫지 않는다', () => {
    expect(isSheetDragClose(100, 40)).toBe(false);
    expect(isSheetDragClose(100, 100)).toBe(false);
  });
});
