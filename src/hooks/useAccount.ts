import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { supabase, fetchCloudSave, currentAccount, applyNewPassword } from '../backend/cloud';
import { migrate, newState } from '../game/logic';
import type { GameState } from '../game/logic';
import type { SyncState } from './useCloudSync';

// 계정 상태 (v0.4.0) — 표시 이메일 · 로그인(계정 교체) 처리 ·
// 비밀번호 재설정 착지 · 가입 넛지. 동기화 자체는 useCloudSync 소관 (계층: service&state).
export function useAccount({ game, setGame, setToast, sync, userIdRef, dirtyRef }: {
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (m: string) => void;
  sync: SyncState;
  userIdRef: RefObject<string | null>;
  dirtyRef: RefObject<boolean>;
}) {
  const [account, setAccount] = useState<string | null>(null);

  // 동기화 부트스트랩이 끝나면(on) 영구 계정 이메일 표시 — 게스트면 null 유지
  useEffect(() => {
    if (sync !== 'on') return;
    currentAccount().then(setAccount);
  }, [sync]);

  // 로그인/가입 직후 — 계정 표시 갱신 + (다른 계정이면) 그 계정의 클라우드 세이브 채택
  const onAuthChanged = async () => {
    setAccount(await currentAccount());
    const { data: { session } } = await supabase!.auth.getSession();
    const uid = session?.user.id ?? null;
    if (uid && uid !== userIdRef.current) { // 승격(uid 불변)이면 스킵, 로그인(교체)이면 로드
      userIdRef.current = uid;
      const cloud = await fetchCloudSave();
      setGame(cloud ? migrate(cloud.data) : newState());
      dirtyRef.current = false;
      setToast('계정의 클라우드 세이브를 불러왔다.');
    }
  };

  // 비밀번호 재설정 착지 — 메일 링크로 들어오면 Supabase가 PASSWORD_RECOVERY를 쏜다
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event !== 'PASSWORD_RECOVERY') return;
      const pw = window.prompt('새 비밀번호를 입력하세요 (6자 이상):');
      if (!pw) return;
      applyNewPassword(pw).then(r =>
        setToast(r.ok ? '비밀번호가 변경되었다.' : `비밀번호 변경 실패: ${r.msg}`));
    });
    return () => subscription.unsubscribe();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 구독, setToast는 항상 최신 클로저가 필요 없다
  }, []);

  // 로그인 유도 넛지 — 명성 500 도달 시 1회 (게스트만). 세이브 필드 대신 localStorage 1키.
  useEffect(() => {
    if (!supabase || account || game.fame < 500) return;
    if (localStorage.getItem('pf-account-nudged')) return;
    localStorage.setItem('pf-account-nudged', '1');
    // oxlint-disable-next-line react/set-state-in-effect -- 명성이 문턱을 넘는 "순간"에 1회만 쏘는 알림이라 이벤트 지점이 따로 없다
    setToast('명성 500 달성! 진행을 지키려면 설정 탭에서 계정을 만들어 두세요.');
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fame, account]);

  return { account, onAuthChanged };
}
