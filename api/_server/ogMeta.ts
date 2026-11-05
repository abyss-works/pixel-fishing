// 링크 미리보기 태그 — 메신저 수집기는 자바스크립트를 실행하지 않고 처음 받은 HTML의 meta만 읽는다.
// 초대 링크는 서버가 빌드된 index.html의 미리보기 태그를 길드 값으로 바꿔 낸다. 값은 모두 HTML 이스케이프한다.

export interface PageMeta {
  title: string;
  description: string;
  /** 절대 주소 */
  url: string;
  /** 절대 주소 */
  image: string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (v: string): string => v.replace(/[&<>"']/g, c => ESCAPES[c]);

/** 미리보기 태그 묶음. index.html의 표시 구간을 이것으로 바꾼다 */
export function metaTags(m: PageMeta): string {
  const t = escapeHtml(m.title), d = escapeHtml(m.description), u = escapeHtml(m.url), i = escapeHtml(m.image);
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="픽셀 낚시" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="description" content="${d}" />`,
  ].join('\n    ');
}

const START = '<!-- og:start -->';
const END = '<!-- og:end -->';

/** index.html의 미리보기 구간(og:start와 og:end 사이)을 바꾼다. 구간이 없으면 그대로 돌려준다 */
export function withMeta(html: string, m: PageMeta): string {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) return html;
  return `${html.slice(0, a + START.length)}\n    ${metaTags(m)}\n    ${html.slice(b)}`;
}

/** 첫 화면의 미리보기. 초대 링크가 아닌 주소에 쓴다 */
export function defaultMeta(origin: string): PageMeta {
  return {
    title: '픽셀 낚시',
    description: '배를 타고 바다를 누비며 물고기를 모으는 픽셀 낚시 게임',
    url: `${origin}/`,
    image: `${origin}/og.png`,
  };
}
