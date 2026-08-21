// P1 클라우드 저장 — 오프라인 모드 무해성 
import { describe, it, expect } from 'vitest';
import { supabase, ensureSession, fetchCloudSave, pushCloudSave } from './cloud';
import { newState } from './logic';

describe('클라우드 저장', () => {
  it('환경변수 없으면 오프라인 모드 (supabase null, 호출은 전부 무해)', async () => {
    expect(supabase).toBeNull(); // 테스트 환경엔 VITE_SUPABASE_* 없음
    expect(await ensureSession()).toBeNull();
    expect(await fetchCloudSave()).toBeNull();
    expect(await pushCloudSave(newState())).toEqual({ status: 'error' });
  });
});
