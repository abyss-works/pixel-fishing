import { useEffect, useRef, useState } from 'react';
import { api, LEGACY_KEY } from '../api';
import { HttpBackend } from '../backend/http';
import { LocalBackend } from '../backend/local';
import { when } from '../backend/types';
import type { Backend, DispatchResult, MaybePromise } from '../backend/types';
import type { GameAction } from '../game/actions';
import { migrate, newState } from '../game/logic';
import type { GameState } from '../game/logic';
import { fail, subscribeFailure, POLICY, AppError } from '../errors';
import { BUILD_ID } from '../buildId';

// 게임 상태 소유 + 백엔드 디스패치 (계층: service&state — 서버 권위 v0.5.0)
// 모든 상태 변경은 api.game.dispatch 하나로 흐른다. api가 http/local을 갈아끼운다.
// 구 20초 동기화 루프·dirty 플래그·beforeunload flush는 소멸 — "액션이 곧 저장"이라 동기화 개념 자체가 없다.

export type SyncState = 'off' | 'connecting' | 'on' | 'error';

const SYNC_LABEL: Record<SyncState, string | null> = {
  off: '클라우드 미설정 — 새로고침하면 사라진다 (개발 모드)',
  connecting: '클라우드 연결 중...',
  on: '클라우드 저장 켜짐',
  error: '클라우드 연결 실패 — 진행이 저장되지 않는 중',
};

// 레거시 localStorage 세이브를 메모리로 1회 이관 (쓰기는 하지 않음)
function loadLegacy(): { game: GameState; notice: string | null; legacy: boolean } {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const game = migrate(parsed);
      const notice = parsed?.v !== 4 && game.fame > 0
        ? `업데이트! 그동안 잡은 물고기가 명성으로 소급 인정되었다. 명성 ${game.fame}`
        : null;
      return { game, notice, legacy: true };
    }
  } catch { /* 손상된 저장 데이터는 무시하고 새로 시작 */ }
  return { game: newState(), notice: null, legacy: false };
}

export function useGame({ setToast }: { setToast: (m: string) => void }) {
  const [init] = useState(loadLegacy);
  const backendRef = useRef<Backend>(null!);
  if (!backendRef.current) {
    backendRef.current = api.auth.isConfigured ? new HttpBackend() : new LocalBackend(init.game);
  }
  const [game, setGame] = useState<GameState>(init.game);
  const [sync, setSync] = useState<SyncState>(api.auth.isConfigured ? 'connecting' : 'off');
  // 배포 후 새로고침 안 한 낡은 탭 (서버 426) — true면 App이 업데이트 모달로 전체를 덮는다
  const [outdated, setOutdated] = useState(false);
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  // 레거시 이관 환영 안내 (R18b) — 오프라인 모드에서도 표시돼야 하므로 부트스트랩과 분리
  useEffect(() => {
    if (init.notice) setToast(init.notice);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);

  // 실패 대응은 여기 하나뿐이다  — 종류별 결정은 errors.ts의 정책 표가 내리고,
  // 이 훅은 그 결정을 화면에 반영만 한다. 실패 에피소드당 1회만 알린다(복구되면 리셋).
  const alertedRef = useRef(false);
  const rescueRef = useRef<(headline: string) => void>(() => {});
  useEffect(() => subscribeFailure((err: AppError) => {
    const policy = POLICY[err.kind];
    if (policy.modal === 'update') setOutdated(true);
    if (!policy.rescue) return;
    setSync(api.auth.isConfigured ? 'error' : 'off');
    if (alertedRef.current) return;
    alertedRef.current = true;
    rescueRef.current(policy.message);
  }), []);

  // 진행 상황을 이사 코드로 만들어 복사해 주고 복구를 안내한다 (저장되지 않은 실패에서만)
  // import는 이제 소유자 전용(incidents/2026-08-24) — 불러오기는 유저가 아니라 개발자가 한다.
  const rescueAlert = async (headline: string) => {
    const code = api.storage.saveCode(gameRef.current);
    const guide = `${headline}\n\n만약을 위해 지금까지의 진행 상황을 코드로 만들어 뒀어요.\n\n게임을 새로고침해 다시 접속하세요.\n같은 문제가 반복되면 아래 코드를 개발자에게 보내주세요.`;
    try {
      await navigator.clipboard.writeText(code);
      window.alert(`${guide}\n\n(이사 코드는 클립보드에 복사되어 있어요)`);
    } catch {
      window.alert(guide);
      window.prompt('이사 코드 — 복사해서 보관하세요:', code);
    }
  };

  useEffect(() => { rescueRef.current = h => void rescueAlert(h); });

  /** 모든 상태 변경의 단일 진입점 — 성공/규칙거부만 돌아온다.
      인프라 실패는 AppError로 던져져 위 정책 구독으로 흐른다 (호출자에 방어 분기 없음) */
  const dispatch = (action: GameAction): MaybePromise<DispatchResult> =>
    when(backendRef.current.dispatch(action), r => {
      if (r.status === 'ok') {
        setGame(r.state);
        if (api.auth.isConfigured) { setSync('on'); alertedRef.current = false; }
      }
      // rejected는 규칙 거부 — 호출자가 사유 토스트를 띄운다 (연결은 정상이므로 sync 유지)
      return r;
    });

  // 부트스트랩 — 익명 로그인 → 서버 상태 채택. 서버가 비어 있고 레거시 진행이 있으면
  // import 액션으로 수입(신뢰 채널 재사용 — 서버가 saves_current를 시딩한다).
  useEffect(() => {
    if (!api.auth.isConfigured) return;
    (async () => {
      const uid = await api.auth.ensureSession();
      if (!uid) throw new AppError('unauthorized', 'anonymous session failed');
      const cloud = await backendRef.current.load();
      if (cloud) {
        setGame(cloud);
        setToast('클라우드 세이브를 불러왔다.');
      } else if (init.legacy) {
        // 구세대(localStorage) 브리지도 import 액션이라 소유자 게이트에 걸린다(incidents/2026-08-24).
        // 거부돼도 세션은 정상 시작한다 — 로컬 저장은 지우지 않아 수동 복구(개발자가 DB 이관)에 쓴다.
        try {
          await dispatch({ type: 'import', save: init.game });
          localStorage.removeItem(LEGACY_KEY); // 브리지 성공 — 로컬 저장 사용 종료
        } catch (e) {
          if (!(e instanceof AppError && e.kind === 'restricted')) throw e;
        }
      }
      // 접속 기록 — DAU·리텐션의 정본(events). 세션 시작에 1회, 새로고침마다 다시 센다.
      // 텔레메트리이므로 **모든 실패를 조용히 삼킨다**: 429 페이싱·순단 모두 재시도 가치가
      // 없고, fail()을 거치면 rescue 안내라는 과대 반응이 따라온다. 다음 접속에 다시 실린다.
      void Promise.resolve(dispatch({ type: 'boot', buildId: BUILD_ID })).catch(() => { /* 무음 */ });
      setSync('on');
    })().catch(fail); // 정책 한 곳으로 — 여기서 UX를 정하지 않는다
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 부트스트랩
  }, [init.legacy]);

  return {
    game, setGame, dispatch, sync, syncLabel: SYNC_LABEL[sync], outdated,
    /** 계정 교체(useAccount) 시 그 계정의 상태를 다시 읽는 용도 */
    load: () => backendRef.current.load(),
    /** 캐스팅 순간 서버 함수 워밍 — 콜드 스타트를 wait 구간에 흡수 */
    warmup: () => backendRef.current.warmup?.(),
  };
}
