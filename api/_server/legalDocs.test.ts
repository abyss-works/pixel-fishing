/// <reference types="node" />
// 공개 문서 가드 - 게임 안 링크가 가리키는 주소마다 문서 본문이 있고, 변환 결과가 본문을 잃지 않으며,
// 판 토큰 외의 자리 토큰이 남지 않고, 문서가 외부 글꼴, 스크립트, 스타일을 부르지 않는지 본다.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGAL_PATHS } from '../../src/features/account/model/googleFlow.js';
import { markdownToDocument, VERSION_TOKEN } from './legalMarkdown.js';

const PUBLIC_DIR = 'public';
const DOCS_DIR = 'api/_server/legalDocs';
const DOCUMENT_PATHS = ['/about', ...Object.values(LEGAL_PATHS)];
const fileOf = (path: string) => `${DOCS_DIR}/${path.slice(1)}.md`;
const sourceOf = (path: string) => readFileSync(fileOf(path), 'utf-8');
const documentOf = (path: string) => markdownToDocument(sourceOf(path), path);

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** 마크다운 본문을 마크업 없이 줄 단위로 푼 것. 표는 칸마다 한 줄이고 목록 번호와 링크 문법은 벗긴다 */
function sourceLines(markdown: string): string[] {
  return markdown.split('\n')
    .filter(l => l.trim() !== '' && !/^\|[-| ]+\|$/.test(l))
    .flatMap(l => (l.startsWith('|') ? l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()) : [l]))
    .map(l => (/^#+ /.test(l) ? l.replace(/^#+ /, '') : l.replace(/^-# /, '').replace(/^- /, '').replace(/^\d+\. /, ''))
      .replace(/\[([^\]]+)\]\(\/[^)\s]*\)/g, '$1').replace(/\*\*/g, '').replace(/`/g, ''));
}

/** 변환 결과의 본문(main 요소)을 같은 모양으로 푼 것 */
function textLinesOf(html: string): string[] {
  const main = html.slice(html.indexOf('<main>') + '<main>'.length, html.indexOf('</main>'));
  return main.replace(/<\/(p|li|h1|h2|h3|td|th)>/g, '\n').replace(/<[^>]+>/g, '').split('\n')
    .map(l => unescape(l.trim())).filter(Boolean);
}

const EXTERNAL = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/** 따옴표 종류(큰따옴표, 홑따옴표, 없음)와 관계없이 태그의 속성을 이름과 값으로 읽는다 */
function attributesOf(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of tag.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/g)) {
    attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** CSS 안에서 불러오는 주소(url()과 @import) */
function cssRefs(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)].map(m => m[1] ?? m[2] ?? m[3]);
  const imports = [...css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)].map(m => m[1] ?? m[2]);
  return [...urls, ...imports];
}

/**
 * 문서가 자원으로 불러오는 주소를 모은다. src, srcset, data, poster 속성, a가 아닌 태그의 href(link, base, SVG의 use와 image),
 * xlink:href, meta refresh의 주소, style 속성과 style 요소의 CSS 주소다. 사용자가 눌러야 가는 a의 href는 자원이 아니므로 뺀다.
 */
function loadedRefs(html: string): string[] {
  const refs: string[] = [];
  for (const tag of html.matchAll(/<([a-z][a-z0-9-]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) {
    const name = tag[1].toLowerCase();
    const attrs = attributesOf(tag[2]);
    for (const key of ['src', 'data', 'poster']) if (attrs.has(key)) refs.push(attrs.get(key)!);
    if (attrs.has('srcset')) refs.push(...attrs.get('srcset')!.split(',').map(c => c.trim().split(/\s+/)[0]).filter(Boolean));
    if (name !== 'a' && attrs.has('href')) refs.push(attrs.get('href')!);
    if (attrs.has('xlink:href')) refs.push(attrs.get('xlink:href')!);
    if (name === 'meta' && attrs.get('http-equiv')?.toLowerCase() === 'refresh') {
      const target = /url\s*=\s*['"]?([^'"]+)/i.exec(attrs.get('content') ?? '')?.[1];
      if (target) refs.push(target);
    }
    if (attrs.has('style')) refs.push(...cssRefs(attrs.get('style')!));
  }
  for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) refs.push(...cssRefs(block[1]));
  return refs;
}

const externalRefs = (html: string) => loadedRefs(html).filter(ref => EXTERNAL.test(ref));

describe('외부 자원 검사기', () => {
  it.each([
    ['큰따옴표 src', '<img src="https://x.test/a.png">'],
    ['홑따옴표 src', "<script src='https://x.test/a.js'></script>"],
    ['따옴표 없는 속성', '<link rel=stylesheet href=https://x.test/a.css>'],
    ['프로토콜 상대 주소', '<link rel="stylesheet" href="//x.test/a.css">'],
    ['srcset', '<img src="/a.png" srcset="/a.png 1x, https://x.test/b.png 2x">'],
    ['meta refresh', '<meta http-equiv="refresh" content="0; url=https://x.test/">'],
    ['style 속성의 url()', '<p style="background:url(\'https://x.test/a.png\')">x</p>'],
    ['style 요소의 @import', '<style>@import url("https://x.test/a.css");</style>'],
    ['style 요소의 따옴표 있는 @import', "<style>@import 'https://x.test/a.css';</style>"],
    ['iframe', "<iframe src='//x.test/'></iframe>"],
    ['base href', '<base href="https://x.test/">'],
    ['SVG use href', '<svg><use href="https://x.test/s.svg#a"/></svg>'],
    ['SVG image의 xlink:href', "<svg><image xlink:href='//x.test/a.png'/></svg>"],
  ])('%s를 잡는다', (_name, html) => {
    expect(externalRefs(html)).not.toEqual([]);
  });

  it.each([
    ['같은 출처 자원', '<link rel="stylesheet" href="/legal.css"><img src="/a.png" srcset="/a.png 1x">'],
    ['바깥으로 나가는 링크', '<a href="https://x.test/">밖으로</a><a href=\'//x.test/\'>밖으로</a>'],
    ['같은 출처 SVG', '<svg><use href="#a"/><image xlink:href="/a.png"/></svg><base href="/">'],
    ['같은 출처 style', '<p style="background:url(/a.png)">x</p>'],
  ])('%s는 잡지 않는다', (_name, html) => {
    expect(externalRefs(html)).toEqual([]);
  });
});

describe('공개 문서 본문 파일', () => {
  it.each(Object.entries(LEGAL_PATHS))('게임 안 링크 %s의 주소(%s)에 문서 본문이 있다', (_name, path) => {
    expect(existsSync(fileOf(path))).toBe(true);
  });

  it('소개 문서도 있다', () => {
    expect(existsSync(fileOf('/about'))).toBe(true);
  });

  it('문서 파일은 정적 폴더에 없다. 정적 파일 제공으로 판 토큰이 든 문서가 나가지 않는다', () => {
    for (const path of DOCUMENT_PATHS) expect(existsSync(`${PUBLIC_DIR}/${path.slice(1)}.html`)).toBe(false);
  });
});

describe.each(DOCUMENT_PATHS)('공개 문서 %s', (path) => {
  const html = documentOf(path);

  it('스크립트를 싣지 않는다', () => {
    expect(html).not.toMatch(/<script/i);
  });

  it('불러오는 자원이 모두 같은 출처의 주소다', () => {
    expect(externalRefs(html)).toEqual([]);
  });

  it('판 토큰 외의 자리 토큰이 남지 않는다', () => {
    const tokens = html.match(/\{\{[^}]*\}\}/g) ?? [];
    expect(tokens.filter(t => t !== VERSION_TOKEN)).toEqual([]);
    expect(html.replaceAll(VERSION_TOKEN, '')).not.toMatch(/\{\{|\}\}/);
  });

  it('변환 결과의 본문이 마크다운 본문과 줄 단위로 같다', () => {
    expect(textLinesOf(html)).toEqual(sourceLines(sourceOf(path)));
  });

  it('위아래 nav의 접근성 이름이 서로 다르다', () => {
    const labels = [...html.matchAll(/<nav\b[^>]*>/g)].map(m => attributesOf(m[0]).get('aria-label'));
    expect(labels.every(Boolean)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('공개 문서 스타일', () => {
  const css = readFileSync(`${PUBLIC_DIR}/legal.css`, 'utf-8');

  it('외부 글꼴과 @import, 외부 주소 호출이 없다', () => {
    expect(css).not.toMatch(/@font-face/i);
    expect(cssRefs(css).filter(ref => EXTERNAL.test(ref))).toEqual([]);
    expect(css).not.toMatch(/https?:\/\//i);
  });
});

describe('문서 사이 링크', () => {
  it.each(DOCUMENT_PATHS)('%s의 같은 출처 링크가 모두 문서나 게임으로 간다', (path) => {
    const html = documentOf(path);
    const links = [...html.matchAll(/<a\b[^>]*>/g)].map(m => attributesOf(m[0]).get('href') ?? '');
    for (const link of links) {
      expect(link === '/' || DOCUMENT_PATHS.includes(link), link).toBe(true);
    }
  });
});
