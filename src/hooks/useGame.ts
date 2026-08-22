import { useEffect, useRef, useState } from 'react';
import { supabase, ensureSession, saveCode } from '../backend/auth';
import { HttpBackend } from '../backend/http';
import { LocalBackend } from '../backend/local';
import { when } from '../backend/types';
import type { Backend, DispatchResult, MaybePromise } from '../backend/types';
import type { GameAction } from '../game/actions';
import { migrate, newState } from '../game/logic';
import type { GameState } from '../game/logic';
import { reportIssue } from '../observability';

// 게임 상태 소유 + 백엔드 디스패치 (계층: service&state — 서버 권위 v0.5.0)
// 모든 상태 변경은 dispatch(action) 하나로 흐른다: 온라인 = /api/action(서버가 규칙 실행),
// 오프라인 dev = LocalBackend(같은 리듀서를 로컬 실행). 구 20초 동기화 루프·dirty 플래그·
// beforeunload flush는 소멸 — "액션이 곧 저장"이라 동기화 개념 자체가 없다.

// 레거시 localStorage 세이브 — 읽기 전용 1회 브리지 (서버 수입(import 액션) 후 제거)
const LEGACY_KEY = 'pixel-fishing-save';

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
  // 백엔드는 세션 수명 동안 하나 — 오프라인이면 레거시(또는 새 시작) 상태로 시딩
  const backendRef = useRef<Backend>(null!);
  if (!backendRef.current) {
    backendRef.current = supabase ? new HttpBackend() : new LocalBackend(init.game);
  }
  const [game, setGame] = useState<GameState>(init.game);
  const [sync, setSync] = useState<SyncState>(supabase ? 'connecting' : 'off');
  // 배포 후 새로고침 안 한 낡은 탭 (서버 426) — true면 App이 업데이트 모달로 전체를 덮는다
  const [outdated, setOutdated] = useState(false);
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  // 레거시 이관 환영 안내 (R18b) — 오프라인 모드에서도 표시돼야 하므로 부트스트랩과 분리
  useEffect(() => {
    if (init.notice) setToast(init.notice);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);

  // 액션 실패 시 구조 안내 — 진행 상황을 이사 코드로 만들어 복사해 주고 복구를 안내한다.
  // 실패 에피소드당 1회만 — 복구(액션 성공)되면 리셋.
  const alertedRef = useRef(false);
  const rescueAlert = async (headline: string) => {
    if (alertedRef.current) return;
    alertedRef.current = true;
    const code = saveCode(gameRef.current);
    const guide = `${headline}\n\n만약을 위해 지금까지의 진행 상황을 이사 코드로 만들어 뒀어요.\n\n복구 방법: 게임을 새로고침해 다시 접속한 뒤,\n설정 탭 → 이사 코드 불러오기에 붙여넣으세요.`;
    try {
      await navigator.clipboard.writeText(code);
      window.alert(`${guide}\n\n(이사 코드는 클립보드에 복사되어 있어요)`);
    } catch {
      window.alert(guide);
      window.prompt('이사 코드 — 복사해서 보관하세요:', code);
    }
  };

  /** 모든 상태 변경의 단일 진입점 — ok면 서버(또는 로컬 리듀서)가 계산한 상태를 채택 */
  const dispatch = (action: GameAction): MaybePromise<DispatchResult> =>
    when(backendRef.current.dispatch(action), r => {
      if (r.status === 'ok') {
        setGame(r.state);
        if (supabase) { setSync('on'); alertedRef.current = false; }
      } else if (r.status === 'outdated') {
        // 진행은 서버에 안전 — rescue 불필요, 업데이트 모달만 (이번 액션 하나는 저장 안 됨)
        setOutdated(true);
        // 배포 후 낡은 탭이 얼마나 오래 남아 있는지 = 다음 배포 공지 타이밍의 근거
        reportIssue('client outdated (426)', 'warning', { action: action.type });
      } else if (r.status === 'error') {
        setSync(supabase ? 'error' : 'off');
        // 저장 실패는 예외를 던지지 않는다 — 명시적으로 보고하지 않으면 영원히 안 보인다
        reportIssue('dispatch failed — 진행 미저장', 'error', { action: action.type });
        rescueAlert('서버에 연결하지 못해 이번 행동이 저장되지 않았어요.');
      }
      // rejected는 규칙 거부 — 호출자가 사유 토스트를 띄운다 (연결은 정상이므로 sync 유지)
      return r;
    });

  // 부트스트랩 — 익명 로그인 → 서버 상태 채택. 서버가 비어 있고 레거시 진행이 있으면
  // import 액션으로 수입(신뢰 채널 재사용 — 서버가 saves_current를 시딩한다).
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const uid = await ensureSession();
      if (!uid) { setSync('error'); return; }
      const cloud = await backendRef.current.load();
      if (cloud) {
        setGame(cloud);
        setToast('클라우드 세이브를 불러왔다.');
      } else if (init.legacy) {
        await dispatch({ type: 'import', save: init.game });
      }
      if (init.legacy) localStorage.removeItem(LEGACY_KEY); // 브리지 완료 — 로컬 저장 사용 종료
      setSync('on');
    })().catch((e: unknown) => {
      setSync('error');
      reportIssue('bootstrap failed — 클라우드 연결 실패', 'error', { cause: String(e) });
      rescueAlert('클라우드에 연결하지 못했어요 — 진행 상황이 저장되지 않아요.');
    });
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
