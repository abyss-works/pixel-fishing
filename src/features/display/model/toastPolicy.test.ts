import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_SUPPRESS_MS,
  TOAST_POLICY,
  createMirrorHistory,
  decideToastMirror,
  enqueueToast,
  formatCompactToast,
  logToneOf,
  recordMirrorEmission,
} from './toastPolicy';
import type { MirrorEnv, QueuedToast, SystemEventKind } from './toastPolicy';

const baseEnv = (over: Partial<MirrorEnv> = {}): MirrorEnv => ({
  toastEnabled: true,
  hasOpenWindows: false,
  folded: false,
  blocked: false,
  loading: false,
  awayCardVisible: false,
  ...over,
});

describe('toastPolicy — 이벤트 분류 및 미러링 결정', () => {
  it('모든 시스템 이벤트 종류가 정책 표에 정의되어 있다', () => {
    const kinds = Object.keys(TOAST_POLICY) as SystemEventKind[];
    expect(kinds.length).toBeGreaterThanOrEqual(43);
    const tierC = kinds.filter(k => TOAST_POLICY[k].tier === 'C');
    expect(tierC).toEqual([
      'catch.routine',
      'catch.cast',
      'catch.movementCancelled',
      'facility.fishSold',
      'wardrobe.lookChanged',
      'bag.exhibitMoved',
      'bag.lockChanged',
      'travel.routineMove',
      'boot.greeting',
      'boot.cloudLoaded',
    ]);
  });

  it('Tier C 일상 이벤트는 어떤 환경에서도 플로팅 토스트로 승격하지 않는다', () => {
    const history = createMirrorHistory();
    for (const kind of ['catch.routine', 'catch.cast', 'facility.fishSold', 'travel.routineMove', 'boot.cloudLoaded'] as const) {
      const openDecision = decideToastMirror({ kind, text: '일상 로그' }, baseEnv({ hasOpenWindows: true, folded: true }), 1000, history);
      expect(openDecision).toEqual({ action: 'skip', reason: 'tier-c' });
    }
  });

  it('Tier A 이벤트는 모달이 닫히고 채팅이 펼쳐진 상태에서도 즉시 토스트로 미러링된다', () => {
    const history = createMirrorHistory();
    const d = decideToastMirror(
      { kind: 'catch.legendaryOrFirstVariant', text: '전설 등급 [백상아리] 획득!', toastText: '전설 [백상아리] 획득!' },
      baseEnv({ hasOpenWindows: false, folded: false }),
      1000,
      history,
    );
    expect(d.action).toBe('emit');
    if (d.action === 'emit') {
      expect(d.toast.text).toBe('전설 [백상아리] 획득!');
      expect(d.toast.priority).toBe(1);
      expect(d.toast.ttlMs).toBe(4500);
    }
  });

  it('2초 이내 동일 kind+text 재발행은 중복 억제되고, 2초가 지나면 다시 허용된다', () => {
    const history = createMirrorHistory();
    const env = baseEnv();
    const first = decideToastMirror({ kind: 'catch.encounterTicket', text: '네임드 흔적을 발견했어요.' }, env, 1000, history);
    expect(first.action).toBe('emit');
    if (first.action === 'emit') {
      recordMirrorEmission(history, first.signature, first.cooldownKey, 1000);
    }

    const dup = decideToastMirror(
      { kind: 'catch.encounterTicket', text: '네임드 흔적을 발견했어요.' },
      env,
      1000 + DUPLICATE_SUPPRESS_MS - 1,
      history,
    );
    expect(dup).toEqual({ action: 'skip', reason: 'duplicate' });

    const after = decideToastMirror(
      { kind: 'catch.encounterTicket', text: '네임드 흔적을 발견했어요.' },
      env,
      1000 + DUPLICATE_SUPPRESS_MS,
      history,
    );
    expect(after.action).toBe('emit');
  });

  it('카테고리 쿨다운(줄 끊김 60s, 가방 초과 30s)과 수동 포획 bypassCooldown을 구분한다', () => {
    const history = createMirrorHistory();
    const env = baseEnv();
    const first = decideToastMirror({ kind: 'catch.lineCut', text: '파워 부족' }, env, 10_000, history);
    expect(first.action).toBe('emit');
    if (first.action === 'emit') recordMirrorEmission(history, first.signature, first.cooldownKey, 10_000);

    const blocked = decideToastMirror({ kind: 'catch.lineCut', text: '파워 부족 재발' }, env, 69_999, history);
    expect(blocked).toEqual({ action: 'skip', reason: 'cooldown' });

    const allowed = decideToastMirror({ kind: 'catch.lineCut', text: '파워 부족 재발' }, env, 70_000, history);
    expect(allowed.action).toBe('emit');

    // catch.epicOrRecord는 자동 포획은 15초 쿨다운, 수동 포획은 bypassCooldown으로 즉시 노출한다
    const auto1 = decideToastMirror({ kind: 'catch.epicOrRecord', text: '영웅 [A] 획득!' }, env, 100_000, history);
    if (auto1.action === 'emit') recordMirrorEmission(history, auto1.signature, auto1.cooldownKey, 100_000);
    const auto2 = decideToastMirror({ kind: 'catch.epicOrRecord', text: '영웅 [B] 획득!' }, env, 105_000, history);
    expect(auto2).toEqual({ action: 'skip', reason: 'cooldown' });
    const manual = decideToastMirror({ kind: 'catch.epicOrRecord', text: '영웅 [C] 획득!', bypassCooldown: true }, env, 105_000, history);
    expect(manual.action).toBe('emit');
  });

  it('차단 모달(blocked) 중에는 억제되고, 로딩(loading) 중에는 보류(hold)된다', () => {
    const history = createMirrorHistory();
    expect(decideToastMirror({ kind: 'mail.unreadOnLogin', text: '우편 있음' }, baseEnv({ blocked: true }), 1000, history))
      .toEqual({ action: 'skip', reason: 'blocked' });
    expect(decideToastMirror({ kind: 'mail.unreadOnLogin', text: '우편 있음' }, baseEnv({ loading: true }), 1000, history))
      .toEqual({ action: 'hold', reason: 'loading' });
  });

  it('AwayCard가 가려지지 않고 보이는 상태에서는 away.summary 토스트를 억제하고, 모달이 덮었으면 노출한다', () => {
    const history = createMirrorHistory();
    const input = { kind: 'away.summary' as const, text: '1시간 동안 10마리', suppressIfAwayCardVisible: true };
    expect(decideToastMirror(input, baseEnv({ awayCardVisible: true, hasOpenWindows: false }), 1000, history))
      .toEqual({ action: 'skip', reason: 'away-card-visible' });
    expect(decideToastMirror(input, baseEnv({ awayCardVisible: true, hasOpenWindows: true }), 1000, history).action)
      .toBe('emit');
  });

  it('toastEnabled가 false면 +α 미러링은 끄되, 모달 내 직접 거부 피드백(system.modalRejected)은 예외로 유지한다', () => {
    const history = createMirrorHistory();
    const offClosed = baseEnv({ toastEnabled: false, hasOpenWindows: false });
    const offOpen = baseEnv({ toastEnabled: false, hasOpenWindows: true });

    expect(decideToastMirror({ kind: 'achievement.unlockable', text: '업적 달성' }, offOpen, 1000, history))
      .toEqual({ action: 'skip', reason: 'setting-disabled' });
    expect(decideToastMirror({ kind: 'system.modalRejected', text: '골드가 모자라요.' }, offClosed, 1000, history))
      .toEqual({ action: 'skip', reason: 'setting-disabled' });
    expect(decideToastMirror({ kind: 'system.modalRejected', text: '골드가 모자라요.' }, offOpen, 1000, history).action)
      .toBe('emit');
  });

  it('우선순위 큐는 P0 우선 정렬, replaceKey 교체, maxItems 초과 시 낮은 우선순위/오래된 항목 밀어내기를 수행한다', () => {
    const q1: QueuedToast = { id: 1, text: '확인 1', tone: 'neutral', priority: 3, ttlMs: 2800 };
    const q2: QueuedToast = { id: 2, text: '강화 Lv.2', tone: 'gold', priority: 2, ttlMs: 3500, replaceKey: 'rod-upgrade' };
    const q3: QueuedToast = { id: 3, text: '업적 달성', tone: 'gold', priority: 1, ttlMs: 4500 };

    // replaceKey 동일 시 기존 id 2를 교체하고 droppedIds에 돌려준다
    const replaced = enqueueToast([q3, q2, q1], {
      id: 4, text: '강화 Lv.3', tone: 'gold', priority: 2, ttlMs: 3500, replaceKey: 'rod-upgrade',
    }, 3);
    expect(replaced.droppedIds).toEqual([2]);
    expect(replaced.next.map(x => x.text)).toEqual(['업적 달성', '강화 Lv.3', '확인 1']);

    // 가득 찬 상태에서 P0가 들어오면 P3(id 1)가 밀려나고 P0가 맨 위에 선다
    const escalated = enqueueToast(replaced.next, {
      id: 5, text: '긴급 경고', tone: 'danger', priority: 0, ttlMs: 6000,
    }, 3);
    expect(escalated.droppedIds).toEqual([1]);
    expect(escalated.next.map(x => x.text)).toEqual(['긴급 경고', '업적 달성', '강화 Lv.3']);

    // 가득 찬 상태에서 P3가 들어오면 기존 P0/P1/P2를 밀어내지 못한다
    const ignoredLow = enqueueToast(escalated.next, {
      id: 6, text: '낮은 확인', tone: 'neutral', priority: 3, ttlMs: 2800,
    }, 3);
    expect(ignoredLow.droppedIds).toEqual([6]);
    expect(ignoredLow.next.map(x => x.id)).toEqual([5, 3, 4]);
  });

  it('formatCompactToast와 logToneOf가 1줄 정규화와 로그 톤 매핑을 정확히 처리한다', () => {
    expect(formatCompactToast('  첫째 줄\n  둘째   줄  ')).toBe('첫째 줄 둘째 줄');
    expect(logToneOf({ kind: 'catch.legendaryOrFirstVariant', text: 'x', tone: 'epic' })).toBe('gold');
    expect(logToneOf({ kind: 'guild.realtimeAlert', text: 'x' })).toBe('info');
    expect(logToneOf({ kind: 'system.criticalError', text: 'x' })).toBe('warn');
  });
});
