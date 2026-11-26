import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onNickEvent } from './useLive';

// 실시간 닉네임 변경 시 피어 상세(PlayerInfo)와 순위·길드·친구·차단·검색 캐시에 옛 닉네임이 남지 않게 즉시 무효화한다.
export function useLiveNickSync(): void {
  const client = useQueryClient();
  useEffect(() => onNickEvent(e => {
    void client.invalidateQueries({ queryKey: ['player', e.uid] });
    void client.invalidateQueries({ queryKey: ['ranking'] });
    void client.invalidateQueries({ queryKey: ['guild'] });
    void client.invalidateQueries({ queryKey: ['friends'] });
    void client.invalidateQueries({ queryKey: ['chat-blocks'] });
    void client.invalidateQueries({ queryKey: ['player-search'] });
  }), [client]);
}
