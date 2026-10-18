import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, kstDay } from '../../../platform/api';
import { identifyUser } from '../../../platform/observability';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import type { MaybePromise } from '../../../platform/api';
import { setSessionUid, useSession } from './session';
import { ACCOUNT_NUDGE_FAME, MIN_PASSWORD_LENGTH, passwordLongEnough, shouldNudgeAccount } from '../model/accountRules';

// 계정 상태 (v0.4.0) — 표시 이메일 · 로그인(계정 교체) 처리 ·
// 비밀번호 재설정 착지 · 가입 넛지. 상태 로드/디스패치는 useGame 소관 (계층: service&state).
// uid는 세션 게이트가 정본이다 — 계정 교체 때 게이트를 갱신하면 uid 키를 쓰는 조회가 함께 다시 읽힌다.
// api.auth가 http/local을 갈아끼운다 — 훅은 supabase를 직접 모른다.

export function useAccount({ game, setGame, setToast, load }: {
  game: GameState;
  setGame: (g: GameState) => void;
  /** 메시지 창에 남긴다 — 거부·실패는 tone 'warn'을 넘긴다 */
  setToast: (message: string, tone?: 'info' | 'gold' | 'warn') => void;
  /** useGame의 gateway.load — 계정 교체 시 그 계정의 서버 상태를 읽는다 */
  load: () => MaybePromise<GameState | null>;
}) {
  // 로컬 개발(supabase 미설정)은 UI 확인 용도로 가짜 계정으로 시작한다
  const [account, setAccount] = useState<string | null>(api.auth.isConfigured ? null : 'dev@localhost');
  // 계정 여부 확인이 끝났는가 — 끝나기 전의 null은 게스트가 아니라 미확인이다
  const [accountChecked, setAccountChecked] = useState(!api.auth.isConfigured);
  const client = useQueryClient();
  const session = useSession();
  // 화면에 띄울 uid — 문의가 들어왔을 때 그 사람 세이브를 DB에서 찾는 유일한 열쇠다.
  // 게스트는 이메일이 없어서 uid 말고는 식별할 방법이 없다.
  const uid = api.auth.isConfigured ? session.uid : '00000000-0000-4000-8000-000000000000';
  const uidRef = useRef<string | null>(null); // 마지막으로 채택한 uid — 승격/교체 판별 기준

  // 세션이 서면(서버 상태 로드와 병렬로) 영구 계정 이메일 표시 — 게스트면 null 유지
  useEffect(() => {
    if (!session.ready || !session.uid || !api.auth.isConfigured) return;
    if (!uidRef.current) uidRef.current = session.uid;
    api.auth.currentAccount().then(a => { setAccount(a); setAccountChecked(true); });
    identifyUser(session.uid); // uid만 — PII 미전송
  }, [session.ready, session.uid]);

  // 로그인/가입 직후 — 계정 표시 갱신 + (다른 계정이면) 그 계정의 서버 상태 채택.
  // 승격(가입)은 uid 불변이라 스킵 — 갓 승격한 게스트는 서버가 아직 비어 있을 수 있어서
  // load()를 타면 로컬 진행이 newState로 덮인다 (v0.4.0 구조 원칙: 가입 = 승격이지 이전이 아니다).
  const onAuthChanged = async () => {
    setAccount(await api.auth.currentAccount());
    const { uid: next } = await api.auth.getSession();
    setSessionUid(client, next);
    if (next && next !== uidRef.current) { // 로그인(계정 교체)만 서버 상태 로드
      uidRef.current = next;
      const cloud = await load();
      setGame(cloud ?? newState());
      setToast('계정의 클라우드 세이브를 불러왔어요.');
    }
  };

  // 비밀번호 재설정 착지 — 메일 링크로 들어오면 Supabase가 PASSWORD_RECOVERY를 쏜다
  useEffect(() => {
    if (!api.auth.isConfigured) return;
    const { unsubscribe } = api.auth.onAuthStateChange(event => {
      if (event !== 'PASSWORD_RECOVERY') return;
      const pw = window.prompt(`새 비밀번호를 입력해 주세요. (${MIN_PASSWORD_LENGTH}자 이상)`);
      if (!pw) return;
      if (!passwordLongEnough(pw)) { setToast(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`, 'warn'); return; }
      api.auth.applyNewPassword(pw).then(r => {
        if (r.ok) setToast('비밀번호를 바꿨어요.');
        else setToast(`비밀번호를 바꾸지 못했어요. ${r.msg}`, 'warn');
      });
    });
    return () => unsubscribe();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 구독, setToast는 항상 최신 클로저가 필요 없다
  }, []);

  // 로그인 유도 넛지 — 명성 기준을 넘은 게스트에게 하루 한 번. 띄운 날짜는 세이브 대신 localStorage 1키에 둔다.
  useEffect(() => {
    const today = kstDay();
    if (!shouldNudgeAccount({
      configured: api.auth.isConfigured, accountChecked, signedIn: account !== null,
      fame: game.fame, lastNudgedDay: api.auth.accountNudgedDay(), today,
    })) return;
    api.auth.markAccountNudged(today);
    // oxlint-disable-next-line react/set-state-in-effect -- 조건이 처음 맞는 순간(그날 첫 접속·명성 도달)에 한 번 쏘는 알림이라 이벤트 지점이 따로 없다
    setToast(`명성이 ${ACCOUNT_NUDGE_FAME.toLocaleString()}에 이르렀어요. 진행을 지키려면 설정 탭의 계정 관리에서 계정을 만들어 보세요.`);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fame, account, accountChecked]);

  return { account, uid, onAuthChanged };
}
