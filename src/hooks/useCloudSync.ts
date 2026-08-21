import { useEffect, useRef, useState } from 'react';
import { supabase, ensureSession, fetchCloudSave, pushCloudSave, saveCode } from '../backend/cloud';
import { migrate, newState } from '../game/logic';
import type { GameState } from '../game/logic';
import { SYNC_INTERVAL_MS } from '../game/balance';

// 게임 상태 소유 + 클라우드 동기화 (계층: service&state — api는 backend/cloud, 화면은 App)
// R18: 클라우드 단일 소스 — 상태는 메모리, 20초 주기(변경 시)·탭 숨김/종료 시 flush.
// 축 3(서버 권위, v0.5.0)에서 이 훅이 통째로 backend dispatch 기반으로 교체될 예정 —
// 동기화 개념 자체가 소멸한다 .

// 레거시 localStorage 세이브 — 읽기 전용 1회 브리지 (클라우드 업로드 성공 후 제거)
const LEGACY_KEY = 'pixel-fishing-save';

export type SyncState = 'off' | 'connecting' | 'on' | 'error';

const SYNC_LABEL: Record<SyncState, string | null> = {
  off: '클라우드 미설정 — 새로고침하면 사라진다 (개발 모드)',
  connecting: '클라우드 연결 중...',
  on: '클라우드 저장 켜짐',
  error: '클라우드 연결 실패 — 진행 상황이 저장되지 않는 중',
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

export function useCloudSync({ setToast }: { setToast: (m: string) => void }) {
  const [init] = useState(loadLegacy);
  const [game, setGame] = useState<GameState>(init.game);
  const [sync, setSync] = useState<SyncState>(supabase ? 'connecting' : 'off');
  const userIdRef = useRef<string | null>(null);
  const gameRef = useRef(game);
  const dirtyRef = useRef(false); // 마지막 동기화 이후 변경 여부
  useEffect(() => {
    gameRef.current = game;
    dirtyRef.current = true;
  }, [game]);

  // 레거시 이관 환영 안내 (R18b) — 오프라인 모드에서도 표시돼야 하므로 부트스트랩과 분리
  useEffect(() => {
    if (init.notice) setToast(init.notice);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);

  // 동기화 실패/거부 시 구조 안내 — 배포가 바뀌어도 낡은 탭으로 계속 플레이하는 유저 대비.
  // 진행 상황을 이사 코드로 만들어 복사해 주고, 새로고침 + 설정 탭 불러오기를 안내한다.
  // 실패 에피소드당 1회만 (20초 주기라 방치하면 alert 폭탄이 된다) — 복구되면 리셋.
  const alertedRef = useRef(false);
  const rescueAlert = async (headline: string) => {
    if (alertedRef.current) return;
    alertedRef.current = true;
    const code = saveCode(gameRef.current);
    const guide = `${headline}\n\n만약을 위해 지금까지의 진행 상황을 이사 코드로 만들어 뒀어요.\n\n복구 방법: 게임을 새로고침해 최신 버전으로 접속한 뒤,\n설정 탭 → 이사 코드 불러오기에 붙여넣으세요.`;
    try {
      await navigator.clipboard.writeText(code);
      window.alert(`${guide}\n\n(이사 코드는 클립보드에 복사되어 있어요)`);
    } catch {
      window.alert(guide);
      window.prompt('이사 코드 — 복사해서 보관하세요:', code);
    }
  };

  // P1: 접속 시 익명 로그인 → 클라우드 세이브 채택 (클라우드 = 단일 저장소)
  // 클라우드가 비어 있으면 현재 메모리(레거시 이관분 포함)를 최초 업로드
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const uid = await ensureSession();
      if (!uid) { setSync('error'); return; }
      userIdRef.current = uid;
      const cloud = await fetchCloudSave();
      if (cloud) {
        setGame(migrate(cloud.data));
        setToast('클라우드 세이브를 불러왔다.');
      } else {
        await pushCloudSave(gameRef.current);
      }
      if (init.legacy) localStorage.removeItem(LEGACY_KEY); // 브리지 완료 — 로컬 저장 사용 종료
      dirtyRef.current = false;
      setSync('on');
    })().catch(() => {
      setSync('error');
      rescueAlert('클라우드에 연결하지 못했어요 — 진행 상황이 저장되지 않아요.');
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 부트스트랩
  }, [init.legacy]);

  // R18: 주기 동기화(20s, 변경 있을 때만) + 탭 숨김/종료 시 즉시 flush
  useEffect(() => {
    if (!supabase) return;
    const push = () => {
      if (!userIdRef.current || !dirtyRef.current) return;
      dirtyRef.current = false;
      pushCloudSave(gameRef.current).then(result => {
        if (result.status === 'ok') { setSync('on'); alertedRef.current = false; return; }
        // conflict = 서버가 409를 주는 극히 예외적인 경우(구버전 함수 잔존 등) — 사유만 알리고
        // 로컬 진행을 유지한다 (v0.3.1: 서버 검증 제거로 정상 경로에선 발생하지 않는다)
        if (result.status === 'conflict') {
          setSync('error');
          rescueAlert(`저장이 서버에서 거부되었어요 (사유: ${result.reason}).`);
          dirtyRef.current = true;
          return;
        }
        dirtyRef.current = true; setSync('error'); // 실패분은 다음 주기에 재시도
        rescueAlert('클라우드 연결이 끊겨 저장이 되지 않고 있어요.');
      });
    };
    const id = setInterval(push, SYNC_INTERVAL_MS);
    const onHidden = () => { if (document.visibilityState === 'hidden') push(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', push);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', push);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회, 상태는 ref로 읽는다
  }, []);

  return { game, setGame, sync, syncLabel: SYNC_LABEL[sync], userIdRef, dirtyRef };
}
