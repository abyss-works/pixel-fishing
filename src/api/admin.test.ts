// API 계층 규약 — 관리자 읽기(http/local 교체)가 인터페이스 뒤에 갇혀 있는지 검증한다.
// 이 계약이 깨지면 admin/**가 supabase-js를 다시 직접 잡는다(2026-08-27에 실제로 있었던
// 위반 — queries.ts가 backend/auth를 직접 import했다. 이 테스트는 그 재발을 잠근다).
import { describe, it, expect } from 'vitest';
// 규약 테스트라 구현 팩토리(local)를 직접 잡는다 — 싱글톤(api)은 조립 산출물 쪽
import { api } from './index';
import { createLocalApi } from './local';
import { newState } from '../game/logic';

describe('admin 계층 규약', () => {
  it('싱글톤과 두 팩토리 모두 AdminApi 전면을 노출한다', () => {
    const local = createLocalApi(newState()).admin;
    for (const m of ['access', 'users', 'dailyActive', 'retention', 'economy',
      'catchQuality', 'spamFlags', 'imports', 'dexMismatch',
      'recentEvents', 'userEvents', 'projectRef'] as const) {
      expect(typeof api.admin[m]).toBe('function');
      expect(typeof local[m]).toBe('function');
    }
  });

  it('local 모드 — 접근 판정은 "local"(권한 실패 아님), 데이터 getter는 reject한다', async () => {
    const { admin } = createLocalApi(newState());
    await expect(admin.access()).resolves.toEqual({ kind: 'local', uid: null });
    // 조용한 빈 배열은 "데이터 없음"이라는 거짓말 — 게이트 우회 오용은 시끄럽게 실패한다
    await expect(admin.users()).rejects.toThrow(/클라우드/);
    await expect(admin.dailyActive(30)).rejects.toThrow();
  });
});
