import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, isConsentRequiredError, subscribeConsentRequired, when } from '../../../platform/api';
import type { ConsentStatus, GameGateway, GameProfile, DispatchResult, MaybePromise } from '../../../platform/api';
import type { GameAction } from '../../../game/rules/actions';
import type { RejectReason } from '../../../game/rules/rules';
import { newState, newlyCompletedSpotDex, REJECT_TEXT } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { spotById } from '../../../game/content/spots';
import { sendNotice } from '../../display/model/toastPolicy';
import type { NoticeSink } from '../../display/model/toastPolicy';
import { fail, subscribeFailure, POLICY, AppError } from '../../../core/errors';
import type { BlockingModal } from '../../../core/errors';
import { clearFailureNotice, showFailureNotice } from './failureNotice';
import { BUILD_ID } from '../../../buildId';
import { settleForcedEncounter, withForcedEncounter } from '../../bounty/service/forceEncounter';
import { getPhaseOverride } from './timeOverride';
import { fetchSession } from '../../account/service/session';
import { allowConsentGate, blockConsentGate, holdConsentGate, resetConsentGate } from '../../account/service/consentGate';
import { guestProgress } from '../../account/model/accountRules';
import { newlyClaimable } from '../../achievement/model/achievements';
import { setSchoolDay } from './schoolDay';
import { queueFortuneModal, resetFortuneModalSession } from '../../fortune/service/fortuneModal';
import { setSharedProfileStatus } from './profileStatus';
import type { ProfileStatus, SyncState } from './types';
import { alertUpdate } from './updateAlert';
import { isRetryExhausted, retryOnRateLimit } from './rateLimitRetry';

// 게임 상태 소유와 액션 흐름 조율 (계층: 서비스 — 서버 권위 v0.5.0)
// 모든 상태 변경은 API가 제공한 게임 게이트웨이의 dispatch 하나로 흐른다 — http/local 구현은
// 인프라 구현은 플랫폼 경계 안에 두고 이 훅은 구체 구현을 모른다.
// 구 20초 동기화 루프·dirty 플래그·beforeunload flush는 소멸 — "액션이 곧 저장"이라 동기화 개념 자체가 없다.

const SYNC_LABEL: Record<SyncState, string | null> = {
  off: '저장 서버가 연결되지 않아 새로고침하면 진행이 사라져요. (오프라인)',
  connecting: '클라우드 연결 중…',
  on: '클라우드 저장 켜짐',
  error: '클라우드에 연결하지 못했어요. 지금은 진행이 저장되지 않아요.',
};

/** 게스트가 마을 밖으로 나가려 할 때의 안내. 서버가 거부할 때와 같은 문구다 */
export const GUEST_VILLAGE_ONLY_TEXT = POLICY['guest-village-only'].message;

export type ActionSettled = { ok: true } | { ok: false; notice: string | null };

export interface ConsentPromptState {
  consent: ConsentStatus | null;
  mismatch: boolean;
  error: string | null;
  busy: boolean;
}

/**
 * 행동 결과에 따라 화면을 되돌려야 하는 호출부용 — 성공이 아니면 ok false와 알릴 한 줄을 돌려준다.
 * 규칙 거부는 거부 문구를, 인프라 실패는 오류 정책(보고와 구독자 통지)을 거친 뒤 모달이 없는 종류의 정책 문구를 준다.
 * 정책이 전체 모달이나 메시지 창 오류 자리로 알리는 종류면 notice는 null이다(알림은 useGame의 실패 구독이 맡는다). 던지지 않는다.
 * rejectText로 사유별 문구를 그 행동에 맞게 바꿀 수 있다(없는 사유는 공용 거부 문구).
 */
export async function settleAction(
  run: () => MaybePromise<DispatchResult>, rejectText: Partial<Record<RejectReason, string>> = {},
): Promise<ActionSettled> {
  try {
    const result = await run();
    if (result.status === 'ok') return { ok: true };
    return { ok: false, notice: rejectText[result.error] ?? REJECT_TEXT[result.error] };
  } catch (e) {
    const appErr = fail(e);
    const kind = isConsentRequiredError(appErr) ? 'consent-required' : appErr.kind;
    const policy = POLICY[kind];
    return { ok: false, notice: policy.modal || policy.slot ? null : policy.message };
  }
}

