/// <reference types="node" />
// 공개 문서 가드 - 게임 안 링크가 가리키는 주소마다 정적 문서가 있고,
// 문서가 외부 글꼴, 스크립트, 스타일을 부르지 않는지 본다.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGAL_PATHS } from './googleFlow';

const PUBLIC_DIR = 'public';
const DOCUMENT_PATHS = ['/about', ...Object.values(LEGAL_PATHS)];
const fileOf = (path: string) => `${PUBLIC_DIR}/${path.slice(1)}.html`;

describe('공개 문서 정적 파일', () => {
  it.each(Object.entries(LEGAL_PATHS))('게임 안 링크 %s의 주소(%s)에 정적 문서가 있다', (_name, path) => {
    expect(existsSync(fileOf(path))).toBe(true);
  });

  it('소개 문서도 있다', () => {
    expect(existsSync(fileOf('/about'))).toBe(true);
  });
});

describe.each(DOCUMENT_PATHS)('공개 문서 %s', (path) => {
  const html = readFileSync(fileOf(path), 'utf-8');

  it('스크립트를 싣지 않는다', () => {
    expect(html).not.toMatch(/<script/i);
  });

  it('스타일, 글꼴, 이미지 참조가 같은 출처의 주소다', () => {
    const refs = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(m => m[1]);
    const external = refs.filter(ref => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref));
    expect(external).toEqual([]);
  });

  it('스타일의 외부 주소 호출이 없다', () => {
    expect(html).not.toMatch(/@import|url\(\s*["']?(?:https?:)?\/\//i);
  });
});

describe('공개 문서 스타일', () => {
  const css = readFileSync(`${PUBLIC_DIR}/legal.css`, 'utf-8');

  it('외부 글꼴과 @import, 외부 주소 호출이 없다', () => {
    expect(css).not.toMatch(/@import|@font-face|https?:\/\//i);
  });
});

describe('문서 사이 링크', () => {
  it.each(DOCUMENT_PATHS)('%s의 같은 출처 링크가 모두 문서나 게임으로 간다', (path) => {
    const html = readFileSync(fileOf(path), 'utf-8');
    const links = [...html.matchAll(/<a href="([^"#]*)/g)].map(m => m[1]);
    for (const link of links) {
      expect(link === '/' || DOCUMENT_PATHS.includes(link), link).toBe(true);
    }
  });
});
