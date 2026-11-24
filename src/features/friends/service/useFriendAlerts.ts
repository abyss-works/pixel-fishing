import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sendNotice } from '../../display/model/toastPolicy';
import type { NoticeSink } from '../../display/model/toastPolicy';
import { useSession } from '../../account/service/session';
import { onFriendEvent } from '../../live/service/useLive';
import { friendAlertText } from '../model/friends';

// 실시간 친구 알림 — 받은 요청·내 요청의 수락을 받으면 친구 목록을 바로 다시 읽고(버튼의 받은 요청 수) 메시지 창에 한 줄 알린다.
export function useFriendAlerts(enabled: boolean, notify: NoticeSink): void {
  const { uid } = useSession();
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return onFriendEvent(e => {
      void client.invalidateQueries({ queryKey: ['friends', uid] });
      const text = friendAlertText(e);
      const toastText = e.kind === 'request'
        ? (e.nick ? `${e.nick} 님 친구 요청` : '새 친구 요청이 왔어요.')
        : (e.nick ? `${e.nick} 님과 친구 성사` : '친구 요청이 수락됐어요.');
      sendNotice(notify, { kind: 'friend.realtimeAlert', text, toastText });
    });
  }, [enabled, uid, client, notify]);
}
