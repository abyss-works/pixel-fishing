import { describe, expect, it } from 'vitest';
import { keyboardStyle, visibleBox } from './visibleBox';

describe('visibleBox', () => {
  it('보이는 영역이 레이아웃 뷰포트와 같으면 여백이 없다', () => {
    expect(visibleBox(844, 844, 0)).toEqual({ top: 0, bottom: 0, keyboard: false });
  });

  it('키보드가 올라오면 아래에서 키보드 높이만큼 비운다', () => {
    expect(visibleBox(844, 554, 0)).toEqual({ top: 0, bottom: 290, keyboard: true });
  });

  it('키보드를 보이려고 화면이 위로 밀렸으면 그만큼 위에서 시작한다', () => {
    expect(visibleBox(844, 554, 40)).toEqual({ top: 40, bottom: 250, keyboard: true });
  });

  it('보이는 영역이 많이 밀려 아래 여백이 작아도 높이가 줄었으면 키보드로 본다', () => {
    expect(visibleBox(844, 554, 226)).toEqual({ top: 226, bottom: 64, keyboard: true });
  });

  it('주소 줄 정도의 작은 높이 변화는 키보드로 보지 않는다', () => {
    expect(visibleBox(844, 790, 0)).toEqual({ top: 0, bottom: 0, keyboard: false });
  });

  it('보이는 영역이 레이아웃 뷰포트보다 크면 여백은 0이다', () => {
    expect(visibleBox(800, 820, 0)).toEqual({ top: 0, bottom: 0, keyboard: false });
  });
});

describe('keyboardStyle', () => {
  it('키보드가 없으면 스타일을 주지 않는다', () => {
    expect(keyboardStyle(visibleBox(844, 844, 0))).toBeUndefined();
  });

  it('보이는 영역이 밀리지 않았으면 키보드 높이를 넘기고 밀린 길이는 0이다', () => {
    expect(keyboardStyle(visibleBox(844, 554, 0))).toEqual({ '--keyboard-h': '290px', '--keyboard-top': '0px' });
  });

  it('보이는 영역이 위로 밀렸으면 밀린 길이를 따로 넘기고 루트에 위치 변환을 주지 않는다', () => {
    const style = keyboardStyle(visibleBox(844, 554, 40));
    expect(style).toEqual({ '--keyboard-h': '250px', '--keyboard-top': '40px' });
    expect(style).not.toHaveProperty('transform');
  });

  it('넘기는 값은 사용자 정의 변수뿐이라 게임 영역의 크기와 위치를 직접 바꾸지 않는다', () => {
    for (const box of [visibleBox(844, 554, 0), visibleBox(844, 554, 40), visibleBox(844, 554, 226)]) {
      const style = keyboardStyle(box) ?? {};
      expect(Object.keys(style).length).toBeGreaterThan(0);
      expect(Object.keys(style).every(key => key.startsWith('--keyboard-'))).toBe(true);
    }
  });
});
