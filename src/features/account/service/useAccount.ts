import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, kstDay } from '../../../platform/api';
import { identifyUser } from '../../../platform/observability';
import type { GameState } from '../../../game/rules/logic';
import { setSessionUid, useSession } from './session';
import { ACCOUNT_NUDGE_FAME, MIN_PASSWORD_LENGTH, passwordLongEnough, shouldNudgeAccount } from '../model/accountRules';

// 계정 상태 - 표시 이메일 · 이메일 계정 로그인(계정 교체) 처리 ·
// 비밀번호 재설정 착지 · 계정 연결 넛지. 상태 로드/디스패치는 useGame 소관 (계층: service&state).
// uid는 세션 게이트가 정본이다 — 계정 교체 때 게이트를 갱신하면 uid 키를 쓰는 조회가 함께 다시 읽힌다.
// api.auth가 http/local을 갈아끼운다 — 훅은 인증 구현을 직접 모른다.

export function useAccount({ game, setToast, adoptAccount, askNewPassword }: {
  game: GameState;
  /** 메시지 창에 남긴다 — 거부·실패는 tone 'warn'을 넘긴다 */
  setToast: (message: string, tone?: 'info' | 'gold' | 'warn') => void;
  /** useGame의 계정 교체 — 그 계정의 서버 상태를 채택하고 이 창을 그 계정의 활성 창으로 접속시킨다 */
  adoptAccount: () => Promise<void>;
  /** 재설정 링크로 돌아왔을 때 새 비밀번호를 묻는다. 취소하면 null */
  askNewPassword: (minLength: number) => Promise<string | null>;
}) {
  // 로컬 개발(클라우드 미설정)은 UI 확인 용도로 가짜 계정으로 시작한다
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

  // 이메일 계정으로 로그인한 직후 - 계정 표시 갱신 + (다른 계정이면) 그 계정의 서버 상태 채택과 접속 기록.
  // 서버는 접속(boot)한 창을 계정의 활성 창으로 삼으므로, 교체한 계정에도 접속을 보내야 이 창의 액션이 거부되지 않는다.
  // uid가 그대로면(같은 계정의 표시 갱신) 서버 상태를 다시 읽지 않는다. 구글 연결과 구글 로그인은 인증 화면을 다녀오는 전체 페이지 이동이라
  // 이 함수를 거치지 않고, 돌아온 부팅이 새 세션으로 계정과 진행을 읽는다.
  const onAuthChanged = async () => {
    setAccount(await api.auth.currentAccount());
    const { uid: next } = await api.auth.getSession();
    setSessionUid(client, next);
    if (next && next !== uidRef.current) { // 로그인(계정 교체)만 서버 상태 로드
      uidRef.current = next;
      await adoptAccount();
      setToast('계정의 클라우드 세이브를 불러왔어요.');
    }
  };

  // 비밀번호 재설정 착지 — 메일 링크는 서버를 거쳐 재설정 토큰을 단 주소로 돌아온다. 부팅 때 한 번 확인한다
  useEffect(() => {
    if (!api.auth.isConfigured) return;
    const landing = api.auth.takePasswordResetLanding();
    if (!landing) return;
    if (landing === 'invalid') {
      setToast('비밀번호를 바꾸지 못했어요. 재설정 링크가 만료됐거나 이미 쓰였어요. 재설정을 다시 요청해 주세요.', 'warn');
      return;
    }
    void askNewPassword(MIN_PASSWORD_LENGTH).then(pw => {
      if (!pw) return;
      if (!passwordLongEnough(pw)) { setToast(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`, 'warn'); return; }
      return api.auth.applyNewPassword(pw).then(r => {
        if (r.ok) setToast('비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.');
        else setToast(`비밀번호를 바꾸지 못했어요. ${r.msg}`, 'warn');
      });
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 확인, setToast는 항상 최신 클로저가 필요 없다
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
