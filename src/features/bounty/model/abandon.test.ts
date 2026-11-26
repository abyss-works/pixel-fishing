import { describe, expect, it } from 'vitest';
import { bountyById } from '../../../game/content/bounties';
import { newState } from '../../../game/rules/logic';
import { abandonConfirmSpec, canAbandonQuestInSnapshot } from './abandon';
import type { BountySnapshot } from './types';

const snap = (over: Partial<BountySnapshot> = {}): BountySnapshot => ({
  clearsToday: { general: 0, named: 0 },
  progress: [],
  tickets: [],
  ...over,
});

describe('의뢰 포기 모델', () => {
  const general = bountyById('pacific-easy-common')!;
  const named = bountyById('pacific-named-megalodon')!;

  it('스냅샷이 없거나 수주 중이 아닌 의뢰는 포기할 수 없다', () => {
    const game = newState();
    expect(canAbandonQuestInSnapshot(game, general.id, null)).toBe(false);
    expect(canAbandonQuestInSnapshot(game, general.id, snap())).toBe(false);
  });

  it('미완료 상태의 수주 의뢰는 현재 위치(마을·바다·다른 항구)와 무관하게 포기할 수 있다', () => {
    const s = snap({ progress: [{ questId: general.id, progress: 3 }, { questId: named.id, progress: 0 }] });
    for (const location of [
      { kind: 'base' as const, id: 'home' as const },
      { kind: 'region' as const, id: 'world' as const },
      { kind: 'base' as const, id: 'manila' as const },
    ]) {
      const game = { ...newState(), location };
      expect(canAbandonQuestInSnapshot(game, general.id, s)).toBe(true);
      expect(canAbandonQuestInSnapshot(game, named.id, s)).toBe(true);
    }
  });

  it('목표를 모두 채워 보상 대기 중인 의뢰는 포기할 수 없다', () => {
    const game = newState();
    const s = snap({
      progress: [
        { questId: general.id, progress: general.count },
        { questId: named.id, progress: named.count },
      ],
    });
    expect(canAbandonQuestInSnapshot(game, general.id, s)).toBe(false);
    expect(canAbandonQuestInSnapshot(game, named.id, s)).toBe(false);
  });

  it('포기 확인 문구는 일반 의뢰와 네임드 토벌(흔적 유무)에 따라 나뉘고 금지 용어를 쓰지 않는다', () => {
    const gSpec = abandonConfirmSpec(general, false);
    expect(gSpec).toEqual({
      title: '의뢰 포기',
      body: '지금 진행 중인 의뢰를 포기할까요?\n지금까지 쌓은 진행도는 사라지며 되돌릴 수 없어요.',
      confirmLabel: '포기',
    });

    const nNoTrace = abandonConfirmSpec(named, false);
    expect(nNoTrace).toEqual({
      title: '의뢰 포기',
      body: '진행 중인 네임드 토벌을 포기할까요?\n이미 입힌 네임드의 상처는 그대로 남아요.',
      confirmLabel: '포기',
    });

    const nWithTrace = abandonConfirmSpec(named, true);
    expect(nWithTrace).toEqual({
      title: '의뢰 포기',
      body: '진행 중인 네임드 토벌을 포기하면 남아 있는 흔적이 함께 사라져요.\n이미 입힌 네임드의 상처는 그대로 유지돼요.',
      confirmLabel: '포기',
    });

    for (const spec of [gSpec, nNoTrace, nWithTrace]) {
      expect(spec.body).not.toContain('도전권');
      expect(spec.body).not.toMatch(/[·—–]/);
    }
  });
});
