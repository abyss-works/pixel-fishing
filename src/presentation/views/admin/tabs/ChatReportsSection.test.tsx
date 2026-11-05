// 채팅 신고 구역 — granted에서 신고와 앞뒤 대화를 그리고, 신고자·보낸 사람을 명부의 계정 식별 표기로 보인다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import ChatReportsSection from './ChatReportsSection';

const REPORTER = 'aaaaaaaa-0000-0000-0000-000000000000';
const RUDE = 'bbbbbbbb-0000-0000-0000-000000000000';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      chatReports: vi.fn(async () => [{
        id: 1, user_id: REPORTER, message_id: 11, target_id: RUDE, created_at: '2026-11-05T00:00:00Z',
        lines: [
          { id: 10, uid: REPORTER, nick: '가람', text: '안녕하세요', at: '2026-11-05T00:00:00.000Z' },
          { id: 11, uid: RUDE, nick: '무례', text: '나쁜 말', at: '2026-11-05T00:00:01.000Z' },
        ],
      }]),
      users: vi.fn(async () => [{ user_id: REPORTER, email: 'reporter@example.com', nickname: '신고자', is_anonymous: false }]),
    },
  },
}));

describe('ChatReportsSection', () => {
  afterEach(cleanup);
  it('granted — 신고한 메시지와 앞뒤 대화, 신고한 사람과 보낸 사람의 계정 식별 표기를 그린다', async () => {
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u' }}>
          <ChatReportsSection />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    expect(await screen.findByText('나쁜 말')).toBeTruthy();
    expect(screen.getByText('안녕하세요')).toBeTruthy();
    expect(screen.getByText('신고자(reporter@example.com)')).toBeTruthy();
    // 명부에 없는 보낸 사람도 같은 표기로 적는다
    expect(screen.getByText('이름 없음(—)')).toBeTruthy();
    expect(screen.getByText('bbbbbbbb')).toBeTruthy();
  });
});
