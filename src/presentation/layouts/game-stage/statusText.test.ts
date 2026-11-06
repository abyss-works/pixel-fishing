import { describe, expect, it } from 'vitest';
import { statusText } from './statusText';

describe('statusText', () => {
  it('PC의 입질 기다림 안내는 스페이스를 누르라고 한다', () => {
    expect(statusText('wait', false)).toContain('“!”가 뜨면 스페이스를 눌러 주세요.');
  });

  it('모바일의 입질 기다림 안내는 화면을 누르라고 하고 나머지 문구는 그대로다', () => {
    const mobile = statusText('wait', true);
    expect(mobile).toContain('“!”가 뜨면 화면을 눌러 주세요.');
    expect(mobile).not.toContain('스페이스');
    expect(mobile.replace('화면을', '스페이스를')).toBe(statusText('wait', false));
  });

  it('입질 안내는 문장마다 줄을 바꾼다', () => {
    expect(statusText('bite', false)).toBe('지금 눌러 주세요.\n빨간 영역이면 PERFECT, 노란 영역이면 GOOD이에요.');
  });

  it('입질과 끌어올림 안내는 모바일에서도 같다', () => {
    expect(statusText('bite', true)).toBe(statusText('bite', false));
    expect(statusText('catch', true)).toBe(statusText('catch', false));
  });
});
