import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GuildInfo } from '../../../platform/api';
import { sendNotice } from '../../display/model/toastPolicy';
import type { NoticeSink } from '../../display/model/toastPolicy';
import { useSession } from '../../account/service/session';
import { onGuildEvent } from '../../live/service/useLive';
import { guildAlertText, memberName, skillName } from '../model/guild';
import { guildQueryKey } from './useGuild';

// 실시간 길드 알림 — 가입 신청이 들어오거나(길드장) 내 신청이 처리되면(신청한 사람) 내 길드를 바로 다시 읽고 메시지 창에 한 줄 알린다.
export function useGuildAlerts(enabled: boolean, notify: NoticeSink, guild: GuildInfo | null = null): void {
  const { uid } = useSession();
  const client = useQueryClient();
  const prevGuildRef = useRef<GuildInfo | null>(null);

  useEffect(() => {
    if (!enabled) return;
    return onGuildEvent(e => {
      void client.invalidateQueries({ queryKey: guildQueryKey(uid) });
      // 길드 갱신은 조용히 다시 읽기만 한다 — 신청 처리 알림이 아니다
      if (e.kind === 'updated') return;
      const text = guildAlertText({ ...e, kind: e.kind });
      const toastText = e.kind === 'request'
        ? `${e.nick ?? '이름 없음'} 님 길드 가입 신청`
        : e.kind === 'approved' ? '길드 가입이 승인됐어요.' : '길드 가입이 거절됐어요.';
      sendNotice(notify, {
        kind: 'guild.realtimeAlert',
        text,
        toastText,
        tone: e.kind === 'rejected' ? 'danger' : 'guild',
      });
    });
  }, [enabled, uid, client, notify]);

  // 길드 레벨업·스킬 단계 상승·신규 길드원 합류 전환 감지
  useEffect(() => {
    const prev = prevGuildRef.current;
    prevGuildRef.current = guild;
    if (!enabled || !prev || !guild || prev.id !== guild.id) return;

    if (guild.growth.level > prev.growth.level) {
      sendNotice(notify, {
        kind: 'guild.levelOrBonusUp',
        text: `길드가 Lv.${guild.growth.level}로 올랐어요!`,
        toastText: `길드 Lv.${guild.growth.level} 달성!`,
      });
    }
    const prevRanks = new Map(prev.bonuses.map(b => [b.id, b.rank]));
    for (const b of guild.bonuses) {
      const oldRank = prevRanks.get(b.id);
      if (oldRank !== undefined && b.rank > oldRank) {
        const name = skillName(b.id);
        sendNotice(notify, {
          kind: 'guild.levelOrBonusUp',
          text: `길드 스킬 ${name} ${b.rank}단계가 됐어요!`,
          toastText: `${name} ${b.rank}단계 달성!`,
        });
      }
    }
    const prevActive = new Set(prev.members.filter(m => m.leftAt === null).map(m => m.uid));
    for (const m of guild.members) {
      if (m.leftAt === null && m.uid !== uid && !prevActive.has(m.uid)) {
        const name = memberName(m);
        sendNotice(notify, {
          kind: 'guild.realtimeAlert',
          text: `${name} 님이 길드에 들어왔어요.`,
          toastText: `${name} 님 길드 합류`,
        });
      }
    }
  }, [enabled, guild, uid, notify]);
}
