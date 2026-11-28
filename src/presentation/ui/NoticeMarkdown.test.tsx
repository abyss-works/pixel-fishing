import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NoticeMarkdown from './NoticeMarkdown';
import { stripNoticeMarkdown } from './noticeMarkdownText';

describe('NoticeMarkdown', () => {
  afterEach(cleanup);

  it('문단과 줄바꿈을 유지하며 인라인 굵게, 기울임, 인라인 코드를 렌더링한다', () => {
    const { container } = render(
      <NoticeMarkdown
        body={'첫째 줄 **굵게** 그리고 *기울임*\n둘째 줄 쿠폰 `FISHING2026`\n\n새 문단입니다.'}
      />,
    );

    const strong = screen.getByText('굵게');
    expect(strong.tagName).toBe('STRONG');

    const em = screen.getByText('기울임');
    expect(em.tagName).toBe('EM');

    const code = screen.getByText('FISHING2026');
    expect(code.tagName).toBe('CODE');

    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(screen.getByText('새 문단입니다.')).toBeInTheDocument();
  });

  it('- 또는 * 로 시작하는 줄을 글머리 목록으로 렌더링하고 내부 인라인 서식도 적용한다', () => {
    const { container } = render(
      <NoticeMarkdown body={'- **첫째** 항목\n* 둘째 `코드` 항목'} />,
    );

    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(screen.getByText('첫째').tagName).toBe('STRONG');
    expect(screen.getByText('코드').tagName).toBe('CODE');
  });

  it('펜스 코드블록을 pre/code 박스로 렌더링하고 내부 마크다운은 해석하지 않는다', () => {
    const { container } = render(
      <NoticeMarkdown body={'안내:\n```txt\n**그대로**\n<script>safe</script>\n```'} />,
    );

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = pre?.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe('**그대로**\n<script>safe</script>');
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('원시 HTML과 스크립트 태그는 실행 가능한 노드가 아니라 무해한 텍스트로 이스케이프한다', () => {
    const { container } = render(
      <NoticeMarkdown
        body={'<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)" />\n\n**<b onclick="x">클릭</b>**'}
      />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('<img src="x" onerror="alert(1)" />')).toBeInTheDocument();
    expect(screen.getByText('<b onclick="x">클릭</b>').tagName).toBe('STRONG');
  });

  it('중첩 강조(**...*...***), 인라인 코드 우선 매칭, 닫히지 않은 코드블록, 빈 문자열을 안전하게 처리한다', () => {
    const { container, rerender } = render(
      <NoticeMarkdown
        body={'**굵게와 *기울임* 함께**\n\n***강조***\n\n**중요 `a*b` 안내**\n\n10 * 2 = `20 * 1`\n\n```COUPON```'}
      />,
    );

    const italicInsideBold = screen.getByText('기울임');
    expect(italicInsideBold.tagName).toBe('EM');
    expect(italicInsideBold.closest('strong')).not.toBeNull();

    const triple = screen.getByText('강조');
    expect(triple.tagName).toBe('EM');
    expect(triple.closest('strong')).not.toBeNull();

    const codeInBold = screen.getByText('a*b');
    expect(codeInBold.tagName).toBe('CODE');
    expect(codeInBold.closest('strong')).not.toBeNull();

    expect(screen.getByText('20 * 1').tagName).toBe('CODE');
    expect(container.textContent).toContain('10 * 2 = 20 * 1');
    expect(container.querySelector('pre')).toBeNull();

    rerender(<NoticeMarkdown body={'```\n닫히지 않은 코드'} />);
    expect(container.querySelector('pre code')?.textContent).toBe('닫히지 않은 코드');

    rerender(<NoticeMarkdown body="" />);
    expect(container.querySelectorAll('p, ul, pre')).toHaveLength(0);
  });
});

describe('stripNoticeMarkdown', () => {
  it('마크다운 기호를 벗겨 내고 읽기 쉬운 평문을 반환한다', () => {
    const input = [
      '**점검 안내** 입니다.',
      '- `COUPON1` 입력 시 *보상* 지급',
      '* 두번째 항목',
      '```',
      'CODE-1234',
      '```',
    ].join('\n');

    expect(stripNoticeMarkdown(input)).toBe(
      ['점검 안내 입니다.', 'COUPON1 입력 시 보상 지급', '두번째 항목', 'CODE-1234'].join('\n'),
    );
  });

  it('백틱 코드 안의 별표와 중첩 서식을 일관되게 처리한다', () => {
    expect(stripNoticeMarkdown('`*주의*` **중요 `a*b` *기울임***')).toBe('*주의* 중요 a*b 기울임');
  });
});
