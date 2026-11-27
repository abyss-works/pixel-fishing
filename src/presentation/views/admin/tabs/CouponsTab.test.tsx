import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryProvider } from '../../../../core/QueryProvider';
import type { AdminCouponRow } from '../../../../features/admin/model/types';

const mockApi = vi.hoisted(() => ({
  access: 'granted' as 'granted' | 'local',
  coupons: [] as AdminCouponRow[],
  readCoupons: vi.fn(),
  writeCoupon: vi.fn(),
}));

vi.mock('../../../../features/admin/service/accessContext', () => ({
  useAdminAuth: () => ({ access: mockApi.access }),
}));

vi.mock('../../../../features/admin/service/queries', () => ({
  readAdminCoupons: () => mockApi.readCoupons(),
  writeAdminCoupon: (req: unknown) => mockApi.writeCoupon(req),
}));

import CouponsTab from './CouponsTab';

const renderTab = () => render(<QueryProvider><CouponsTab /></QueryProvider>);

const sampleCoupon = (overrides: Partial<AdminCouponRow> = {}): AdminCouponRow => ({
  code: 'OPEN2026',
  gold: 1000,
  items: [{ id: 'luck-small', qty: 2 }],
  description: '오픈 기념 쿠폰',
  active: true,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  perAccountLimit: 1,
  redeemedCount: 0,
  createdAt: '2026-11-26T10:00:00.000Z',
  ...overrides,
});

