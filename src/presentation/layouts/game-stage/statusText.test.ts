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

  it('입질 안내는 간결한 행동 지시만 보인다', () => {
    expect(statusText('bite', false)).toBe('지금 눌러 주세요.');
  });

  it('입질과 끌어올림 안내는 모바일에서도 같다', () => {
    expect(statusText('bite', true)).toBe(statusText('bite', false));
    expect(statusText('catch', true)).toBe(statusText('catch', false));
  });
});

describe('statusParts', () => {
  it('낚시 상태 띠에는 판정 영역 반복 설명을 붙이지 않는다', () => {
    expect(statusParts('wait', false).judge).toBeUndefined();
    expect(statusParts('bite', false)).toEqual({ lead: '지금 눌러 주세요.' });
    expect(statusParts('catch', false).judge).toBeUndefined();
  });
});
