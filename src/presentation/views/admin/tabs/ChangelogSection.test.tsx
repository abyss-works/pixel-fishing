// 변경 기록 칸 — 버전별로 public과 admin을 구분해 그리고, 철회된 항목은 토글로만 보인다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import type { AdminAccess } from '../../../../features/admin/service/accessContext';
import ChangelogSection from './ChangelogSection';

const ROWS = [
  { id: '0.2.0-01', version: '0.2.0', date: '2026-11-11', seq: 1, tier: 'public', tag: 'UI', text: '공개 문안', withdrawnAt: null },
  { id: '0.2.0-02', version: '0.2.0', date: '2026-11-11', seq: 2, tier: 'admin', tag: '수정', text: '관리자 문안', withdrawnAt: null },
  { id: '0.1.0-01', version: '0.1.0', date: '2026-11-10', seq: 1, tier: 'public', tag: '기능', text: '철회된 문안', withdrawnAt: '2026-11-12T00:00:00+00:00' },
];

const changelog = vi.hoisted(() => vi.fn());
vi.mock('../../../../platform/api', () => ({ api: { admin: { changelog } } }));

const show = (access: AdminAccess) => render(
  <QueryProvider>
    <AdminAuthCtx.Provider value={{ access, uid: 'u' }}><ChangelogSection /></AdminAuthCtx.Provider>
  </QueryProvider>,
);

describe('ChangelogSection', () => {
  afterEach(() => { cleanup(); changelog.mockReset(); });

  it('버전별로 항목과 등급 표시를 그리고 철회된 항목은 숨긴다', async () => {
    changelog.mockResolvedValue(ROWS);
    show('granted');
    const v2 = (await screen.findByLabelText('v0.2.0')) as HTMLElement;
    const items = within(v2).getAllByRole('listitem');
    expect(within(items[0]).getByText('public')).toBeInTheDocument();
    expect(within(items[0]).getByText('공개 문안')).toBeInTheDocument();
    expect(within(items[1]).getByText('admin')).toBeInTheDocument();
    expect(within(items[1]).getByText('관리자 문안')).toBeInTheDocument();
    expect(screen.queryByText('철회된 문안')).toBeNull();
    expect(screen.queryByLabelText('v0.1.0')).toBeNull();
  });

  it('토글을 켜면 철회된 항목이 철회 표시와 함께 보인다', async () => {
    changelog.mockResolvedValue(ROWS);
    show('granted');
    fireEvent.click(await screen.findByRole('checkbox', { name: '철회된 항목 보기 (1개)' }));
    const v1 = screen.getByLabelText('v0.1.0');
    expect(within(v1).getByText('철회된 문안')).toBeInTheDocument();
    expect(within(v1).getByText('철회')).toBeInTheDocument();
  });

  it('행이 없으면 빈 상태 문구를 보인다', async () => {
    changelog.mockResolvedValue([]);
    show('granted');
    expect(await screen.findByText('변경 기록이 없어요.')).toBeInTheDocument();
  });

  it('관리자 세션이 아니면 조회하지 않는다', () => {
    show('local');
    expect(changelog).not.toHaveBeenCalled();
    expect(screen.getByText(/admins에 등록하면 채워져요/)).toBeInTheDocument();
  });
});
