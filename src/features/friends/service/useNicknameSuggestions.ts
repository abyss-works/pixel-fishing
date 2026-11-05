import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchPlayers } from '../../../platform/api';

// 친구 요청 닉네임 자동완성 — 입력이 멈춘 뒤에 앞부분이 같은 계정 유저를 찾는다. 빈 입력이면 후보가 없다.
const DEBOUNCE_MS = 200;

export function useNicknameSuggestions(text: string): { uid: string; nickname: string }[] {
  const typed = text.trim();
  const [prefix, setPrefix] = useState(typed);
  useEffect(() => {
    const timer = setTimeout(() => setPrefix(typed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  const q = useQuery({
    queryKey: ['player-search', prefix],
    queryFn: () => searchPlayers(prefix),
    enabled: prefix !== '',
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return typed === '' ? [] : q.data ?? [];
}
