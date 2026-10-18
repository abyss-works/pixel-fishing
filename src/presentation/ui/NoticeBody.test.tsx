import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TextNotice } from './NoticeBody';

afterEach(cleanup);

describe('안내문 본문', () => {
  it('첫 줄은 핵심 문장, 괄호 줄은 참고, 나머지는 설명 문단으로 나눈다', () => {
    render(<TextNotice text={'이미 가입된 이메일이에요.\n로그인하면 게스트 진행은 사라져요.\n(이사 코드를 복사해 둘게요)'} />);
    expect(screen.getByText('이미 가입된 이메일이에요.')).toHaveClass('text-base');
    expect(screen.getByText('로그인하면 게스트 진행은 사라져요.').tagName).toBe('P');
    expect(screen.getByText('이사 코드를 복사해 둘게요')).toHaveClass('border-l-2');
  });
});
