// 공개 문서의 마크다운 본문을 HTML 문서로 바꾼다. 서버가 기동할 때 한 번 쓴다.
// 다루는 문법은 문서에 쓰는 것뿐이다: 제목(##, ###, ####), 굵은 줄 제목, 순서 목록, 목록, 표, 문단,
// 인라인 굵게와 코드, 사이트 안 링크, 작은 글씨 문단(`-# `). 공통 머리, nav, 바닥은 여기서 붙인다.
import { LEGAL_PATHS } from '../../src/features/account/model/googleFlow.js';

/** 문서 안에서 현재 판(시행일)이 들어갈 자리. 서버가 응답을 준비할 때 현재 판으로 바꾼다 */
export const VERSION_TOKEN = '{{판}}';

/** 문서 사이 링크. 게임 소개는 게임 안에서 링크하지 않아 상수에 없다 */
export const DOC_LINKS: readonly { path: string; label: string }[] = [
  { path: '/about', label: '게임 소개' },
  { path: LEGAL_PATHS.terms, label: '이용약관' },
  { path: LEGAL_PATHS.privacy, label: '개인정보 처리방침' },
  { path: LEGAL_PATHS.policy, label: '운영정책' },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 사이트 안 링크(`/`로 시작하는 주소)만 링크로 본다. 본문의 `[이름](이하 ...)` 같은 글은 그대로 둔다 */
const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

const inline = (s: string) => esc(s)
  .replace(LINK, '<a href="$2">$1</a>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`(.+?)`/g, '<code>$1</code>');

/** 위쪽과 아래쪽 nav는 접근성 이름이 달라야 한다 */
function nav(current: string, label: string): string {
  const links = [{ path: '/', label: '게임으로 돌아가기' }, ...DOC_LINKS]
    .map(d => `<a href="${d.path}"${d.path === current ? ' aria-current="page"' : ''}>${d.label}</a>`);
  return `<nav class="docs" aria-label="${label}">\n${links.join('\n')}\n</nav>`;
}

function blocks(lines: string[]): { title: string; edition: string; html: string } {
  const out: string[] = [];
  let title = '';
  let edition = '';
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '') { i++; continue; }
    if (l.startsWith('## ')) { title = l.slice(3); i++; continue; }
    if (l.startsWith('시행일(판): ')) { edition = l; i++; continue; }
    if (l.startsWith('### ')) { out.push(`<h2>${inline(l.slice(4))}</h2>`); i++; continue; }
    if (l.startsWith('#### ')) { out.push(`<h3>${inline(l.slice(5))}</h3>`); i++; continue; }
    if (/^\*\*[^*]+\*\*$/.test(l)) { out.push(`<h3>${esc(l.slice(2, -2))}</h3>`); i++; continue; }
    if (l.startsWith('-# ')) { out.push(`<p class="fine-print">${inline(l.slice(3))}</p>`); i++; continue; }
    if (l.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
      const cells = (r: string) => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]);
      const wide = head.length > 3;
      out.push([
        `<div class="table-scroll"${wide ? ' tabindex="0" role="group" aria-label="표"' : ''}>`,
        `<table${wide ? ' class="wide"' : ''}>`,
        `<thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>`,
        '<tbody>',
        ...rows.slice(2).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`),
        '</tbody>',
        '</table>',
        '</div>',
      ].join('\n'));
      continue;
    }
    if (/^\d+\. /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
      out.push(`<ol>\n${items.map(t => `<li>${inline(t)}</li>`).join('\n')}\n</ol>`);
      continue;
    }
    if (l.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++; }
      out.push(`<ul>\n${items.map(t => `<li>${inline(t)}</li>`).join('\n')}\n</ul>`);
      continue;
    }
    out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return { title, edition, html: out.join('\n') };
}

/** 마크다운 본문 한 편을 공개 문서 HTML로 바꾼다. path는 문서의 주소다. 판 토큰은 그대로 남는다 */
export function markdownToDocument(markdown: string, path: string): string {
  const { title, edition, html } = blocks(markdown.replace(/\r\n/g, '\n').split('\n'));
  if (!title) throw new Error('문서의 `## ` 제목 줄이 없습니다');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/legal.css">
</head>
<body>
${nav(path, '공개 문서')}
<main>
<header>
<h1>${esc(title)}</h1>
${edition ? `<p class="edition">${esc(edition)}</p>\n` : ''}</header>
${html}
</main>
${nav(path, '공개 문서 하단')}
</body>
</html>
`;
}
