import { useEffect, useRef, useState } from 'react';
import { supabase, currentAccount, applyNewPassword } from '../backend/auth';
import { identifyUser } from '../observability';
import { newState } from '../game/logic';
import type { GameState } from '../game/logic';
import type { MaybePromise } from '../backend/types';
import type { SyncState } from './useGame';

// 계정 상태 (v0.4.0) — 표시 이메일 · 로그인(계정 교체) 처리 ·
// 비밀번호 재설정 착지 · 가입 넛지. 상태 로드/디스패치는 useGame 소관 (계층: service&state).
// 로컬 UI 확인용 가짜 신원 — supabase가 없을 때만 쓰인다(배포 빌드에는 supabase가 항상 있다)
const DEV_ACCOUNT = 'dev@localhost';
const DEV_UID = '00000000-0000-4000-8000-000000000000';

export function useAccount({ game, setGame, setToast, sync, load }: {
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (m: string) => void;
  sync: SyncState;
  /** useGame의 backend.load — 계정 교체 시 그 계정의 서버 상태를 읽는다 */
  load: () => MaybePromise<GameState | null>;
}) {
  // 로컬 개발(supabase 미설정)은 **UI 확인 용도**라 로그인된 것으로 가정한다.
  // 그러지 않으면 계정·편지처럼 로그인 뒤에만 뜨는 화면을 로컬에서 아예 못 본다.
  // 값은 명백히 가짜다 — 실물과 헷갈릴 여지를 남기지 않는다.
  const [account, setAccount] = useState<string | null>(supabase ? null : DEV_ACCOUNT);
  // 화면에 띄울 uid — 문의가 들어왔을 때 그 사람 세이브를 DB에서 찾는 유일한 열쇠다.
  // 게스트는 이메일이 없어서 uid 말고는 식별할 방법이 없다.
  const [uid, setUid] = useState<string | null>(supabase ? null : DEV_UID);
  const uidRef = useRef<string | null>(null); // 부트스트랩 시점 uid — 승격/교체 판별 기준

  // 부트스트랩이 끝나면(on) 영구 계정 이메일 표시 — 게스트면 null 유지
  useEffect(() => {
    if (sync !== 'on' || !supabase) return;
    currentAccount().then(setAccount);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!uidRef.current) uidRef.current = session?.user.id ?? null;
      setUid(session?.user.id ?? null);
      identifyUser(session?.user.id ?? null); // uid만 — PII 미전송
    });
  }, [sync]);

  // 로그인/가입 직후 — 계정 표시 갱신 + (다른 계정이면) 그 계정의 서버 상태 채택.
  // 승격(가입)은 uid 불변이라 스킵 — 갓 승격한 게스트는 서버가 아직 비어 있을 수 있어서
  // load()를 타면 로컬 진행이 newState로 덮인다 (v0.4.0 구조 원칙: 가입 = 승격이지 이전이 아니다).
  const onAuthChanged = async () => {
    setAccount(await currentAccount());
    const { data: { session } } = await supabase!.auth.getSession();
    const next = session?.user.id ?? null;
    setUid(next);
    if (next && next !== uidRef.current) { // 로그인(계정 교체)만 서버 상태 로드
      uidRef.current = next;
      const cloud = await load();
      setGame(cloud ?? newState());
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

  return { account, uid, onAuthChanged };
}
