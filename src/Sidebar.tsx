import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOATS, COUPONS, FISH, RARITY, SPOTS,
  canFishSpot, migrate, redeemCoupon, sellableValue, toggleLock,
} from './logic';
import type { Fish, GameState, RarityId } from './logic';
import { fetchCoupon } from './cloud';
import { REGION_INFO } from './data/regions';
import type { RegionId } from './world';
import { drawFishSprite } from './pixel';
import HelpPanel from './HelpPanel';
import PatchNotesPanel from './PatchNotesPanel';
import AdminPanel from './AdminPanel';
import Panel from './ui/Panel';
import Button from './ui/Button';
import TabBar from './ui/TabBar';
import { RarityText, RarityDot } from './ui/RarityTag';
import type { TabKey } from './tabs';

// 탭은 씬과 무관하게 항상 동일한 5개 (일관성 우선)
const TABS: { key: TabKey; label: string }[] = [
  { key: 'region', label: '지역' },
  { key: 'bag', label: '가방' },
  { key: 'dex', label: '도감' },
  { key: 'help', label: '도움말' },
  { key: 'settings', label: '설정' },
];

// 등급 오름차순(일반 → 전설) 정렬용
const RARITY_ORDER: RarityId[] = ['common', 'rare', 'epic', 'legendary'];
const rarityRank = (r: RarityId) => RARITY_ORDER.indexOf(r);

interface SidebarProps {
  /** 현재 지역 — 거점 포함 모든 씬에서 전달된다 (집=마을, 항구=대양) */
  region: RegionId;
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (msg: string) => void;
  syncLabel: string | null;
  syncState: string;
}

// 우측 사이드바 — 상단 탭바 + 남은 공간을 채우는 탭 콘텐츠 
// 시설 패널(판매/강화/배)은 여기 소관이 아니다 — 게임 스테이지 모달(FacilityModal)로 뜬다.
export default function Sidebar(props: SidebarProps) {
  const { activeTab, setActiveTab, game } = props;

  return (
    <aside className="sidebar">
      <TabBar tabs={TABS} activeKey={activeTab} onSelect={setActiveTab} />
      <div className="side-panel">
        {activeTab === 'region' && <RegionTab {...props} />}
        {activeTab === 'bag' && <BagTab {...props} />}
        {activeTab === 'dex' && <DexTab game={game} region={props.region} />}
        {activeTab === 'help' && <HelpPanel />}
        {activeTab === 'settings' && <SettingsTab {...props} />}
      </div>
    </aside>
  );
}


// ---------- 지역 탭 — 현재 지역의 로어·수역 정보·서식 어종·등급 확률 (몰입 요소) ----------

