import { describe, it, expect } from 'vitest';
import { maskUid } from './shared';

describe('maskUid', () => {
  it('uuid 가운데 세 마디를 가리고 앞뒤는 남긴다', () => {
    expect(maskUid('fa224eb3-4486-4e9d-b821-5765495da903'))
      .toBe('fa224eb3-****-****-****-5765495da903');
  });

  it('앞 8자·뒤 12자가 그대로라 "그 계정 맞나"를 눈으로 확인할 수 있다', () => {
    const masked = maskUid('fa224eb3-4486-4e9d-b821-5765495da903');
    expect(masked.startsWith('fa224eb3')).toBe(true);
    expect(masked.endsWith('5765495da903')).toBe(true);
    expect(masked).not.toContain('4486'); // 가운데는 새지 않는다
  });

  it('uuid 모양이 아니면 손대지 않는다 — 형식이 바뀌어도 화면이 안 깨진다', () => {
    expect(maskUid('not-a-uuid')).toBe('not-a-uuid');
    expect(maskUid('')).toBe('');
  });
});
