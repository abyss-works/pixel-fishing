import { describe, expect, it } from 'vitest';
import { visibleBox } from './visibleBox';

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

  it('주소 줄 정도의 작은 높이 변화는 키보드로 보지 않는다', () => {
    expect(visibleBox(844, 790, 0)).toEqual({ top: 0, bottom: 0, keyboard: false });
  });

  it('보이는 영역이 레이아웃 뷰포트보다 크면 여백은 0이다', () => {
    expect(visibleBox(800, 820, 0)).toEqual({ top: 0, bottom: 0, keyboard: false });
  });
});
