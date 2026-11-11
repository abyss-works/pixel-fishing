import { describe, expect, it } from 'vitest';
import { statusParts } from './statusText';

// 앞 부분과 판정 영역 설명 줄을 줄바꿈으로 이은 전체 문구
function statusText(phase: Parameters<typeof statusParts>[0], mobile: boolean): string {
  const { lead, judge } = statusParts(phase, mobile);
  return judge ? `${lead}\n${judge}` : lead;
}

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

describe('statusParts', () => {
  it('판정 영역 설명은 입질 기다림과 입질 단계에서 따로 떼어 준다', () => {
    expect(statusParts('wait', false).judge).toBe('빨간 영역은 PERFECT, 노란 영역은 GOOD이에요.');
    expect(statusParts('bite', false)).toEqual({ lead: '지금 눌러 주세요.', judge: '빨간 영역이면 PERFECT, 노란 영역이면 GOOD이에요.' });
  });

  it('끌어올림 안내에는 판정 영역 설명이 없다', () => {
    expect(statusParts('catch', false).judge).toBeUndefined();
  });
});