describe('CouponsTab', () => {
  const now = Date.parse('2026-11-27T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(now);
    mockApi.access = 'granted';
    mockApi.coupons = [];
    mockApi.readCoupons.mockImplementation(async () => mockApi.coupons);
    mockApi.writeCoupon.mockImplementation(async () => ({ coupon: sampleCoupon() }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('등록된 쿠폰이 없으면 빈 상태 문구를 보인다', async () => {
    renderTab();
    expect(await screen.findByText('등록된 쿠폰이 없어요.')).toBeInTheDocument();
  });

  it('쿠폰 목록에서 활성·예약·만료·비활성 상태 배지와 보상·사용 현황·유효 기간을 표시한다', async () => {
    mockApi.coupons = [
      sampleCoupon({ code: 'LIVE1', redeemedCount: 3 }),
      sampleCoupon({
        code: 'SCHED2',
        active: true,
        startsAt: '2026-11-27T15:00:00.000Z',
        endsAt: '2026-11-28T15:00:00.000Z',
        maxRedemptions: 100,
        perAccountLimit: 1,
        redeemedCount: 0,
      }),
      sampleCoupon({
        code: 'END3',
        active: true,
        startsAt: '2026-11-26T08:00:00.000Z',
        endsAt: '2026-11-27T10:00:00.000Z',
        gold: 500,
        items: [],
      }),
      sampleCoupon({ code: 'OFF4', active: false, gold: 300, items: [] }),
    ];

    renderTab();
    expect(await screen.findByText('LIVE1')).toBeInTheDocument();
    expect(screen.getByText('활성')).toBeInTheDocument();
    expect(screen.getByText('예약')).toBeInTheDocument();
    expect(screen.getByText('만료')).toBeInTheDocument();
    expect(screen.getByText('비활성')).toBeInTheDocument();
    expect(screen.getAllByText('상시').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/무제한 \(게스트 가능\)/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/선착순 100명 \(정식 계정\)/)).toBeInTheDocument();
    expect(screen.getAllByText('1,000G').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('작은 바다 영약').length).toBeGreaterThanOrEqual(1);
  });

  it('새 쿠폰 발행 폼에서 품목 검색·추가·삭제와 검증 후 생성 요청을 보낸다', async () => {
    renderTab();
    await screen.findByText('등록된 쿠폰이 없어요.');

    fireEvent.click(screen.getByRole('button', { name: '쿠폰 발행' }));
    expect(screen.getByText(/쿠폰 코드는 1자 이상/)).toBeInTheDocument();
    expect(mockApi.writeCoupon).not.toHaveBeenCalled();

    // 정적 쿠폰 코드 충돌 거부
    fireEvent.change(screen.getByLabelText(/^코드/), { target: { value: '출항준비' } });
    fireEvent.change(screen.getByLabelText(/^설명/), { target: { value: '테스트 설명' } });
    fireEvent.change(screen.getByLabelText(/^보상 골드/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: '쿠폰 발행' }));
    expect(screen.getByText(/정적 쿠폰과 겹치는 코드/)).toBeInTheDocument();

    // 모자는 품목 검색에서 나오지 않는다
    fireEvent.change(screen.getByLabelText(/^첨부 품목 찾기/), { target: { value: '산타' } });
    expect(screen.getByText('찾는 품목이 없어요.')).toBeInTheDocument();

    // 품목 추가 및 제거 후 재추가
    fireEvent.change(screen.getByLabelText(/^첨부 수량/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^첨부 품목 찾기/), { target: { value: '바다 영약' } });
    fireEvent.click(screen.getByRole('option', { name: /작은 바다 영약/ }));
    expect(screen.getByLabelText('첨부된 품목')).toHaveTextContent('작은 바다 영약×2');

    fireEvent.click(screen.getByRole('button', { name: '작은 바다 영약 첨부 빼기' }));
    expect(screen.queryByLabelText('첨부된 품목')).toBeNull();

    fireEvent.change(screen.getByLabelText(/^첨부 수량/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/^첨부 품목 찾기/), { target: { value: '바다 영약' } });
    fireEvent.click(screen.getByRole('option', { name: /작은 바다 영약/ }));

    fireEvent.change(screen.getByLabelText(/^코드/), { target: { value: 'FALL2026' } });
    fireEvent.change(screen.getByLabelText(/^설명/), { target: { value: '가을 보상' } });
    fireEvent.change(screen.getByLabelText(/^보상 골드/), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/^총 사용 한도/), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText(/^계정당 사용 한도/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '쿠폰 발행' }));

    await waitFor(() => expect(mockApi.writeCoupon).toHaveBeenCalledWith({
      op: 'create',
      code: 'FALL2026',
      description: '가을 보상',
      gold: 500,
      items: [{ id: 'luck-small', qty: 3 }],
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 50,
      perAccountLimit: 1,
    }));
    expect(await screen.findByText('새 쿠폰을 발행했어요.')).toBeInTheDocument();
  });

  it('수정 모드에서는 코드가 읽기 전용이고 원클릭 활성 토글과 사용 이력 삭제 경고를 처리한다', async () => {
    mockApi.coupons = [
      sampleCoupon({ code: 'USED1', redeemedCount: 5, active: true }),
      sampleCoupon({ code: 'UNUSED2', redeemedCount: 0, active: false }),
    ];

    renderTab();
    expect(await screen.findByText('USED1')).toBeInTheDocument();

    // 수정 진입
    const editButtons = screen.getAllByRole('button', { name: '수정' });
    fireEvent.click(editButtons[0]);
    const codeInput = screen.getByLabelText(/^코드/) as HTMLInputElement;
    expect(codeInput.value).toBe('USED1');
    expect(codeInput).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText(/^설명/), { target: { value: '수정된 설명' } });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));
    await waitFor(() => expect(mockApi.writeCoupon).toHaveBeenCalledWith({
      op: 'update',
      code: 'USED1',
      description: '수정된 설명',
      gold: 1000,
      items: [{ id: 'luck-small', qty: 2 }],
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perAccountLimit: 1,
    }));

    // 원클릭 비활성화 / 활성화 토글
    fireEvent.click(screen.getByRole('button', { name: '비활성화' }));
    await waitFor(() => expect(mockApi.writeCoupon).toHaveBeenCalledWith(expect.objectContaining({
      op: 'update',
      code: 'USED1',
      active: false,
    })));

    fireEvent.click(screen.getByRole('button', { name: '활성화' }));
    await waitFor(() => expect(mockApi.writeCoupon).toHaveBeenCalledWith(expect.objectContaining({
      op: 'update',
      code: 'UNUSED2',
      active: true,
    })));

    // redeemedCount > 0 삭제 시 사용 이력 삭제 경고
    const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
    fireEvent.click(deleteButtons[0]);
    const dialog = await screen.findByRole('dialog', { name: '쿠폰 삭제' });
    expect(within(dialog).getByText(/기존 사용 이력도 함께 삭제/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(mockApi.writeCoupon).toHaveBeenCalledWith({ op: 'delete', code: 'USED1' }));
  });
});
