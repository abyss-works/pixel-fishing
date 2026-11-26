import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../account/service/session';
import { onMailEvent } from '../../live/service/useLive';

// 실시간 우편 도착 알림 — 5분 폴링 주기를 기다리지 않고 즉시 우편함 캐시를 무효화한다.
export function useMailAlerts(): void {
  const { uid } = useSession();
  const client = useQueryClient();
  useEffect(() => onMailEvent(() => {
    void client.invalidateQueries({ queryKey: ['mailbox', uid] });
  }), [uid, client]);
}
