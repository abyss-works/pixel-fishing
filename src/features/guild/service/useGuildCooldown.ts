import { useEffect, useState } from 'react';
import { guildCooldownInfo } from '../model/guild';
import type { GuildCooldownInfo } from '../model/guild';

const COOLDOWN_TICK_MS = 30_000;

/**
 * 재가입 대기 종료 시각이 미래일 때만 30초 간격으로 현재 시각을 갱신해 남은 시간과 해금 상태를 계산한다.
 * 만료되거나 언마운트되면 타이머를 정리한다.
 */
export function useGuildCooldown(cooldownUntil: string | null): GuildCooldownInfo {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const untilMs = cooldownUntil ? Date.parse(cooldownUntil) : Number.NaN;

  useEffect(() => {
    if (!Number.isFinite(untilMs)) return;
    const sync = setTimeout(() => setNowMs(Date.now()), 0);
    if (untilMs <= Date.now()) {
      return () => clearTimeout(sync);
    }
    const timer = setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= untilMs) clearInterval(timer);
    }, COOLDOWN_TICK_MS);
    return () => {
      clearTimeout(sync);
      clearInterval(timer);
    };
  }, [untilMs]);

  return guildCooldownInfo(cooldownUntil, nowMs);
}
