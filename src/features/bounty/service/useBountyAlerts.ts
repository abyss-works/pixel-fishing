import { useEffect, useRef } from 'react';
import { bountyById, bountyKindOf } from '../../../game/content/bounties';
import { sendNotice } from '../../display/model/toastPolicy';
import type { NoticeSink } from '../../display/model/toastPolicy';
import { questLabel } from '../model/panel';
import type { BountySnapshot } from '../model/types';
import { useBounty } from './useBounty';

/** 스냅샷 갱신 시 수주 중인 일반 의뢰가 목표 완료 상태로 처음 전환되면 시스템 로그와 토스트로 알린다 */
export function useBountyAlerts(notify: NoticeSink): void {
  const { snap } = useBounty();
  const prevRef = useRef<BountySnapshot | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = snap;
    if (!prev || !snap) return;

    const prevMap = new Map(prev.progress.map(row => [row.questId, row.progress]));
    for (const row of snap.progress) {
      const quest = bountyById(row.questId);
      if (!quest || bountyKindOf(quest) !== 'general') continue;
      const oldProgress = prevMap.get(row.questId);
      if (oldProgress !== undefined && oldProgress < quest.count && row.progress >= quest.count) {
        sendNotice(notify, {
          kind: 'bounty.questCompletable',
          text: `${questLabel(quest)} 목표를 달성했어요! 수배판에서 보상을 받아 보세요.`,
          toastText: '의뢰 목표를 달성했어요!',
        });
      }
    }
  }, [snap, notify]);
}
