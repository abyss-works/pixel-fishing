// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FISH, newState } from '../../../game/rules/logic';
import type { ActionResult } from '../../../game/rules/actions';
import type { CatchFxKind } from '../../display/model/fxPolicy';

const pipMock = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../../../platform/api/documentPip', () => ({
  isDocumentPipSupported: () => true,
  openDocumentPipWindow: pipMock.open,
  injectPipStyles: () => {},
  resizeDocumentPipWindow: () => {},
}));

import { requestFx, resetFxPlayback } from '../../display/service/fxPlayback';
import { recordPipCatch, resetPipLiveState, setPipFishingPhase } from './pipLiveStore';
import { usePipMonitor } from './usePipMonitor';

type CatchResult = Extract<ActionResult, { type: 'catch' }>;
const catchResult = (uid: string): CatchResult => ({
  type: 'catch', uid, fishId: FISH[0].id, released: [],
  info: { form: 'normal', size: 20, percentile: 50, isBig: false, isNew: false },
});
const fxFor = (eventId: string, kind: CatchFxKind = 'catch.epicOrRecord') => {
  const at = Date.now();
  requestFx({
    kind, direct: true, at,
    subject: {
      eventId, region: 'village', fishId: FISH[0].id, rarity: 'common', form: 'normal', isNew: false,
      from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, holdEndsAt: at + 1500,
    },
  });
};

function fakeWindow() {
  return {
    closed: false, document: {}, close: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
}

async function mountOpen() {
  pipMock.open.mockResolvedValue(fakeWindow());
  const hook = renderHook(() => usePipMonitor({
    game: newState(), scene: { kind: 'region', id: 'village' }, pipCss: '',
  }));
  await act(async () => { await hook.result.current.togglePip(); });
  act(() => { setPipFishingPhase('wait'); });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_700_000_000_000);
  resetFxPlayback();
  resetPipLiveState();
});
afterEach(() => { cleanup(); vi.useRealTimers(); resetPipLiveState(); resetFxPlayback(); });

describe('usePipMonitor 효과 지시 연동', () => {
  it('버퍼가 먼저 오고 지시가 나중에 와도 도약을 한 번만 재생한다', async () => {
    const { result } = await mountOpen();
    act(() => { recordPipCatch(catchResult('c-1')); });
    expect(result.current.recentCatches[0].eventId).toBe('c-1');
    expect(result.current.leapTrigger).toBeNull();
    act(() => { fxFor('c-1'); });
    expect(result.current.leapTrigger).toMatchObject({ seq: 1, intensity: 'large', item: { eventId: 'c-1' } });
    // 같은 지시를 다시 읽어도 재생하지 않는다
    act(() => { setPipFishingPhase('bite'); });
    expect(result.current.leapTrigger?.seq).toBe(1);
  });

  it('지시가 먼저 오고 버퍼가 나중에 와도 도약을 한 번만 재생한다', async () => {
    const { result } = await mountOpen();
    act(() => { fxFor('c-2'); });
    expect(result.current.leapTrigger).toBeNull();
    act(() => { recordPipCatch(catchResult('c-2')); });
    expect(result.current.leapTrigger).toMatchObject({ seq: 1, item: { eventId: 'c-2' } });
    act(() => { setPipFishingPhase('bite'); });
    expect(result.current.leapTrigger?.seq).toBe(1);
  });

  it('다른 사건의 지시는 최신 포획에 도약을 붙이지 않는다', async () => {
    const { result } = await mountOpen();
    act(() => { recordPipCatch(catchResult('c-3')); fxFor('other'); });
    expect(result.current.leapTrigger).toBeNull();
  });

  it('창이 닫혀 있으면 재생하지 않고 나중에 열어도 지난 지시를 재생하지 않는다', async () => {
    pipMock.open.mockResolvedValue(fakeWindow());
    const { result } = renderHook(() => usePipMonitor({
      game: newState(), scene: { kind: 'region', id: 'village' }, pipCss: '',
    }));
    act(() => { recordPipCatch(catchResult('c-4')); fxFor('c-4'); });
    expect(result.current.leapTrigger).toBeNull();
    await act(async () => { await result.current.togglePip(); });
    act(() => { setPipFishingPhase('wait'); });
    expect(result.current.leapTrigger).toBeNull();
  });

  it('지시의 강도를 도약에 싣는다', async () => {
    const { result } = await mountOpen();
    act(() => { recordPipCatch(catchResult('c-5')); fxFor('c-5', 'catch.legendaryOrFirstVariant'); });
    expect(result.current.leapTrigger?.intensity).toBe('largest');
  });
});
