import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, when } from '../../../platform/api';
import type { GameGateway, DispatchResult, MaybePromise } from '../../../platform/api';
import type { GameAction } from '../../../game/rules/actions';
import type { RejectReason } from '../../../game/rules/rules';
import type { GameState } from '../../../game/rules/logic';
import { fail, subscribeFailure, POLICY, AppError } from '../../../core/errors';
import { BUILD_ID } from '../../../buildId';
import { settleForcedEncounter, withForcedEncounter } from '../../bounty/service/forceEncounter';

// 게임 상태 소유와 액션 흐름 조율 (계층: 서비스 — 서버 권위 v0.5.0)
// 모든 상태 변경은 API가 제공한 게임 게이트웨이의 dispatch 하나로 흐른다 — http/local 구현은
// 인프라 구현은 플랫폼 경계 안에 두고 이 훅은 구체 구현을 모른다.
// 구 20초 동기화 루프·dirty 플래그·beforeunload flush는 소멸 — "액션이 곧 저장"이라 동기화 개념 자체가 없다.

export type SyncState = 'off' | 'connecting' | 'on' | 'error';

const SYNC_LABEL: Record<SyncState, string | null> = {
  off: '클라우드 미설정 — 새로고침하면 사라진다 (개발 모드)',
  connecting: '클라우드 연결 중...',
  on: '클라우드 저장 켜짐',
  error: '클라우드 연결 실패 — 진행이 저장되지 않는 중',
};

export function useGame({ setToast }: { setToast: (m: string) => void }) {
  const [init] = useState(() => api.storage.loadLegacy());
  const gameGatewayRef = useRef<GameGateway>(null!);
  if (!gameGatewayRef.current) {
    gameGatewayRef.current = api.createGameGateway(init.game);
  }
  const [game, setGame] = useState<GameState>(init.game);
  const [nickname, setNickname] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>(api.auth.isConfigured ? 'connecting' : 'off');
  // 배포 후 새로고침 안 한 낡은 탭 (서버 426) — true면 GameView가 업데이트 모달로 전체를 덮는다
  const [outdated, setOutdated] = useState(false);
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  // 레거시 이관 환영 안내 (R18b) — 오프라인 모드에서도 표시돼야 하므로 부트스트랩과 분리
  useEffect(() => {
    if (init.notice) setToast(init.notice);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);

  // 실패 대응은 여기 하나뿐이다  — 종류별 결정은 에러 처리의 정책 표가 내리고,
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
  // 저장 데이터 import는 소유자 전용이며 일반 사용자에게 노출하지 않는다.
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
  const client = useQueryClient();
  const dispatch = (action: GameAction): MaybePromise<DispatchResult> =>
    when(gameGatewayRef.current.dispatch(withForcedEncounter(action)), r => {
      if (r.status === 'ok') {
        setGame(r.state);
        settleForcedEncounter(r.result);
        if (api.auth.isConfigured) { setSync('on'); alertedRef.current = false; }
        // 수배 스냅샷을 바꾸는 액션만 무효화한다. catch는 티켓 발급분만 해당하고
        // 나머지는 스냅샷과 무관이라 건드리지 않는다 (폭풍 방지).
        if (action.type === 'acceptQuest' || action.type === 'deliverBounty'
            || action.type === 'resolveChallenge' || action.type === 'debug'
            || (action.type === 'catch' && r.result.type === 'catch' && r.result.ticket)) {
          void client.invalidateQueries({ queryKey: ['bounty'] });
        }
      }
      // rejected는 규칙 거부 — 호출자가 사유 토스트를 띄운다 (연결은 정상이므로 sync 유지)
      return r;
    });

  // 부트스트랩 — 익명 로그인 → 서버 상태 채택. 서버가 비어 있고 레거시 진행이 있으면
  // import 액션으로 수입(신뢰 채널 재사용 — 서버가 saves_current를 시딩한다).
  useEffect(() => {
    if (!api.auth.isConfigured) {
      void Promise.resolve(gameGatewayRef.current.getNickname()).then(setNickname);
      return;
    }
    (async () => {
      const uid = await api.auth.ensureSession();
      if (!uid) throw new AppError('unauthorized', 'anonymous session failed');
      const cloud = await gameGatewayRef.current.load();
      if (cloud) {
        setGame(cloud);
        setToast('클라우드 세이브를 불러왔다.');
      } else if (init.legacy) {
        // 구세대(localStorage) 브리지도 import 액션이므로 소유자 게이트를 적용한다.
        // 거부돼도 세션은 정상 시작한다 — 로컬 저장은 지우지 않아 수동 복구(개발자가 DB 이관)에 쓴다.
        try {
          await dispatch({ type: 'import', save: init.game });
          api.storage.clearLegacySave(); // 브리지 성공 — 로컬 저장 사용 종료
        } catch (e) {
          if (!(e instanceof AppError && e.kind === 'restricted')) throw e;
        }
      }
      // 접속 기록 — DAU·리텐션의 정본(events). 세션 시작에 1회, 새로고침마다 다시 센다.
      // 텔레메트리이므로 **모든 실패를 조용히 삼킨다**: 429 페이싱·순단 모두 재시도 가치가
      // 없고, fail()을 거치면 rescue 안내라는 과대 반응이 따라온다. 다음 접속에 다시 실린다.
      void Promise.resolve(dispatch({ type: 'boot', buildId: BUILD_ID })).catch(() => { /* 무음 */ });
      setNickname(await gameGatewayRef.current.getNickname());
      setSync('on');
    })().catch(fail); // 정책 한 곳으로 — 여기서 UX를 정하지 않는다
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 부트스트랩
  }, [init.legacy]);

  return {
    game, setGame, dispatch, nickname, sync, syncLabel: SYNC_LABEL[sync], outdated,
    /** 닉네임 변경 — 성공하면 표시값을 다시 읽는다. null이면 성공, 아니면 거부 사유. */
    rename: async (name: string): Promise<null | RejectReason> => {
      const r = await gameGatewayRef.current.dispatch({ type: 'setNickname', nickname: name });
      if (r.status === 'ok') {
        setNickname(await gameGatewayRef.current.getNickname());
        return null;
      }
      return r.error;
    },
    /** 계정 교체(useAccount) 시 그 계정의 상태를 다시 읽는 용도 */
    load: () => when(gameGatewayRef.current.load(), s => {
      void Promise.resolve(gameGatewayRef.current.getNickname()).then(setNickname);
      return s;
    }),
    /** 캐스팅 순간 서버 함수 워밍 — 콜드 스타트를 wait 구간에 흡수 */
    warmup: () => gameGatewayRef.current.warmup?.(),
  };
}
