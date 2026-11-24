import { beforeEach, describe, expect, it } from 'vitest';
import type { DailyFortune } from '../../../game/rules/fortune';
import {
  closeFortuneModal,
  queueFortuneModal,
  readFortuneModal,
  resetFortuneModalSession,
} from './fortuneModal';

const day1: DailyFortune = { day: '2026-11-24', kind: 'fish', index: 5 };
const day2: DailyFortune = { day: '2026-11-25', kind: 'gold', index: 3 };

beforeEach(() => {
  resetFortuneModalSession();
});

describe('오늘의 운세 접속 모달 스토어', () => {
  it('초기 상태는 비어 있다', () => {
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: null, pending: false });
  });

  it('큐에 넣은 뒤 준비가 끝나고 앞 창이 없으면 운세를 노출한다', () => {
    queueFortuneModal(day1);
    expect(readFortuneModal({ ready: false, suspended: false })).toEqual({ fortune: null, pending: true });
    expect(readFortuneModal({ ready: true, suspended: true })).toEqual({ fortune: null, pending: true });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: day1, pending: true });
  });

  it('닫으면 대기 상태가 비고 같은 날짜로 다시 큐에 넣어도 중복 노출하지 않는다', () => {
    queueFortuneModal(day1);
    expect(readFortuneModal({ ready: true, suspended: false }).fortune).toEqual(day1);

    closeFortuneModal();
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: null, pending: false });

    queueFortuneModal({ ...day1, kind: 'shadow', index: 3 });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: null, pending: false });
  });

  it('게임 날짜가 바뀌면 새 운세를 다시 노출한다', () => {
    queueFortuneModal(day1);
    closeFortuneModal();

    queueFortuneModal(day2);
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: day2, pending: true });
  });

  it('세션 초기화 후에는 같은 날도 다시 노출할 수 있다', () => {
    queueFortuneModal(day1);
    closeFortuneModal();
    resetFortuneModalSession();

    queueFortuneModal(day1);
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: day1, pending: true });
  });
});
