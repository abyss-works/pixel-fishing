import { describe, it, expect } from 'vitest';
import { checkRows } from './commonRules';

describe('공통 규칙 검사', () => {
  it('4방향으로 이어진 그림은 위반이 없다', () => {
    const rows = [
      '......',
      '.00...',
      '.0000.',
      '...00.',
      '......',
    ];
    expect(checkRows(rows, 1)).toEqual([]);
  });

  it('대각선으로만 닿는 두 셀을 diagonal 위반으로 센다', () => {
    const rows = [
      '......',
      '.00...',
      '.00...',
      '...00.',
      '...00.',
      '......',
    ];
    expect(checkRows(rows, 0)).toEqual([{ rule: 'diagonal', x: 2, y: 2 }]);
  });

  it('꺾이는 자리에 보조 픽셀이 있으면 대각선 접촉이 아니다', () => {
    const rows = [
      '.0....',
      '.00...',
      '..00..',
      '...0..',
    ];
    expect(checkRows(rows, 0)).toEqual([]);
  });

  it('반대 방향(우상향) 대각선도 잡는다', () => {
    const rows = [
      '...0.',
      '..0..',
      '.....',
    ];
    const v = checkRows(rows, 0).filter(x => x.rule === 'diagonal');
    expect(v).toEqual([{ rule: 'diagonal', x: 2, y: 1 }]);
  });

  it('8방향 어디에도 이웃이 없는 셀은 floating 위반이다', () => {
    const rows = [
      '0.....',
      '0.....',
      '......',
      '....0.',
    ];
    expect(checkRows(rows, 0)).toEqual([{ rule: 'floating', x: 4, y: 3 }]);
  });

  it('격자 가장자리에서 안전 여백 안쪽에만 둘 수 있다', () => {
    const rows = [
      '0.....',
      '.00...',
      '.00..0',
      '......',
    ];
    const v = checkRows(rows, 1);
    expect(v).toContainEqual({ rule: 'margin', x: 0, y: 0 });
    expect(v).toContainEqual({ rule: 'margin', x: 5, y: 2 });
    expect(v.filter(x => x.rule === 'margin')).toHaveLength(2);
  });

  it('여백 0이면 가장자리 셀도 허용한다', () => {
    expect(checkRows(['00', '00'], 0)).toEqual([]);
  });

  it('빈 격자는 위반이 없다', () => {
    expect(checkRows(['....', '....'], 2)).toEqual([]);
  });
});
