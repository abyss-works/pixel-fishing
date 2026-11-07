import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, when } from '../../../platform/api';
import type { GameGateway, DispatchResult, MaybePromise } from '../../../platform/api';
import type { GameAction } from '../../../game/rules/actions';
import type { RejectReason } from '../../../game/rules/rules';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { fail, subscribeFailure, POLICY, AppError } from '../../../core/errors';
import type { BlockingModal } from '../../../core/errors';
import { BUILD_ID } from '../../../buildId';
import { settleForcedEncounter, withForcedEncounter } from '../../bounty/service/forceEncounter';
import { fetchSession } from '../../account/service/session';
import { setSchoolDay } from './schoolDay';
import { alertUpdate } from './updateAlert';

// 게임 상태 소유와 액션 흐름 조율 (계층: 서비스 — 서버 권위 v0.5.0)
// 모든 상태 변경은 API가 제공한 게임 게이트웨이의 dispatch 하나로 흐른다 — http/local 구현은
// 인프라 구현은 플랫폼 경계 안에 두고 이 훅은 구체 구현을 모른다.
// 구 20초 동기화 루프·dirty 플래그·beforeunload flush는 소멸 — "액션이 곧 저장"이라 동기화 개념 자체가 없다.

export type SyncState = 'off' | 'connecting' | 'on' | 'error';

const SYNC_LABEL: Record<SyncState, string | null> = {
  off: '클라우드가 설정되지 않았어요. 새로고침하면 진행이 사라져요. (개발 모드)',
  connecting: '클라우드 연결 중…',
  on: '클라우드 저장 켜짐',
  error: '클라우드에 연결하지 못했어요. 지금은 진행이 저장되지 않아요.',
};

/**
 * 호출부가 직접 잡은 인프라 실패를 오류 정책으로 보낸다. 정책이 전체 모달로 알리는 종류면 null,
 * 모달이 없는 종류면 메시지 창에 보일 한 줄을 돌려준다.
 */
export function reportFailure(e: unknown): string | null {
  const err = fail(e);
  const policy = POLICY[err.kind];
  return policy.modal ? null : policy.message;
}

