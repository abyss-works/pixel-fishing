import { describe, expect, it } from 'vitest';
import { markdownToDocument, VERSION_TOKEN } from './legalMarkdown.js';

const SOURCE = `## [조직 이름] 시험 이용약관

시행일(판): {{판}}

### 제1장 총칙

**제1조(목적)**
이 약관은 [조직 이름](이하 "운영자")이 \`/terms\` 주소와 <b>꺾쇠</b> & 기호를 다루며 **굵게** 쓴다.

**제2조(용어)**
1. 첫째 항목
2. 둘째 항목

- 목록 항목은 [이용약관](/terms)으로 간다.

| 항목 | 내용 |
|---|---|
| 가 | 나 |

### 부칙

1. 이 약관은 {{판}}부터 시행합니다.

#### 판 목록과 바뀐 점

| 판(시행일) | 바뀐 점 |
|---|---|
| [시행일] | 제정 |

-# 작은 글씨 한 줄
`;

describe('마크다운 본문 변환', () => {
  const html = markdownToDocument(SOURCE, '/terms');

  it('제목과 머리의 판을 만들고 판 토큰은 그대로 남긴다', () => {
    expect(html).toContain('<title>[조직 이름] 시험 이용약관</title>');
    expect(html).toContain('<h1>[조직 이름] 시험 이용약관</h1>');
    expect(html).toContain(`<p class="edition">시행일(판): ${VERSION_TOKEN}</p>`);
    expect(html).toContain(`<li>이 약관은 ${VERSION_TOKEN}부터 시행합니다.</li>`);
  });

  it('원문의 자리표시 [시행일]은 바꾸지 않는다', () => {
    expect(html).toContain('<tr><td>[시행일]</td><td>제정</td></tr>');
  });

  it('장, 조, 판 목록 제목을 제목 요소로 바꾼다', () => {
    expect(html).toContain('<h2>제1장 총칙</h2>');
    expect(html).toContain('<h3>제1조(목적)</h3>');
    expect(html).toContain('<h3>판 목록과 바뀐 점</h3>');
  });

  it('순서 목록, 목록, 표를 바꾼다', () => {
    expect(html).toContain('<ol>\n<li>첫째 항목</li>\n<li>둘째 항목</li>\n</ol>');
    expect(html).toContain('<ul>\n<li>목록 항목은 <a href="/terms">이용약관</a>으로 간다.</li>\n</ul>');
    expect(html).toContain('<thead><tr><th>항목</th><th>내용</th></tr></thead>');
    expect(html).not.toContain('tabindex');
  });

  it('열이 넷 이상인 표는 감싸는 칸에서 가로로 넘기는 속성을 단다', () => {
    const wide = markdownToDocument('## 제목\n\n| 가 | 나 | 다 | 라 |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |\n', '/privacy');
    expect(wide).toContain('<div class="table-scroll" tabindex="0" role="group" aria-label="표">');
    expect(wide).toContain('<table class="wide">');
  });

  it('인라인 코드, 굵게, 꺾쇠, 앰퍼샌드를 처리하고 사이트 밖 모양의 대괄호 글은 링크로 보지 않는다', () => {
    expect(html).toContain('<p>이 약관은 [조직 이름](이하 "운영자")이 <code>/terms</code> 주소와 &lt;b&gt;꺾쇠&lt;/b&gt; &amp; 기호를 다루며 <strong>굵게</strong> 쓴다.</p>');
  });

  it('작은 글씨 단락을 표시한다', () => {
    expect(html).toContain('<p class="fine-print">작은 글씨 한 줄</p>');
  });

  it('판 줄이 없는 문서는 판 요소를 만들지 않는다', () => {
    expect(markdownToDocument('## 제목\n\n본문\n', '/about')).not.toContain('class="edition"');
  });

  it('위아래 nav의 접근성 이름이 다르고 현재 문서가 표시된다', () => {
    expect(html).toContain('<nav class="docs" aria-label="공개 문서">');
    expect(html).toContain('<nav class="docs" aria-label="공개 문서 하단">');
    expect(html.match(/<a href="\/terms" aria-current="page">이용약관<\/a>/g)).toHaveLength(2);
    expect(html).toContain('<a href="/policy">운영정책</a>');
  });

  it('줄바꿈이 CRLF여도 같은 결과다', () => {
    expect(markdownToDocument(SOURCE.replace(/\n/g, '\r\n'), '/terms')).toBe(html);
  });

  it('제목 줄이 없으면 실패한다', () => {
    expect(() => markdownToDocument('본문뿐\n', '/about')).toThrow();
  });

  it('외부 글꼴과 스크립트를 부르지 않는다', () => {
    expect(html).not.toMatch(/<script|https?:\/\//);
  });
});
