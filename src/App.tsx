import { useEffect, useRef, useState } from 'react';
import { migrate, newState } from './logic';
import type { GameState } from './logic';
import type { FurnitureId, RegionId } from './world';
import {
  supabase, ensureSession, fetchCloudSave, pushCloudSave, saveCode,
  applyNewPassword, currentAccount,
} from './cloud';
import { SYNC_INTERVAL_MS } from './balance';
import Base from './Home';
import Field from './Field';
import Sidebar from './Sidebar';
import FacilityModal from './FacilityModal';
import { DEFAULT_TAB } from './tabs';
import type { ActionPanel, TabKey } from './tabs';

// 레거시 localStorage 세이브 — 읽기 전용 1회 브리지 (클라우드 업로드 성공 후 제거)
const LEGACY_KEY = 'pixel-fishing-save';

type SyncState = 'off' | 'connecting' | 'on' | 'error';

const SYNC_LABEL: Record<SyncState, string | null> = {
  off: '⚠️ 클라우드 미설정 — 새로고침하면 사라진다 (개발 모드)',
  connecting: '☁️ 클라우드 연결 중...',
  on: '☁️ 클라우드 저장 켜짐',
  error: '⚠️ 클라우드 연결 실패 — 진행 상황이 저장되지 않는 중',
};

// 장면: 집 ⟷ 마을 필드 ⟷ (포구, 배 필요) ⟷ 대양 필드 ⟷ 항구
type Scene = 'home' | 'village' | 'harbor' | 'ocean';
// 씬 → 소속 지역 (지역 탭·도감이 거점에서도 현재 지역 정보를 알 수 있게)
const sceneRegion = (s: Scene): RegionId => (s === 'home' || s === 'village') ? 'village' : 'ocean';

// 시스템 메시지 — 내용 휴리스틱으로 색조 분류 (보상=gold, 경고=warn)
interface Msg { id: number; ts: string; text: string; tone: 'info' | 'gold' | 'warn' }

const LOG_KEEP = 30; // 보관 상한 (표시는 최근 8개)
let msgSeq = 0;

function mkMsg(text: string): Msg {
  const tone: Msg['tone'] = /⚠️|부족하다|올바르지|없는 쿠폰/.test(text) ? 'warn'
    : /✨|🎟️|⭐|획득|구매|벌었다|해금|열렸다/.test(text) ? 'gold'
    : 'info';
  const d = new Date();
  const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { id: msgSeq++, ts, text, tone };
}

// 레거시 localStorage 세이브를 메모리로 1회 이관 (쓰기는 하지 않음)
function loadLegacy(): { game: GameState; notice: string | null; legacy: boolean } {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const game = migrate(parsed);
      const notice = parsed?.v !== 4 && game.fame > 0
        ? `업데이트! 그동안 잡은 물고기가 명성으로 소급 인정되었다. ⭐${game.fame}`
        : null;
      return { game, notice, legacy: true };
    }
  } catch { /* 손상된 저장 데이터는 무시하고 새로 시작 */ }
  return { game: newState(), notice: null, legacy: false };
}