export function useGame({ setToast }: { setToast: NoticeSink }) {
  const [init] = useState(() => api.storage.loadLegacy());
  const gameGatewayRef = useRef<GameGateway>(null!);
  if (!gameGatewayRef.current) {
    gameGatewayRef.current = api.createGameGateway(init.game);
  }
  const [game, setGameState] = useState<GameState>(init.game);
  // 마지막으로 채택한 상태 — 새로 받을 수 있게 된 업적을 가리는 비교 기준이다.
  // 렌더를 기다리지 않고 채택과 함께 바꿔, 연달아 온 확정과 로드 직후의 접속이 낡은 상태와 비교하지 않게 한다
  const gameRef = useRef(game);
  const setGame = (next: GameState) => { gameRef.current = next; setGameState(next); };
  // 게스트는 업적이 잠겨 있으므로 새로 받을 수 있는 업적 알림을 띄우지 않는다
  const guestRef = useRef(api.auth.isConfigured);
  const [nickname, setNickname] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  // 서버가 내려 준 개발 도구 사용 판정 — 계정이 바뀌면 새 계정의 판정으로 바뀐다
  const [devTools, setDevTools] = useState(false);
  const readProfile = (): Promise<GameProfile> =>
    Promise.resolve(gameGatewayRef.current.getProfile()).catch((): GameProfile => ({ ok: false }));
  const adoptProfile = (profile: GameProfile) => {
    if (profile.ok) {
      setNickname(profile.nickname);
      setDevTools(profile.devTools);
      setProfileStatus('loaded');
    } else {
      setNickname(null);
      setDevTools(false);
      setProfileStatus('error');
    }
  };
  useEffect(() => {
    setSharedProfileStatus(profileStatus);
  }, [profileStatus]);
  useEffect(() => () => { setSharedProfileStatus(null); }, []);
  const [sync, setSync] = useState<SyncState>(api.auth.isConfigured ? 'connecting' : 'off');
  // 세이브를 불러오고 이 창을 접속(boot)시키는 중 — 서버는 접속한 창의 액션만 받으므로 그 전에는 플레이를 막는다.
  // 그동안의 게임 상태는 서버 세이브가 아니라 기본값이라 화면에도 보이지 않는다.
  const [loading, setLoading] = useState(api.auth.isConfigured);
  // 진행을 막는 모달 — 낡은 탭(서버 426), 다른 창의 접속(서버 423), 약관 미수락(서버 403/1008). 값이 있으면 GameView가 그 모달로 전체를 덮는다
  const [blocker, setBlocker] = useState<BlockingModal | null>(null);
  const [consentPrompt, setConsentPrompt] = useState<ConsentPromptState>({
    consent: null, mismatch: false, error: null, busy: false,
  });
  const consentPromptRef = useRef(consentPrompt);
  consentPromptRef.current = consentPrompt;
  const bootedRef = useRef(false);
  const activeFlowRef = useRef<'boot' | 'adopt'>('boot');
  const pendingResumeRef = useRef<'boot' | 'adopt' | null>(null);
  const consentFetchingRef = useRef(false);
  const resumeFlowRef = useRef<(flow: 'boot' | 'adopt') => void>(() => {});
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const openConsentGate = (initial?: ConsentStatus) => {
    if (!bootedRef.current && pendingResumeRef.current === null) {
      pendingResumeRef.current = activeFlowRef.current;
    }
    blockConsentGate();
    setBlocker(current => current ?? 'consent');
    if (initial) {
      setConsentPrompt({ consent: initial, mismatch: false, error: null, busy: false });
      return;
    }
    if (consentPromptRef.current.consent?.required || consentFetchingRef.current) return;
    consentFetchingRef.current = true;
    setConsentPrompt(p => ({ ...p, error: null }));
    void api.auth.getAccountConsent()
      .then(latest => {
        if (!mountedRef.current) return;
        if (!latest.required) {
          allowConsentGate();
          setConsentPrompt({ consent: null, mismatch: false, error: null, busy: false });
          setBlocker(c => (c === 'consent' ? null : c));
          const resume = pendingResumeRef.current;
          pendingResumeRef.current = null;
          if (resume) resumeFlowRef.current(resume);
          return;
        }
        setConsentPrompt({ consent: latest, mismatch: false, error: null, busy: false });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setConsentPrompt(p => ({ ...p, error: '이용약관 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' }));
      })
      .finally(() => {
        consentFetchingRef.current = false;
      });
  };

  // 레거시 이관 환영 안내 (R18b) — 오프라인 모드에서도 표시돼야 하므로 부트스트랩과 분리
  useEffect(() => {
    if (init.notice) {
      sendNotice(setToast, {
        kind: 'system.modalConfirmUtility',
        text: init.notice,
      });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);

  // 실패 대응은 여기 하나뿐이다  — 종류별 결정은 에러 처리의 정책 표가 내리고,
  // 이 훅은 그 결정을 화면에 반영만 한다.
  useEffect(() => {
    const off = subscribeFailure((err: AppError) => {
      const kind = isConsentRequiredError(err) ? 'consent-required' : err.kind;
      if (kind === 'consent-required') {
        openConsentGate();
        return;
      }
      const policy = POLICY[kind];
      // 메시지 창에 한 줄 남기고, 접혀 있을 때는 오류 자리가 같은 문구를 보인다
      if (policy.slot && showFailureNotice(policy.message)) {
        sendNotice(setToast, {
          kind: 'system.criticalError',
          text: policy.message,
        });
      }
      const modal = policy.modal;
      if (!modal) return;
      setBlocker(current => current ?? modal);
      // 방치 중 배포를 알린다 — 실패마다 다시 들어와도 알림 태그와 제목 깜빡임이 하나로 합쳐진다
      if (modal === 'update') alertUpdate();
      if (modal === 'unsaved') setSync(api.auth.isConfigured ? 'error' : 'off');
    });
    const offConsent = subscribeConsentRequired(() => {
      openConsentGate();
    });
    // 구독이 끝나면 오류 자리의 안내와 약관 게이트도 함께 지운다
    return () => { off(); offConsent(); clearFailureNotice(); resetConsentGate(); };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 구독. setToast는 메시지 기록에 줄을 더할 뿐 상태를 읽지 않는다
  }, []);

  /** 모든 상태 변경의 단일 진입점 — 성공/규칙거부만 돌아온다.
      인프라 실패는 AppError로 던져져 위 정책 구독으로 흐른다 (호출자에 방어 분기 없음).
      결과에 따라 화면을 되돌려야 하는 호출부만 settleAction으로 감싸 쓴다 */
  const client = useQueryClient();
  const withDevFlags = (action: GameAction): GameAction => {
    const next = withForcedEncounter(action);
    const phase = getPhaseOverride();
    return next.type === 'catch' && phase && !next.forcePhase
      ? { ...next, forcePhase: phase }
      : next;
  };
  const dispatch = (action: GameAction): MaybePromise<DispatchResult> =>
    when(gameGatewayRef.current.dispatch(withDevFlags(action)), r => {
      if (r.status === 'ok') {
        const prev = gameRef.current;
        setGame(r.state);
        settleForcedEncounter(r.result);
        // 새로 받을 수 있게 된 업적은 메시지 창에 금색 톤으로 알린다 — 게스트는 잠금 상태라 알리지 않고,
        // boot·import 소급 평가에서 2건 이상이 한꺼번에 열리면 요약 1줄로 폭주를 막는다.
        if (!guestRef.current) {
          const unlocked = newlyClaimable(prev, r.state);
          if ((action.type === 'boot' || action.type === 'import') && unlocked.length >= 2) {
            sendNotice(setToast, {
              kind: 'achievement.unlockable',
              text: `${unlocked.length}개 업적을 받을 수 있어요.`,
              toastText: `업적 보상 ${unlocked.length}개 도착!`,
            });
          } else {
            for (const name of unlocked) {
              sendNotice(setToast, {
                kind: 'achievement.unlockable',
                text: `“${name}” 업적을 받을 수 있어요.`,
                toastText: `업적 “${name}” 보상 도착!`,
              });
            }
          }
        }
        // 해역 일반 도감 100% 완성 알림 — 업적 잠금 여부와 무관하게 게스트 포함 모든 플레이어에게 알린다
        if (action.type === 'catch') {
          const completedSpot = newlyCompletedSpotDex(prev.dex, r.state.dex, action.spot);
          if (completedSpot) {
            const spotName = spotById(completedSpot)?.name ?? completedSpot;
            sendNotice(setToast, {
              kind: 'dex.spotCompleted',
              text: `${spotName} 일반 어종 도감을 완성했어요!`,
              toastText: `${spotName} 도감 완성!`,
            });
          }
        }
        // 최초 대양 출항 감지 — 마을 첫 진입은 알리지 않고, travel 액션으로 visited에 world가 처음 추가될 때만 1회 안내한다
        if (action.type === 'travel' && r.state.visited.includes('world') && !prev.visited.includes('world')) {
          sendNotice(setToast, {
            kind: 'travel.firstVisit',
            text: '대양으로 처음 출항했어요! 태평양 연안에서 바다 낚시를 시작해 보세요.',
            toastText: '대양 첫 출항!',
          });
        }
        // 어군 배치 날짜 — 리듀서(서버 시계, 로컬은 클라 시계)가 정한 값으로 세션을 고정한다
        if (r.result.type === 'boot') setSchoolDay(r.result.schoolDay);
        // 그 게임 날짜의 첫 접속 — 부팅이 운세를 새로 고정했을 때만 접속 모달을 띄운다(같은 날 재접속은 띄우지 않는다)
        if (action.type === 'boot' && r.state.fortune && r.state.fortune.day !== prev.fortune?.day) {
          queueFortuneModal(r.state.fortune);
        }
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

  // 429 재시도의 대기를 끊는 신호 — 부팅과 계정 교체가 시작될 때마다 새로 만들어 앞선 대기를 버리고, 언마운트에서도 끊는다
  const retryScopeRef = useRef<AbortController | null>(null);
  const newRetryScope = (): AbortSignal => {
    retryScopeRef.current?.abort();
    retryScopeRef.current = new AbortController();
    return retryScopeRef.current.signal;
  };
  useEffect(() => () => retryScopeRef.current?.abort(), []);

  /** 서버 저장 상태 읽기 — 요청 속도 초과(429)면 기다렸다 다시 시도하고, 끝내 실패하면 network 실패로 던진다 */
  const loadSave = (signal: AbortSignal) => retryOnRateLimit(() => gameGatewayRef.current.load(), signal);

  // 접속 기록 — DAU·리텐션의 정본(events)이고, 서버는 접속한 창을 계정의 활성 창으로 삼는다.
  // 세션 시작과 계정 교체마다 보내고, 응답이 올 때까지 플레이를 열지 않는다.
  // 요청 속도 초과(429)는 기다렸다 다시 시도하고, 끝내 실패하면 던져 저장 실패 안내 창으로 알린다
  // (접속하지 못한 창의 액션은 서버가 423으로 거부하기 때문이다). 그 밖의 실패는 조용히 삼킨다:
  // 순단은 재시도 가치가 없고 fail()을 거치면 안내 창이라는 과대 반응이 따라온다. 다음 접속에 다시 실린다.
  const boot = async (signal: AbortSignal): Promise<void> => {
    try {
      await retryOnRateLimit(async () => { await dispatch({ type: 'boot', buildId: BUILD_ID }); }, signal);
    } catch (e) {
      if (signal.aborted) return;
      if (isConsentRequiredError(e) || (e instanceof AppError && e.kind === 'consent-required')) throw e;
      if (!isRetryExhausted(e)) return;
      throw e;
    }
  };

  // 부트스트랩 — 세션 게이트(직렬) → 이용약관 확인 → 서버 상태·닉네임(병렬) → 채택. 서버가 비어 있고 레거시 진행이 있으면
  // import 액션으로 수입(신뢰 채널 재사용 — 서버가 saves_current를 시딩한다).
  const runBootstrap = async (skipConsent = false): Promise<void> => {
    if (!api.auth.isConfigured) {
      const initialProfile = await readProfile();
      // 로컬 모드도 같은 리듀서로 부팅한다 — 어군 배치 날짜를 클라 시계로 같은 규칙에 따라 정한다
      await boot(newRetryScope()).catch(fail);
      const profile = initialProfile.ok && initialProfile.nickname === null
        ? await readProfile()
        : initialProfile;
      adoptProfile(profile);
      bootedRef.current = true;
      return;
    }
    activeFlowRef.current = 'boot';
    bootedRef.current = false;
    holdConsentGate();
    setLoading(true);
    const signal = newRetryScope();
    try {
      const uid = await fetchSession(client);
      if (signal.aborted) return;
      if (!uid) throw new AppError('unauthorized', 'anonymous session failed');
      if (!skipConsent) {
        const consent = await retryOnRateLimit(() => api.auth.getAccountConsent(), signal);
        if (signal.aborted) return;
        if (consent.required) {
          pendingResumeRef.current = 'boot';
          openConsentGate(consent);
          return;
        }
      }
      allowConsentGate();
      const [cloud, initialProfile, lookup] = await Promise.all([
        loadSave(signal),
        readProfile(),
        api.auth.currentAccount().catch(() => ({ status: 'failed' as const })),
      ]);
      if (signal.aborted) return;
      guestRef.current = lookup.status !== 'account';
      if (cloud) {
        setGame(cloud);
        sendNotice(setToast, {
          kind: 'boot.cloudLoaded',
          text: '저장된 진행을 불러왔어요.',
        });
      } else if (init.legacy) {
        // 구세대(localStorage) 브리지도 import 액션이므로 서버의 불러오기 허용 판정을 따른다(운영은 전면 거부).
        // 거부돼도 세션은 정상 시작한다 — 로컬 저장은 지우지 않아 수동 복구(개발자가 DB 이관)에 쓴다.
        try {
          await dispatch({ type: 'import', save: init.game });
          api.storage.clearLegacySave(); // 브리지 성공 — 로컬 저장 사용 종료
        } catch (e) {
          if (!(e instanceof AppError && e.kind === 'restricted' && !isConsentRequiredError(e))) throw e;
        }
      }
      // 세션 시작에 1회, 새로고침마다 다시 센다.
      await boot(signal);
      if (signal.aborted) return;
      bootedRef.current = true;
      const profile = initialProfile.ok && initialProfile.nickname === null
        ? await readProfile()
        : initialProfile;
      if (signal.aborted) return;
      adoptProfile(profile);
      setSync('on');
    } catch (e) {
      if (!signal.aborted) {
        setProfileStatus('error');
        fail(e);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    void runBootstrap();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 부트스트랩
  }, [init.legacy]);

  // 서버 저장 상태를 읽어 채택한다. 게이트웨이의 캐시와 버전도 읽은 상태로 맞춰진다. 저장 상태가 없으면 null이고 읽기 실패는 던진다
  const readSave = async (): Promise<GameState | null> => {
    const saved = await gameGatewayRef.current.load();
    if (saved) setGame(saved);
    return saved;
  };

  const adoptAccount = async (skipConsent = false): Promise<boolean> => {
    activeFlowRef.current = 'adopt';
    bootedRef.current = false;
    const signal = newRetryScope();
    setLoading(true);
    setProfileStatus('loading');
    setNickname(null);
    if (api.auth.isConfigured) holdConsentGate();
    try {
      if (api.auth.isConfigured && !skipConsent) {
        const consent = await retryOnRateLimit(() => api.auth.getAccountConsent(), signal);
        if (signal.aborted) return false;
        if (consent.required) {
          pendingResumeRef.current = 'adopt';
          openConsentGate(consent);
          return false;
        }
      }
      allowConsentGate();
      const [cloud, initialProfile, lookup] = await Promise.all([
        loadSave(signal),
        readProfile(),
        api.auth.currentAccount().catch(() => ({ status: 'failed' as const })),
      ]);
      if (signal.aborted) return false;
      guestRef.current = lookup.status !== 'account';
      resetFortuneModalSession();
      setGame(cloud ?? newState());
      await boot(signal);
      if (signal.aborted) return false;
      bootedRef.current = true;
      const profile = initialProfile.ok && initialProfile.nickname === null
        ? await readProfile()
        : initialProfile;
      if (signal.aborted) return false;
      adoptProfile(profile);
      return true;
    } catch (e) {
      // 더 새로운 교체가 이어받았으면 이 흐름의 결과는 버린다
      if (signal.aborted) return false;
      setProfileStatus('error');
      const isConsent = isConsentRequiredError(e) || (e instanceof AppError && e.kind === 'consent-required');
      if (isRetryExhausted(e) || isConsent) fail(e);
      if (isConsent) return false;
      throw e;
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };
  resumeFlowRef.current = flow => {
    if (flow === 'boot') void runBootstrap(true);
    else void adoptAccount(true);
  };

  const acceptConsent = async (): Promise<void> => {
    const current = consentPromptRef.current.consent;
    if (!current || consentPromptRef.current.busy) return;
    setConsentPrompt(p => ({ ...p, busy: true, error: null }));
    try {
      const res = await api.auth.acceptConsent(current.version);
      if (res.ok) {
        if (res.consent.required) {
          setConsentPrompt({ consent: res.consent, mismatch: true, error: null, busy: false });
          return;
        }
        allowConsentGate();
        setConsentPrompt({ consent: null, mismatch: false, error: null, busy: false });
        setBlocker(c => (c === 'consent' ? null : c));
        const resume = pendingResumeRef.current;
        pendingResumeRef.current = null;
        void client.invalidateQueries({ predicate: q => q.queryKey[0] !== 'session' });
        if (resume) resumeFlowRef.current(resume);
        return;
      }
      if (res.code === 'consent-version-mismatch') {
        const latest = await api.auth.getAccountConsent();
        if (!latest.required) {
          allowConsentGate();
          setConsentPrompt({ consent: null, mismatch: false, error: null, busy: false });
          setBlocker(c => (c === 'consent' ? null : c));
          const resume = pendingResumeRef.current;
          pendingResumeRef.current = null;
          void client.invalidateQueries({ predicate: q => q.queryKey[0] !== 'session' });
          if (resume) resumeFlowRef.current(resume);
          return;
        }
        setConsentPrompt({ consent: latest, mismatch: true, error: null, busy: false });
        return;
      }
      const errorMsg = res.code === 'rate-limited'
        ? '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.'
        : res.code === 'account-only'
          ? '로그인 상태를 확인한 뒤 다시 시도해 주세요.'
          : '이용약관 동의를 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      setConsentPrompt(p => ({ ...p, busy: false, error: errorMsg }));
    } catch {
      setConsentPrompt(p => ({ ...p, busy: false, error: '이용약관 동의를 처리하지 못했어요. 연결을 확인해 주세요.' }));
    }
  };

  return {
    game, dispatch, nickname, profileStatus, devTools, sync, syncLabel: SYNC_LABEL[sync], blocker, loading,
    consentPrompt, acceptConsent, retryLoadConsent: () => openConsentGate(),
    /** 이 기기의 게스트 진행 — 계정을 바꿀 때 버려지는 것이 있는지 확인 창을 띄울지 가르는 근거 */
    guestProgress: guestProgress({ sync, loading, blocked: blocker !== null, game }),
    /** 닉네임 변경 — 성공하면 표시값을 다시 읽는다. null이면 성공, 아니면 거부 사유. */
    rename: async (name: string): Promise<null | RejectReason> => {
      const r = await gameGatewayRef.current.dispatch({ type: 'setNickname', nickname: name });
      if (r.status === 'ok') {
        const next = await readProfile();
        if (next.ok) adoptProfile(next);
        else { setNickname(name); setProfileStatus('loaded'); }
        void client.invalidateQueries({ queryKey: ['ranking'] });
        void client.invalidateQueries({ queryKey: ['guild'] });
        void client.invalidateQueries({ queryKey: ['friends'] });
        void client.invalidateQueries({ queryKey: ['player'] });
        return null;
      }
      return r.error;
    },
    /**
     * 계정 교체(useAccount) — 그 계정의 서버 상태를 채택하고 이 창을 그 계정의 활성 창으로 접속시킨다.
     * 끝날 때까지 불러오는 중이다. 상태 읽기 실패는 호출자에게 던진다.
     */
    adoptAccount,
    /**
     * 액션 밖에서 서버가 바꾼 상태(길드 보너스 기부로 빠진 골드 등)를 다시 읽어 채택한다. 게이트웨이의 캐시와 버전도
     * 새로 읽은 상태로 맞춰진다. 읽기에 실패하면 그대로 둔다 — 다음 액션의 응답이 버전 차이를 보고 다시 읽는다.
     */
    resync: async (): Promise<void> => {
      await readSave().catch(() => {});
    },
    /** 개발 도구 계정 초기화 결과(state)를 즉시 반영하고 게이트웨이·프로필·조회 캐시를 동기화한다 */
    applyDevReset: async (state: GameState): Promise<void> => {
      resetFortuneModalSession();
      setGame(state);
      if (api.auth.isConfigured) {
        await readSave().catch(() => {});
      } else {
        gameGatewayRef.current = api.createGameGateway(state);
      }
      const next = await readProfile();
      adoptProfile(next);
      await client.invalidateQueries();
    },
    /** 테스트 정식 계정 승격 직후 게스트 판정과 프로필·조회 캐시를 갱신한다 */
    refreshAccountStatus: async (): Promise<void> => {
      if (api.auth.isConfigured) {
        const lookup = await api.auth.currentAccount().catch(() => ({ status: 'failed' as const }));
        guestRef.current = lookup.status !== 'account';
      }
      const next = await readProfile();
      adoptProfile(next);
      await client.invalidateQueries();
    },
    /** 캐스팅 순간 서버 함수 워밍 — 콜드 스타트를 wait 구간에 흡수 */
    warmup: () => gameGatewayRef.current.warmup?.(),
  };
}
