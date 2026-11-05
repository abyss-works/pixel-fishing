import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../account/service/session';
import { onGuildEvent } from '../../live/service/useLive';
import { guildAlertText } from '../model/guild';
import { guildQueryKey } from './useGuild';

// 실시간 길드 알림 — 가입 신청이 들어오거나(길드장) 내 신청이 처리되면(신청한 사람) 내 길드를 바로 다시 읽고 메시지 창에 한 줄 알린다.
export function useGuildAlerts(enabled: boolean, notify: (text: string) => void): void {
  const { uid } = useSession();
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return onGuildEvent(e => {
      void client.invalidateQueries({ queryKey: guildQueryKey(uid) });
      notify(guildAlertText(e));
    });
  }, [enabled, uid, client, notify]);
}