function RegionTab({ region, game }: SidebarProps) {
  const info = REGION_INFO[region];
  const spots = SPOTS.filter(s => s.region === region);

  return (
    <div className="region-tab">
      <Panel title={`${info.icon} ${info.name}`}>
        <p className="region-tagline">{info.tagline}</p>
        <p className="region-lore">{info.lore}</p>
      </Panel>

      <h4>이 지역의 수역</h4>
      {spots.map(s => {
        const open = canFishSpot(game, s.id);
        const fishes = FISH.filter(f => f.spot === s.id)
          .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
        return (
          <div key={s.id} className="region-spot" data-open={open}>
            <div className="region-spot-head">
              <b>{s.name}</b>
              <span className={`spot-state ${open ? 'ok' : 'lock'}`}>
                {open ? '낚시 가능'
                  : `🔒 ${BOATS[s.boatTier - 1].name}(${s.boatTier}단계) 필요`}
              </span>
            </div>
            <div className="region-fish-list">
              {fishes.map(f => {
                const caught = (game.caught[f.id] ?? 0) > 0;
                // 미획득은 ??? + 등급 점만 — 정보는 주되 신비로움 유지 (도감 스포일러 규칙과 일관)
                return (
                  <span key={f.id} className="region-fish" data-caught={caught}>
                    <RarityDot rarity={f.rarity} />
                    {caught ? f.name : '???'}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <h4>이 지역의 등급 확률</h4>
      <table className="pf-compare">
        <thead><tr><th>등급</th><th>가중치</th><th>명성 ⭐</th></tr></thead>
        <tbody>
          {RARITY_ORDER.map(id => (
            <tr key={id}>
              <td><RarityText rarity={id} /></td>
              <td className="pf-accent">{RARITY[id].weight}</td>
              <td className="pf-accent">+{RARITY[id].fame}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="panel-note">PERFECT 판정은 희귀 이상 확률을 높여요. 방치는 흔한 물고기가 잘 나와요.</p>

      <h4>여기서 할 수 있는 것</h4>
      <ul className="help-list">
        {info.tips.map((t, i) => <li key={i}>{t}</li>)}
      </ul>

      <h4>조작</h4>
      <ul className="help-list">
        {info.controls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </div>
  );
}

// ---------- 가방 탭 — 조회 + 어종 잠금 (판매는 거점 정비에서) ----------

// 가방 행 왼쪽의 작은 어종 썸네일 (잡은 어종이므로 항상 실색)
function FishThumb({ fish }: { fish: Fish }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.clearRect(0, 0, 30, 16);
    drawFishSprite(ctx, 15, 8, fish.color, 1, true);
  }, [fish]);
  return <canvas ref={ref} width={30} height={16} className="bag-thumb" aria-hidden="true" />;
}

function BagTab({ game, setGame, setToast }: SidebarProps) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of game.bag) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, n]) => ({ fish: FISH.find(f => f.id === id)!, n }))
      .sort((a, b) => rarityRank(a.fish.rarity) - rarityRank(b.fish.rarity));
  }, [game.bag]);
  const total = sellableValue(game);

  return (
    <div className="bag-tab">
      <h3>가방 (<span className="pf-accent">{game.bag.length}</span>마리)</h3>
      {rows.length === 0 ? (
        <p className="panel-note">가방이 비어 있다. 물고기 군집을 찾아 낚시하자.</p>
      ) : (
        <>
          <table className="pf-compare">
            <thead><tr><th>어종</th><th>수량</th><th>값어치</th><th>잠금</th></tr></thead>
            <tbody>
              {rows.map(({ fish, n }) => {
                const locked = game.locked.includes(fish.id);
                return (
                  <tr key={fish.id} className={locked ? 'row-locked' : ''}>
                    <td className="bag-name">
                      <FishThumb fish={fish} />
                      <span><RarityDot rarity={fish.rarity} />{fish.name}</span>
                    </td>
                    <td>×{n}</td>
                    <td className="pf-accent">{fish.price * n}G</td>
                    <td>
                      <button className="lock-toggle" data-locked={locked}
                        aria-label={`${fish.name} ${locked ? '잠금 해제' : '잠금'}`}
                        onClick={() => {
                          setGame(toggleLock(game, fish.id));
                          setToast(locked
                            ? `${fish.name} 잠금 해제 — 다시 판매 대상이 된다.`
                            : `🔒 ${fish.name} 잠금 — 전부 판매에서 제외된다.`);
                        }}>
                        {locked ? '🔒' : '🔓'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="panel-note">
            판매 가능 <span className="pf-accent">{total}G</span> · 판매는 집 궤짝/항구 어시장에서.
            🔒 잠근 어종은 전부 판매에서 빠져요.
          </p>
        </>
      )}
    </div>
  );
}

// ---------- 도감 탭 — 지역 서브탭 → 수역 섹션, 수역 안은 등급 오름차순 ----------
// 계층(도감>지역>수역>어종)이 깊어서 지역을 "서브탭"으로 눌러 평평하게 편다.
// 지역이 늘면 REGION_INFO 행 추가 = 서브탭 자동 추가.

function FishIcon({ fish, caught }: { fish: Fish; caught: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.clearRect(0, 0, 84, 44);
    drawFishSprite(ctx, 42, 22, caught ? fish.color : '#22314a', 3, caught);
  }, [fish, caught]);
  return <canvas ref={ref} width={84} height={44} className="dex-fish"
                 aria-label={caught ? fish.name : '미확인 어종'} />;
}

function DexTab({ game, region }: { game: GameState; region: RegionId }) {
  const dexCount = FISH.filter(f => (game.caught[f.id] ?? 0) > 0).length;
  const [sub, setSub] = useState<RegionId>(region); // 기본 = 지금 있는 지역
  const regions = Object.values(REGION_INFO);
  const spots = SPOTS.filter(s => s.region === sub);

  return (
    <div className="dex-tab">
      <h3>도감 (<span className="pf-accent">{dexCount}/{FISH.length}</span>)</h3>
      <div className="dex-subtabs">
        {regions.map(info => {
          const regionFish = FISH.filter(f => SPOTS.some(s => s.region === info.id && s.id === f.spot));
          const caught = regionFish.filter(f => (game.caught[f.id] ?? 0) > 0).length;
          return (
            <button key={info.id} className={sub === info.id ? 'active' : ''}
                    onClick={() => setSub(info.id)}>
              {info.icon} {info.shortName}
              <span className="cnt"> {caught}/{regionFish.length}</span>
            </button>
          );
        })}
      </div>
      {spots.map(s => {
        const fishes = FISH.filter(f => f.spot === s.id)
          .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
        return (
          <div key={s.id} className="dex-spot">
            <h4>{s.name}</h4>
            <div className="dex-grid">
              {fishes.map(f => {
                const n = game.caught[f.id] ?? 0;
                // 등급은 테두리(알파25%)와 등급 점으로만 — 미획득 카드도 티어는 알 수 있게
                return (
                  <div key={f.id} className="dex-item" data-caught={n > 0} data-rarity={f.rarity}>
                    <FishIcon fish={f} caught={n > 0} />
                    {n > 0 ? (
                      <>
                        <b>{f.name}</b><br />
                        <RarityText rarity={f.rarity} /> · <span className="pf-accent">{f.price}G</span><br />
                        <span className="cnt">{n}마리 잡음</span>
                      </>
                    ) : (
                      <>
                        <b>???</b><br />
                        <span className="cnt"><RarityDot rarity={f.rarity} />미확인</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 설정 탭 — 동기화 상태 / 데이터 관리 / 패치노트 / 관리자 / 버전 ----------

function SettingsTab({ game, setGame, setToast, syncLabel, syncState }: SidebarProps) {
  const exportSave = async () => {
    const code = btoa(encodeURIComponent(JSON.stringify(game)));
    try {
      await navigator.clipboard.writeText(code);
      setToast('이사 코드를 클립보드에 복사했다. 다른 브라우저에서 불러오기.');
    } catch {
      window.prompt('복사해서 보관하세요 (이사 코드):', code);
    }
  };

  const importSave = () => {
    const code = window.prompt('이사 코드를 붙여넣으세요:');
    if (!code) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(atob(code.trim())));
      setGame(migrate(parsed));
      setToast('세이브를 불러왔다!');
    } catch {
      setToast('이사 코드가 올바르지 않다.');
    }
  };

  const enterCoupon = async () => {
    const code = window.prompt('쿠폰 코드를 입력하세요:');
    if (!code) return;
    const trimmed = code.trim();
    const dynamic = COUPONS[trimmed] ? undefined : await fetchCoupon(trimmed);
    const res = redeemCoupon(game, code, dynamic ? { [trimmed]: dynamic } : {});
    if (!res.ok) {
      setToast(res.reason === 'used' ? '이미 사용한 쿠폰이다.' : '없는 쿠폰 코드다.');
      return;
    }
    setGame(res.state);
    setToast(`🎟️ 쿠폰 사용! +${res.reward.gold}G — ${res.reward.desc}`);
  };

  return (
    <div className="settings-tab">
      {syncLabel && <div className="sync" data-sync={syncState}>{syncLabel}</div>}

      <h4>데이터 관리</h4>
      <div className="settings-actions">
        <Button onClick={exportSave}>📤 이사 코드 내보내기</Button>
        <Button onClick={importSave}>📥 이사 코드 불러오기</Button>
        <Button onClick={enterCoupon}>🎟️ 쿠폰 입력</Button>
      </div>

      <AdminPanel />
      <PatchNotesPanel />

      <div className="version-label">v{__APP_VERSION__}</div>
    </div>
  );
}
