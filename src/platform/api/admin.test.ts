// API 계층 규약 — 관리자 읽기(http/local 교체)가 인터페이스 뒤에 갇혀 있는지 검증한다.
// 이 계약이 깨지면 기능 계층이 전송 구현을 직접 잡는다. AdminApi 계약을 확인한다.
import { describe, it, expect } from 'vitest';
// 규약 테스트라 구현 팩토리(local)를 직접 잡는다 — 싱글톤(api)은 조립 산출물 쪽
import { api } from './index';
import { createLocalApi } from '../adapters/localApi';

describe('admin 계층 규약', () => {
  it('싱글톤과 두 팩토리 모두 AdminApi 전면을 노출한다', () => {
    const local = createLocalApi().admin;
    for (const m of ['access', 'users', 'live', 'dailyStats', 'retention', 'sessions', 'economy', 'bountyFunnel',
      'spamFlags',
      'recentEvents', 'userEvents', 'letters', 'changelog', 'chatReports', 'balanceLive', 'restrict', 'resetLink', 'letterHandled', 'deployHost', 'signIn', 'signOut'] as const) {
      expect(typeof api.admin[m]).toBe('function');
      expect(typeof local[m]).toBe('function');
    }
  });

  it('local 모드 — 접근 판정은 "local"(권한 실패 아님), 데이터 getter는 reject한다', async () => {
    const { admin } = createLocalApi();
    expect(admin.isConfigured).toBe(false);
    await expect(admin.access()).resolves.toEqual({ kind: 'local', uid: null });
    await expect(admin.signIn('a@example.test', 'pw')).rejects.toThrow(/클라우드/);
    // 조용한 빈 배열은 "데이터 없음"이라는 거짓말 — 게이트 우회 오용은 시끄럽게 실패한다
    await expect(admin.users()).rejects.toThrow(/클라우드/);
    await expect(admin.dailyStats('2026-11-01', '2026-11-05')).rejects.toThrow(/클라우드/);
    await expect(admin.live()).rejects.toThrow(/클라우드/);
    await expect(admin.changelog()).rejects.toThrow(/클라우드/);
    await expect(admin.balanceLive()).rejects.toThrow(/클라우드/);
    await expect(admin.balanceLive(3)).rejects.toThrow(/클라우드/);
  });
});
