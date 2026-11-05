import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../account/service/session';
import { onFriendEvent } from '../../live/service/useLive';
import { friendAlertText } from '../model/friends';

// 실시간 친구 알림 — 받은 요청·내 요청의 수락을 받으면 친구 목록을 바로 다시 읽고(버튼의 받은 요청 수) 메시지 창에 한 줄 알린다.
export function useFriendAlerts(enabled: boolean, notify: (text: string) => void): void {
  const { uid } = useSession();
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return onFriendEvent(e => {
      void client.invalidateQueries({ queryKey: ['friends', uid] });
      notify(friendAlertText(e));
    });
  }, [enabled, uid, client, notify]);
}
