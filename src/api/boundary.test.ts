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

describe('api 계층 경계', () => {
  it('backend/*를 import하는 곳은 api 계층뿐이다', () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      if (path.startsWith('./')) continue; // 같은 디렉터리 = api 계층 자신
      const rel = path.replace(/^\.\.\//, '');
      if (rel.startsWith('backend/')) continue;
      if (/\.test\.tsx?$/.test(rel)) continue;
      if (/from '[^']*backend\//.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
