// 계층 경계 규약 — 데이터 접근(백엔드)의 유일한 진입점은 api 계층이다.
// 목적: 로컬/운영 두 오리진의 접근 일원화. UI·훅이 backend/*를 직접 잡으면 http/local
// 교체 분기가 흩어지고, 실제로 useGame이 파사드를 우회해 api.game 축이 통째로 죽어 있었다
// (발견 2026-08-28). 공용 헬퍼(when)·타입은 api/index가 재수출한다 — 그걸 쓸 것.
// 테스트 파일은 예외 — 하네스가 구현(LocalBackend 등)을 직접 잡는 것은 규약 검증의 일부다.
import { describe, it, expect } from 'vitest';

// Vite 네이티브 raw 글롭 — Node fs 없이 소스 전문을 문자열로 읽는다.
// 키는 이 파일 기준 상대경로: 타 디렉터리 '../hooks/useGame.ts' · 같은 디렉터리(api/) './http.ts'
const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

// 탐지 패턴 — 정적 import(따옴표 무관·공백 허용)와 동적 import()를 함께 본다.
// 구 패턴(from '...')은 큰따옴표·import() 우회를 놓쳤다.
const BACKEND_IMPORT = [
  /from\s+["'][^"']*backend\//,
  /import\s*\(\s*["'][^"']*backend\//,
];

function isBackendImport(src: string): boolean {
  return BACKEND_IMPORT.some(re => re.test(src));
}

describe('api 계층 경계', () => {  it('우회 패턴을 탐지한다 — 큰따옴표·동적 import·상위 경로', () => {
    expect(isBackendImport(`import { x } from "../backend/http";`)).toBe(true);
    expect(isBackendImport(`const m = await import('../backend/local');`)).toBe(true);
    expect(isBackendImport(`import { x } from '../../src/backend/auth';`)).toBe(true);
    expect(isBackendImport(`import { x } from '../game/logic';`)).toBe(false);
    expect(isBackendImport(`// backend/*를 직접 잡으면 안 된다`)).toBe(false);
  });

  it('backend/*를 import하는 곳은 api 계층뿐이다', () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      if (path.startsWith('./')) continue; // 같은 디렉터리 = api 계층 자신
      const rel = path.replace(/^\.\.\//, '');
      if (rel.startsWith('backend/')) continue;
      if (/\.test\.tsx?$/.test(rel)) continue;
      if (isBackendImport(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('readBounty 직접 import는 api·hooks뿐이다 — views는 useBounty 경유', () => {
    expect(isReadImport(`import { readBounty } from "../api";`)).toBe(true);
    expect(isReadImport(`import { readBounty, kstDay } from '../../api';`)).toBe(true);
    expect(isReadImport(`import { kstDay } from '../api';`)).toBe(false);
    expect(isReadImport(`// readBounty(RLS 본인 읽기)`)).toBe(false);
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      if (path.startsWith('./')) continue; // api 계층 자신
      const rel = path.replace(/^\.\.\//, '');
      if (rel.startsWith('api/') || rel.startsWith('hooks/')) continue;
      if (/\.test\.tsx?$/.test(rel)) continue;
      if (/\.stories\.tsx?$/.test(rel)) continue;
      if (isReadImport(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

// 읽기 직접 참조 — import문 안의 식별자만 본다 (주석·문자열 제외).
// 구 패턴(\breadBounty\b)은 주석까지 걸려 BountyPanel 설명문이 오탐됐다.
const READ_IMPORT = /import\s+[^;]*\breadBounty\b[^;]*\bfrom\b\s*["'][^"']+["']/;

function isReadImport(src: string): boolean {
  return READ_IMPORT.test(src);
}