export function useGame({ setToast }: { setToast: (m: string) => void }) {
  const [init] = useState(() => api.storage.loadLegacy());
  const gameGatewayRef = useRef<GameGateway>(null!);
  if (!gameGatewayRef.current) {
    gameGatewayRef.current = api.createGameGateway(init.game);
  }
  const [game, setGame] = useState<GameState>(init.game);
  const [nickname, setNickname] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>(api.auth.isConfigured ? 'connecting' : 'off');
  // 세이브를 불러오고 이 창을 접속(boot)시키는 중 — 서버는 접속한 창의 액션만 받으므로 그 전에는 플레이를 막는다.
  // 그동안의 게임 상태는 서버 세이브가 아니라 기본값이라 화면에도 보이지 않는다.
  const [loading, setLoading] = useState(api.auth.isConfigured);
  // 진행을 막는 모달 — 낡은 탭(서버 426)이나 다른 창의 접속(서버 423). 값이 있으면 GameView가 그 모달로 전체를 덮는다
  const [blocker, setBlocker] = useState<BlockingModal | null>(null);

  // 레거시 이관 환영 안내 (R18b) — 오프라인 모드에서도 표시돼야 하므로 부트스트랩과 분리
  useEffect(() => {
    if (init.notice) setToast(init.notice);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);

  // 실패 대응은 여기 하나뿐이다  — 종류별 결정은 에러 처리의 정책 표가 내리고,
  // 이 훅은 그 결정을 화면에 반영만 한다.
  useEffect(() => subscribeFailure((err: AppError) => {
    const modal = POLICY[err.kind].modal;
    if (!modal) return;
    setBlocker(current => current ?? modal);
    // 방치 중 배포를 알린다 — 실패마다 다시 들어와도 알림 태그와 제목 깜빡임이 하나로 합쳐진다
    if (modal === 'update') alertUpdate();
    if (modal === 'unsaved') setSync(api.auth.isConfigured ? 'error' : 'off');
  }), []);

  /** 모든 상태 변경의 단일 진입점 — 성공/규칙거부만 돌아온다.
      인프라 실패는 AppError로 던져져 위 정책 구독으로 흐른다 (호출자에 방어 분기 없음) */
  const client = useQueryClient();
  const dispatch = (action: GameAction): MaybePromise<DispatchResult> =>
    when(gameGatewayRef.current.dispatch(withForcedEncounter(action)), r => {
      if (r.status === 'ok') {
        setGame(r.state);
        settleForcedEncounter(r.result);
        // 어군 배치 날짜 — 리듀서(서버 시계, 로컬은 클라 시계)가 정한 값으로 세션을 고정한다
        if (r.result.type === 'boot') setSchoolDay(r.result.schoolDay);
        if (api.auth.isConfigured) setSync('on');
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

  // 접속 기록 — DAU·리텐션의 정본(events)이고, 서버는 접속한 창을 계정의 활성 창으로 삼는다.
  // 세션 시작과 계정 교체마다 보내고, 응답이 올 때까지 플레이를 열지 않는다.
  // **모든 실패를 조용히 삼킨다**: 429 페이싱·순단 모두 재시도 가치가 없고, fail()을 거치면
  // 저장 실패 안내 창이라는 과대 반응이 따라온다. 다음 접속에 다시 실린다.
  const boot = (): Promise<void> =>
    Promise.resolve(dispatch({ type: 'boot', buildId: BUILD_ID })).then(() => {}, () => { /* 무음 */ });

  // 부트스트랩 — 세션 게이트(직렬) → 서버 상태·닉네임(병렬) → 채택. 서버가 비어 있고 레거시 진행이 있으면
  // import 액션으로 수입(신뢰 채널 재사용 — 서버가 saves_current를 시딩한다).
  useEffect(() => {
    if (!api.auth.isConfigured) {
      void Promise.resolve(gameGatewayRef.current.getNickname()).then(setNickname);
      // 로컬 모드도 같은 리듀서로 부팅한다 — 어군 배치 날짜를 클라 시계로 같은 규칙에 따라 정한다
      void boot();
      return;
    }
    (async () => {
      const uid = await fetchSession(client);
      if (!uid) throw new AppError('unauthorized', 'anonymous session failed');
      const [cloud, nick] = await Promise.all([
        gameGatewayRef.current.load(),
        gameGatewayRef.current.getNickname(),
      ]);
      if (cloud) {
        setGame(cloud);
        setToast('클라우드 세이브를 불러왔어요.');
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
      // 세션 시작에 1회, 새로고침마다 다시 센다.
      await boot();
      setNickname(nick);
      setSync('on');
    })().catch(fail) // 정책 한 곳으로 — 여기서 UX를 정하지 않는다
      .finally(() => setLoading(false));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 부트스트랩
  }, [init.legacy]);

  return {
    game, dispatch, nickname, sync, syncLabel: SYNC_LABEL[sync], blocker, loading,
    /** 닉네임 변경 — 성공하면 표시값을 다시 읽는다. null이면 성공, 아니면 거부 사유. */
    rename: async (name: string): Promise<null | RejectReason> => {
      const r = await gameGatewayRef.current.dispatch({ type: 'setNickname', nickname: name });
      if (r.status === 'ok') {
        setNickname(await gameGatewayRef.current.getNickname());
        return null;
      }
      return r.error;
    },
    /**
     * 계정 교체(useAccount) — 그 계정의 서버 상태를 채택하고 이 창을 그 계정의 활성 창으로 접속시킨다.
     * 끝날 때까지 불러오는 중이다. 상태 읽기 실패는 호출자에게 던진다.
     */
    adoptAccount: async (): Promise<void> => {
      setLoading(true);
      try {
        const [cloud, nick] = await Promise.all([gameGatewayRef.current.load(), gameGatewayRef.current.getNickname()]);
        setGame(cloud ?? newState());
        setNickname(nick);
        await boot();
      } finally {
        setLoading(false);
      }
    },
    /**
     * 액션 밖에서 서버가 바꾼 상태(길드 보너스 기부로 빠진 골드 등)를 다시 읽어 채택한다. 게이트웨이의 캐시와 버전도
     * 새로 읽은 상태로 맞춰진다. 읽기에 실패하면 그대로 둔다 — 다음 액션의 응답이 버전 차이를 보고 다시 읽는다.
     */
    resync: async (): Promise<void> => {
      const s = await Promise.resolve(gameGatewayRef.current.load()).catch(() => null);
      if (s) setGame(s);
    },
    /** 캐스팅 순간 서버 함수 워밍 — 콜드 스타트를 wait 구간에 흡수 */
    warmup: () => gameGatewayRef.current.warmup?.(),
  };
}