export default function App() {
  const [init] = useState(loadLegacy);
  const [game, setGame] = useState<GameState>(init.game);
  const [scene, setScene] = useState<Scene>('home');
  // 시스템 메시지 로그 — MMO 채팅창처럼 흘러가는 기록 (좌하단 오버레이)
  const [log, setLog] = useState<Msg[]>(() => {
    const first = [mkMsg('집이다. 가구를 클릭해 정비하고, 문으로 나가 마을 물가에서 낚시하자.')];
    if (init.notice) first.push(mkMsg(init.notice));
    return first;
  });
  const setToast = (text: string) =>
    setLog(l => [...l.slice(-(LOG_KEEP - 1)), mkMsg(text)]);
  const [sync, setSync] = useState<SyncState>(supabase ? 'connecting' : 'off');
  const userIdRef = useRef<string | null>(null);
  const gameRef = useRef(game);
  const dirtyRef = useRef(false); // 마지막 동기화 이후 변경 여부
  useEffect(() => {
    gameRef.current = game;
    dirtyRef.current = true;
  }, [game]);

  // 우측 사이드바 상태 — 탭은 씬 무관 5개 고정, 씬이 바뀌면 열린 시설 패널만 닫는다
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);

  const go = (s: Scene, msg: string) => { setScene(s); setToast(msg); setActionPanel(null); };

  // 미니맵 클릭 → 지역 탭 열기 (M 키 트리거는 폐지)
  // TODO: 월드맵 화면(지역 간 이동/전체 지구 조망)이 생기면 미니맵 클릭은 그쪽으로 연결한다.
  const onOpenMap = () => setActiveTab('region');

  // 거점 시설 클릭(캔버스) — 정비 시설은 사이드바 패널, 도감은 탭 전환, 문/여객선은 장면 이동
  const facilityHandler = (goFieldFn: () => void, goTravelFn?: () => void) =>
    (id: FurnitureId) => {
      switch (id) {
        case 'sell': case 'rod': case 'boat':
          setActionPanel(p => (p === id ? null : id));
          return;
        case 'dex':
          setActionPanel(null);
          setActiveTab('dex');
          return;
        case 'exit':
          goFieldFn();
          return;
        case 'travel':
          goTravelFn?.();
          return;
      }
    };

  // 동기화 실패/거부 시 구조 안내 — 배포가 바뀌어도 낡은 탭으로 계속 플레이하는 유저 대비.
  // 진행 상황을 이사 코드로 만들어 복사해 주고, 새로고침 + 설정 탭 불러오기를 안내한다.
  // 실패 에피소드당 1회만 (20초 주기라 방치하면 alert 폭탄이 된다) — 복구되면 리셋.
  const alertedRef = useRef(false);
  const rescueAlert = async (headline: string) => {
    if (alertedRef.current) return;
    alertedRef.current = true;
    const code = saveCode(gameRef.current);
    const guide = `${headline}\n\n만약을 위해 지금까지의 진행 상황을 이사 코드로 만들어 뒀어요.\n\n복구 방법: 게임을 새로고침해 최신 버전으로 접속한 뒤,\n설정 탭 → 📥 이사 코드 불러오기에 붙여넣으세요.`;
    try {
      await navigator.clipboard.writeText(code);
      window.alert(`${guide}\n\n(이사 코드는 클립보드에 복사되어 있어요)`);
    } catch {
      window.alert(guide);
      window.prompt('이사 코드 — 복사해서 보관하세요:', code);
    }
  };

  // ---------- 계정 (v0.4.0) ----------
  const [account, setAccount] = useState<string | null>(null);

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
        setToast('☁️ 클라우드 세이브를 불러왔다.');
      } else {
        await pushCloudSave(gameRef.current);
      }
      if (init.legacy) localStorage.removeItem(LEGACY_KEY); // 브리지 완료 — 로컬 저장 사용 종료
      dirtyRef.current = false;
      setSync('on');
      setAccount(await currentAccount()); // 영구 계정이면 이메일 표시 (게스트면 null)
    })().catch(() => {
      setSync('error');
      rescueAlert('⚠️ 클라우드에 연결하지 못했어요 — 진행 상황이 저장되지 않아요.');
    });
  }, [init.legacy]);

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
      setToast('☁️ 계정의 클라우드 세이브를 불러왔다.');
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
        setToast(r.ok ? '🔑 비밀번호가 변경되었다.' : `⚠️ 비밀번호 변경 실패: ${r.msg}`));
    });
    return () => subscription.unsubscribe();
  }, []);

  // 로그인 유도 넛지 — 명성 ⭐500 도달 시 1회 (게스트만). 세이브 필드 대신 localStorage 1키.
  useEffect(() => {
    if (!supabase || account || game.fame < 500) return;
    if (localStorage.getItem('pf-account-nudged')) return;
    localStorage.setItem('pf-account-nudged', '1');
    // oxlint-disable-next-line react/set-state-in-effect -- 명성이 문턱을 넘는 "순간"에 1회만 쏘는 알림이라 이벤트 지점이 따로 없다
    setToast('⭐ 명성 500 달성! 진행을 지키려면 설정 탭에서 계정을 만들어 두세요.');
  }, [game.fame, account]);

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
          rescueAlert(`⚠️ 저장이 서버에서 거부되었어요 (사유: ${result.reason}).`);
          dirtyRef.current = true;
          return;
        }
        dirtyRef.current = true; setSync('error'); // 실패분은 다음 주기에 재시도
        rescueAlert('⚠️ 클라우드 연결이 끊겨 저장이 되지 않고 있어요.');
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
  }, []);

  const currentFacility =
    scene === 'home' ? facilityHandler(() => go('village', '마을이다. 물가 군집에서 낚시하자.')) :
    scene === 'harbor' ? facilityHandler(
      () => go('ocean', '출항! 군집 위에서 스페이스로 캐스팅.'),
      () => go('village', '여객선을 타고 마을로 돌아왔다.')) :
    undefined;

  return (
    <div className="app">
      <div className="layout">
        {/* 좌: 게임 스테이지 — 크기는 .game-frame이 결정, 캔버스·오버레이·모달은 프레임 기준 */}
        <div className="stage">
          <div className="game-frame">
            {scene === 'home' && <Base base="home" game={game} onFacility={currentFacility} />}
            {scene === 'village' && (
              <Field region="village" game={game} setGame={setGame} setToast={setToast}
                     goBase={() => go('home', '집이다. 시설을 눌러 정비하자.')}
                     goTravel={() => go('ocean', '대양으로 출항! 태평양 군집을 찾아 항해하자.')}
                     onOpenMap={onOpenMap}
                     onShop={() => setActionPanel(p => (p === 'boat' ? p : 'boat'))} />
            )}
            {scene === 'harbor' && <Base base="harbor" game={game} onFacility={currentFacility} />}
            {scene === 'ocean' && (
              <Field region="ocean" game={game} setGame={setGame} setToast={setToast}
                     goBase={() => go('harbor', '항구에 접안했다. 시설을 눌러 정비하자.')}
                     onOpenMap={onOpenMap} />
            )}

            {/* 시스템 메시지 로그 — 게임 영역 좌하단 (미래 v0.7 실시간 채팅 자리) */}
            <div className="msglog" role="status" aria-live="polite">
              {log.slice(-8).map((m, i, arr) => (
                <div key={m.id} className={`msg msg-${m.tone}`}
                     style={{ opacity: 0.4 + 0.6 * ((i + 1) / arr.length) }}>
                  <span className="msg-ts">{m.ts}</span> {m.text}
                </div>
              ))}
            </div>

            {/* 정비 모달 — 판매/강화/배 (정비 중엔 이동하지 않으므로 게임 영역을 점유해도 자연스럽다) */}
            {actionPanel && (
              <FacilityModal panel={actionPanel} game={game} setGame={setGame}
                             setToast={setToast} onClose={() => setActionPanel(null)} />
            )}
          </div>
        </div>

        <Sidebar
          region={sceneRegion(scene)}
          activeTab={activeTab} setActiveTab={setActiveTab}
          game={game} setGame={setGame} setToast={setToast}
          syncLabel={SYNC_LABEL[sync]} syncState={sync}
          account={account} onAuthChanged={onAuthChanged}
        />
      </div>
    </div>
  );
}
