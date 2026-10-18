// 운영 탭 — 환경 정체·권한 상태·이벤트 카탈로그가 칸으로 나뉘어 그려지는지 확인한다.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import type { AdminAccess } from '../../../../features/admin/service/accessContext';
import { EVENT_LABELS } from '../../../../features/admin/model/metrics';
import OpsTab from './OpsTab';

afterEach(cleanup);

const show = (access: AdminAccess) => render(
  <AdminAuthCtx.Provider value={{ access, uid: null }}><OpsTab /></AdminAuthCtx.Provider>,
);

describe('운영 탭', () => {
  it('환경 정체를 표로, 권한 상태를 칸 하나로 보인다', () => {
    show('local');
    const identity = screen.getByText('이 화면의 정체').closest('section')!;
    expect(within(identity).getByText('릴리즈 버전')).toBeInTheDocument();
    expect(within(identity).getByText('빌드 식별자')).toBeInTheDocument();
    expect(within(identity).getByText('로컬 모드')).toBeInTheDocument(); // 연결된 Supabase 프로젝트가 없다
    const auth = screen.getByText('권한').closest('section')!;
    expect(within(auth).getByText(/로컬 모드에서는 관리자 데이터가 없어요/)).toBeInTheDocument();
  });

  it('권한 상태마다 다른 문구를 보인다', () => {
    show('denied');
    expect(screen.getByText(/admins에 등록되지 않았어요/)).toBeInTheDocument();
    cleanup();
    show('granted');
    expect(screen.getByText('관리자 세션')).toBeInTheDocument();
  });

  it('이벤트 카탈로그는 이벤트 유형마다 한 줄이고, 이벤트를 남기지 않는 액션을 따로 적는다', () => {
    show('granted');
    const catalog = screen.getByText('events 스트림 카탈로그').closest('section')!;
    for (const [type, label] of Object.entries(EVENT_LABELS)) {
      const row = within(catalog).getByText(type).closest('tr')!;
      expect(within(row).getByText(label)).toBeInTheDocument();
    }
    expect(within(catalog).getByText(/이벤트를 남기지 않아요/)).toBeInTheDocument();
  });
});
