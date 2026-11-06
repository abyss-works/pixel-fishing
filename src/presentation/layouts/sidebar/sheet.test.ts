import { describe, expect, it } from 'vitest';
import { isSheetDragClose, pressSheetTab } from './sheet';

describe('pressSheetTab', () => {
  it('닫혀 있을 때 탭을 누르면 시트가 열린다. 고른 탭이 그대로면 탭 내용은 바꾸지 않는다', () => {
    expect(pressSheetTab({ open: false, active: 'bag' }, 'bag')).toEqual({ open: true, select: false });
    expect(pressSheetTab({ open: false, active: 'bag' }, 'dex')).toEqual({ open: true, select: true });
  });

  it('열려 있을 때 같은 탭을 다시 누르면 닫힌다', () => {
    expect(pressSheetTab({ open: true, active: 'bag' }, 'bag')).toEqual({ open: false, select: false });
  });

  it('열려 있을 때 다른 탭을 누르면 내용만 바뀐다', () => {
    expect(pressSheetTab({ open: true, active: 'bag' }, 'help')).toEqual({ open: true, select: true });
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
