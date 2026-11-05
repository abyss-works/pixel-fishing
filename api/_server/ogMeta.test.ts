import { describe, expect, it } from 'vitest';
import { defaultMeta, escapeHtml, withMeta } from './ogMeta.js';

const HTML = `<head>
    <title>픽셀 낚시</title>
    <!-- og:start -->
    <meta property="og:title" content="픽셀 낚시" />
    <!-- og:end -->
  </head>`;

describe('링크 미리보기 태그', () => {
  it('표시 구간만 바꾸고 나머지는 그대로 둔다', () => {
    const out = withMeta(HTML, { title: '새벽선단 길드 초대', description: 'Lv.3', url: 'https://x.dev/g/ABCD2345', image: 'https://x.dev/og.png' });
    expect(out).toContain('<title>픽셀 낚시</title>');
    expect(out).toContain('<meta property="og:title" content="새벽선단 길드 초대" />');
    expect(out).toContain('<meta property="og:url" content="https://x.dev/g/ABCD2345" />');
    expect(out).toContain('<meta property="og:image" content="https://x.dev/og.png" />');
    expect(out).not.toContain('content="픽셀 낚시" />\n    <!-- og:end -->');
    expect(out.match(/og:title/g)).toHaveLength(1);
  });

  it('값은 HTML 이스케이프한다', () => {
    expect(escapeHtml(`"><script>alert('x')</script>&`)).toBe('&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;');
    const out = withMeta(HTML, { title: '"><b>', description: 'd', url: 'u', image: 'i' });
    expect(out).toContain('content="&quot;&gt;&lt;b&gt;"');
    expect(out).not.toContain('"><b>');
  });

  it('표시 구간이 없으면 그대로 돌려준다', () => {
    expect(withMeta('<head></head>', defaultMeta('https://x.dev'))).toBe('<head></head>');
  });

  it('기본 미리보기는 첫 화면 주소와 대표 그림을 절대 주소로 쓴다', () => {
    expect(defaultMeta('https://x.dev')).toMatchObject({ url: 'https://x.dev/', image: 'https://x.dev/og.png' });
  });
});
