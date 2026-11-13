/// <reference types="node" />
// 폰트 자체 호스팅 가드 - 외부 폰트 서비스로 가는 참조가 소스에 남지 않게 하고,
// 폰트 선언이 가리키는 파일과 라이선스 전문이 저장소에 있는지 본다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXTERNAL_FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const FONT_DIR = 'src/assets/fonts';

const walk = (dir: string, accept: (path: string) => boolean): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, accept);
    return accept(path) ? [path] : [];
  });

const read = (path: string) => readFileSync(path, 'utf-8');

describe('폰트 자체 호스팅 - 외부 폰트 서비스 참조 금지', () => {
  const scanned = [
    'index.html',
    'Dockerfile',
    ...walk('src', p => p.endsWith('.css')),
    ...walk('tools', p => p.endsWith('.html')),
    'admin/index.html',
    'admin/nginx.conf',
    'admin/Dockerfile',
    ...walk('admin', p => p.endsWith('.css')),
    ...walk('k8s', () => true),
    ...walk('api/_server', p => p.endsWith('.ts') && !p.endsWith('.test.ts')),
  ];

  it('CSS, HTML, 서버 헤더 설정, 관리자 화면, 배포 설정에 외부 폰트 도메인이 없다', () => {
    const hits = scanned.flatMap(path =>
      EXTERNAL_FONT_HOSTS.filter(host => read(path).includes(host)).map(host => `${path}: ${host}`));
    expect(hits).toEqual([]);
  });

  it('외부 주소를 가리키는 @import나 폰트 preconnect가 없다', () => {
    const css = walk('src', p => p.endsWith('.css')).filter(p => /@import\s+(url\()?\s*['"]?https?:/.test(read(p)));
    expect(css).toEqual([]);
    expect(read('index.html')).not.toMatch(/rel=["']preconnect["']/);
  });
});

describe('폰트 자체 호스팅 - 선언과 파일', () => {
  const fontCss = join(FONT_DIR, 'fonts.css');
  const css = read(fontCss);
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]);

  it('두 글꼴 패밀리를 선언하고 font-display는 swap이다', () => {
    const families = new Set(faces.map(f => /font-family:\s*'([^']+)'/.exec(f)?.[1]));
    expect([...families].sort()).toEqual(['Noto Sans KR', 'Silkscreen']);
    expect(faces.every(f => /font-display:\s*swap;/.test(f))).toBe(true);
  });

  it('본문 폰트는 굵기 400과 700, 픽셀 폰트는 400과 700을 선언한다', () => {
    const weights = (family: string) => faces
      .filter(f => f.includes(`'${family}'`))
      .map(f => /font-weight:\s*([\d ]+);/.exec(f)?.[1]);
    expect(new Set(weights('Noto Sans KR'))).toEqual(new Set(['400 700']));
    expect(new Set(weights('Silkscreen'))).toEqual(new Set(['400', '700']));
  });

  it('모든 선언이 unicode-range 조각이고 가리키는 woff2 목록이 폴더의 woff2 목록과 같다', () => {
    const declared = faces.map(face => {
      expect(face).toMatch(/unicode-range:/);
      const url = /url\('([^']+)'\)/.exec(face)?.[1] ?? '';
      expect(url).toMatch(/^\.\/[a-z-]+\/[\w-]+\.woff2$/);
      return url.slice(2);
    });
    const onDisk = walk(FONT_DIR, p => p.endsWith('.woff2')).map(p => relative(FONT_DIR, p).split(sep).join('/'));
    expect([...new Set(declared)].sort()).toEqual(onDisk.sort());
  });

  it('글꼴마다 OFL 라이선스 전문이 폰트 파일 옆에 있다', () => {
    for (const dir of ['noto-sans-kr', 'silkscreen']) {
      const license = join(FONT_DIR, dir, 'OFL.txt');
      expect(existsSync(license)).toBe(true);
      expect(read(license)).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
  });
});
