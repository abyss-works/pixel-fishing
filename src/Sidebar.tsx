import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOATS, COUPONS, FISH, RARITY, SPOTS,
  canFishSpot, entryFish, entryPrice, migrate, parseBagEntry, priceOf, redeemCoupon,
  sellableValue, sizeParams, sizePercentile, toggleLock, variantDiscovered,
} from './logic';
import type { Fish, GameState, RarityId } from './logic';
import {
  fetchCoupon, saveCode, supabase,
  requestPasswordReset, signInWithEmail, signOutAccount, signUpWithEmail,
} from './cloud';
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
// 도감 탭만 라벨이 동적 — 활성 상태에서 한 번 더 누르면 일반↔돌연변이 보기 전환
const tabsFor = (dexView: DexView): { key: TabKey; label: string }[] => [
  { key: 'region', label: '지역' },
  { key: 'bag', label: '가방' },
  { key: 'dex', label: dexView === 'base' ? '도감\n(일반)' : '도감\n(돌연변이)' },
  { key: 'help', label: '도움말' },
  { key: 'settings', label: '설정' },
];

type DexView = 'base' | 'variant';

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
  /** 로그인된 영구 계정 이메일 (게스트면 null) — v0.4.0 */
  account: string | null;
  /** 가입/로그인/로그아웃 직후 App이 계정 표시·세이브를 갱신하는 콜백 */
  onAuthChanged: () => Promise<void>;
}

// 우측 사이드바 — 상단 탭바 + 남은 공간을 채우는 탭 콘텐츠 
// 시설 패널(판매/강화/배)은 여기 소관이 아니다 — 게임 스테이지 모달(FacilityModal)로 뜬다.
export default function Sidebar(props: SidebarProps) {
  const { activeTab, setActiveTab, game } = props;
  const [dexView, setDexView] = useState<DexView>('base');

  // 활성 도감 탭을 한 번 더 누르면 일반↔돌연변이 전환
  const onSelect = (t: TabKey) => {
    if (t === 'dex' && activeTab === 'dex') setDexView(v => (v === 'base' ? 'variant' : 'base'));
    setActiveTab(t);
  };

  return (
    <aside className="sidebar">
      <TabBar tabs={tabsFor(dexView)} activeKey={activeTab} onSelect={onSelect} />
      <div className="side-panel">
        {activeTab === 'region' && <RegionTab {...props} />}
        {activeTab === 'bag' && <BagTab {...props} />}
        {activeTab === 'dex' && <DexTab game={game} region={props.region} view={dexView} />}
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

// 가방 행 왼쪽의 작은 어종 썸네일 (잡은 어종이므로 항상 실색, 변이는 변이 색)
function FishThumb({ fish, mutated = false }: { fish: Fish; mutated?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.clearRect(0, 0, 30, 16);
    drawFishSprite(ctx, 15, 8, fish.shape, mutated ? fish.variant.color : fish.color, 1, true);
  }, [fish, mutated]);
  return <canvas ref={ref} width={30} height={16} className="bag-thumb" aria-hidden="true" />;
}

function BagTab({ game, setGame, setToast }: SidebarProps) {
  // 엔트리 단위 그룹 — 'carp'(일반)와 'carp*'(변이)는 별개 행 (v0.3.3)
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of game.bag) counts.set(e, (counts.get(e) ?? 0) + 1);
    return [...counts.entries()]
      .map(([entry, n]) => {
        const { mutated } = parseBagEntry(entry);
        return { entry, mutated, fish: entryFish(entry)!, n };
      })
      .sort((a, b) => rarityRank(a.fish.rarity) - rarityRank(b.fish.rarity)
        || Number(a.mutated) - Number(b.mutated));
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
              {rows.map(({ entry, mutated, fish, n }) => {
                const locked = game.locked.includes(fish.id);
                return (
                  <tr key={entry} className={locked ? 'row-locked' : ''}>
                    <td className="bag-name">
                      <FishThumb fish={fish} mutated={mutated} />
                      <span><RarityDot rarity={fish.rarity} />{mutated ? fish.variant.name : fish.name}</span>
                    </td>
                    <td>×{n}</td>
                    <td className="pf-accent">{entryPrice(entry) * n}G</td>
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

// variant=true면 변이 색으로 그린다 (도감 변이 보기)
function FishIcon({ fish, caught, variant = false }: { fish: Fish; caught: boolean; variant?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    const color = variant ? fish.variant.color : fish.color;
    ctx.clearRect(0, 0, 84, 44);
    drawFishSprite(ctx, 42, 22, fish.shape, caught ? color : '#22314a', 3, caught);
  }, [fish, caught, variant]);
  return <canvas ref={ref} width={84} height={44} className="dex-fish"
                 aria-label={caught ? (variant ? fish.variant.name : fish.name) : '미확인 어종'} />;
}

// 도감 상세보기 상단 — 큰 스프라이트, 화살표로 기본형↔변이 전환 (미발견 변이는 ???)
function DexPortrait({ fish, discovered, color }: { fish: Fish; discovered: boolean; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.clearRect(0, 0, 240, 140);
    drawFishSprite(ctx, 120, 70, fish.shape, discovered ? color : '#22314a', 6, discovered);
  }, [fish, discovered, color]);
  return <canvas ref={ref} width={240} height={140} className="dex-detail-portrait"
                 aria-label={discovered ? fish.name : '미확인 변종'} />;
}

// 도감 상세보기 — 위(초상화, 좌우 화살표로 기본형/변이 전환) + 아래(정보) 2단 구성.
// 변이는 "종만 같고 다른 개체" (v0.3.3): 폼을 전환하면 이름/로어/가격/마릿수/크기/첫 조우일이
// 전부 그 폼의 것으로 바뀐다. 등급·형태·크기 분포만 종에 종속.
function DexDetail({ fish, game, initialForm = 0, onClose }: {
  fish: Fish; game: GameState; initialForm?: number; onClose: () => void;
}) {
  const id = fish.id;
  const varN = game.variantCaught[id] ?? 0;
  // forms[0] = 기본형 · forms[1+] = 변이(발견해야 정보 공개). 배열인 이유: 변이가 늘어도
  // 화살표 로직 그대로. 크기 폴백 = 분포 평균(상위 50%) — 구세이브(기록 없음) 대응.
  const forms = [
    {
      name: fish.name, color: fish.color, lore: fish.lore, mutated: false,
      discovered: (game.caught[id] ?? 0) - varN > 0, // 일반 폼을 잡아야 공개 (변이만 잡았으면 ???)
      count: (game.caught[id] ?? 0) - varN,
      maxSize: game.maxSize[id] ?? sizeParams(fish).mean,
      firstCaught: game.firstCaught[id],
    },
    {
      name: fish.variant.name, color: fish.variant.color, lore: fish.variant.lore, mutated: true,
      discovered: varN > 0,
      count: varN,
      maxSize: game.variantMaxSize[id] ?? sizeParams(fish).mean,
      firstCaught: game.variantFirstCaught[id],
    },
  ];
  const [i, setI] = useState(initialForm);
  const form = forms[i];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal dex-detail" onClick={e => e.stopPropagation()}>
        <div className="dex-detail-top">
          <button className="dex-detail-arrow" aria-label="이전 형태"
                  onClick={() => setI((i - 1 + forms.length) % forms.length)}>◀</button>
          <div>
            <DexPortrait fish={fish} discovered={form.discovered} color={form.color} />
            <p className="dex-detail-caption">{form.discovered ? form.name : '???'}</p>
          </div>
          <button className="dex-detail-arrow" aria-label="다음 형태"
                  onClick={() => setI((i + 1) % forms.length)}>▶</button>
        </div>

        <div className="dex-detail-bottom">
          {/* 미발견 폼도 같은 구조로 렌더 (값만 ??? 마스킹) — 폼 전환 시 레이아웃 점프 방지 */}
          <h3>{form.discovered ? form.name : '???'}{' '}
            <RarityDot rarity={fish.rarity} /><RarityText rarity={fish.rarity} /></h3>
          <p className="dex-detail-lore">
            {form.discovered ? form.lore : '…아직 만나지 못한 개체다. 어딘가에서 헤엄치고 있을 것이다.'}
          </p>
          <div className="dex-detail-info">
            <span className="k">가격</span>
            <span className="pf-accent">{form.discovered ? `${priceOf(fish, form.mutated)}G` : '???'}</span>
            <span className="k">잡은 수</span>
            <span>{form.discovered ? `${form.count}마리` : '???'}</span>
            <span className="k">최대 크기</span>
            <span>{form.discovered
              ? <>{form.maxSize.toFixed(1)}cm <span className="cnt">(상위 {sizePercentile(fish, form.maxSize)}%)</span></>
              : '???'}</span>
            <span className="k">처음 만난 날</span>
            <span>{form.discovered ? (form.firstCaught ?? '알 수 없음') : '???'}</span>
          </div>
          <Button onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}

// 도감은 포함관계: 전체 = 기본 어종 + 변이 (슬롯 2×종수).
// 보기 전환(일반↔돌연변이)은 활성 도감 탭 재클릭 — view는 Sidebar가 들고 온다.
function DexTab({ game, region, view }: { game: GameState; region: RegionId; view: DexView }) {
  // 폼별 발견 기준 — 변이는 별개 개체라 변이만 잡은 종은 기본 도감에서 여전히 ??? (v0.3.3)
  const baseCaught = (f: Fish) => (game.caught[f.id] ?? 0) - (game.variantCaught[f.id] ?? 0);
  const baseCount = FISH.filter(f => baseCaught(f) > 0).length;
  const varCount = FISH.filter(f => variantDiscovered(game, f.id)).length;
  const [sub, setSub] = useState<RegionId>(region); // 기본 = 지금 있는 지역
  const [detail, setDetail] = useState<Fish | null>(null);
  const regions = Object.values(REGION_INFO);
  const spots = SPOTS.filter(s => s.region === sub);
  const found = (f: Fish) => // 현재 보기에서 이 카드가 "발견됨"인가
    view === 'base' ? baseCaught(f) > 0 : variantDiscovered(game, f.id);

  return (
    <div className="dex-tab">
      <h3>
        {view === 'base' ? '🐟 일반' : '🌈 돌연변이'}
        {' ('}<span className="pf-accent">
          {view === 'base' ? baseCount : varCount}/{FISH.length}
        </span>{')'}
      </h3>
      <div className="dex-subtabs">
        {regions.map(info => {
          const regionFish = FISH.filter(f => SPOTS.some(s => s.region === info.id && s.id === f.spot));
          const caught = regionFish.filter(found).length;
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
                const ok = found(f);
                const n = game.caught[f.id] ?? 0;
                // 등급은 테두리(알파25%)와 등급 점으로만 — 미획득 카드도 티어는 알 수 있게
                return (
                  <div key={f.id} className="dex-item" data-caught={ok} data-rarity={f.rarity}
                       role={ok ? 'button' : undefined} tabIndex={ok ? 0 : undefined}
                       onClick={ok ? () => setDetail(f) : undefined}>
                    <FishIcon fish={f} caught={ok} variant={view === 'variant'} />
                    {ok ? (
                      <>
                        <b>{view === 'variant' ? f.variant.name : f.name}</b><br />
                        <RarityText rarity={f.rarity} /> · <span className="pf-accent">{priceOf(f, view === 'variant')}G</span><br />
                        <span className="cnt">
                          {view === 'variant'
                            ? `${game.variantCaught[f.id] ?? 0}마리 잡음`
                            : `${n - (game.variantCaught[f.id] ?? 0)}마리 잡음`}
                        </span>
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
      {detail && (
        <DexDetail key={`${detail.id}-${view}`} fish={detail} game={game}
                   initialForm={view === 'variant' ? 1 : 0} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// ---------- 설정 탭 — 동기화 상태 / 데이터 관리 / 패치노트 / 관리자 / 버전 ----------

// ---------- 계정 (v0.4.0) — 설정 탭엔 상태+버튼만, 폼은 오버레이 모달 ----------
// 가입 = 익명 계정 승격(진행 유지) / 로그인 = 다른 계정으로 교체(현재 게스트 진행 소멸 — 경고+백업)

type AccountTab = 'signup' | 'login';

// 가입/로그인은 의도가 다른 행위라 탭으로 분리 — 진입 버튼 자체가 초기 탭을 정한다
// (모달을 열고서 또 고르게 하면 한 단계 더 묻는 셈이라, 어느 버튼을 눌렀는지로 이미 답이 나와 있다)
function AccountModal({ game, setToast, onAuthChanged, onClose }: {
  game: GameState; setToast: (m: string) => void;
  onAuthChanged: () => Promise<void>; onClose: () => void;
}) {
  const [tab, setTab] = useState<AccountTab>('signup');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const signUp = () => run(async () => {
    if (!email.trim() || pw.length < 6) { setToast('이메일과 6자 이상 비밀번호를 입력하세요.'); return; }
    const r = await signUpWithEmail(email.trim(), pw);
    if (!r.ok) { setToast(`⚠️ 가입 실패: ${r.msg}`); return; }
    await onAuthChanged();
    setToast('✅ 계정이 만들어졌다! 이제 어느 기기에서든 이 진행을 이어갈 수 있다.');
    onClose();
  });

  const signIn = () => run(async () => {
    if (!email.trim() || !pw) { setToast('이메일과 비밀번호를 입력하세요.'); return; }
    // 다른 계정으로 교체 — 현재 게스트 진행은 사라진다: 확인 + 이사 코드 자동 백업
    if (!window.confirm('로그인하면 지금 게스트 진행은 사라져요.\n(만약을 위해 이사 코드를 클립보드에 복사해 둘게요)\n계속할까요?')) return;
    try { await navigator.clipboard.writeText(saveCode(game)); } catch { /* 백업 실패해도 진행 */ }
    const r = await signInWithEmail(email.trim(), pw);
    if (!r.ok) { setToast(`⚠️ 로그인 실패: ${r.msg}`); return; }
    await onAuthChanged();
    onClose();
  });

  const reset = () => run(async () => {
    if (!email.trim()) { setToast('비밀번호를 재설정할 이메일을 입력하세요.'); return; }
    const r = await requestPasswordReset(email.trim());
    setToast(r.ok ? '📧 재설정 메일을 보냈다. 받은편지함을 확인하세요.' : `⚠️ 실패: ${r.msg}`);
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>👤 계정 연동</h3>
        {/* 기존 도감 서브탭과 동일한 컴포넌트/클래스 재사용 — 새 스타일 만들지 않는다 */}
        <div className="dex-subtabs">
          <button className={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>가입</button>
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>로그인</button>
        </div>

        {tab === 'signup' ? (
          <p className="panel-note">계정을 만들면 지금 진행 그대로, 어느 기기에서든 이어져요.</p>
        ) : (
          <p className="panel-note">로그인하면 그 계정의 진행을 불러와요 — 지금 기기의 게스트 진행은 사라져요.</p>
        )}

        <div className="account-form">
          <input type="email" placeholder="이메일" value={email} autoComplete="email"
                 onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder={tab === 'signup' ? '비밀번호 (6자 이상)' : '비밀번호'}
                 value={pw} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                 onChange={e => setPw(e.target.value)} />
        </div>

        <div className="settings-actions">
          {tab === 'signup' ? (
            <Button variant="primary" onClick={signUp} disabled={busy}>✨ 계정 만들기 (진행 유지)</Button>
          ) : (
            <>
              <Button variant="primary" onClick={signIn} disabled={busy}>로그인</Button>
              <Button variant="ghost" onClick={reset} disabled={busy}>비밀번호를 잊었어요</Button>
            </>
          )}
        </div>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}

function AccountSection({ game, setToast, account, onAuthChanged }: {
  game: GameState; setToast: (m: string) => void;
  account: string | null; onAuthChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  if (!supabase) return null; // 오프라인(dev) 모드 — 계정 기능 없음

  const signOut = async () => {
    if (!window.confirm('로그아웃할까요? 이 기기는 새 게스트로 다시 시작해요.')) return;
    await signOutAccount();
    window.location.reload(); // 재부팅 = 새 익명 세션으로 깔끔하게 시작
  };

  return (
    <>
      <h4>계정</h4>
      {account ? (
        <>
          <p className="panel-note">✅ <b>{account}</b>로 로그인됨 — 진행이 이 계정에 저장돼요.</p>
          <div className="settings-actions">
            <Button onClick={signOut}>로그아웃</Button>
          </div>
        </>
      ) : (
        <div className="settings-actions">
          <Button variant="primary" onClick={() => setOpen(true)}>👤 계정 연동</Button>
        </div>
      )}
      {open && (
        <AccountModal game={game} setToast={setToast}
                      onAuthChanged={onAuthChanged} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function SettingsTab({ game, setGame, setToast, syncLabel, syncState, ...props }: SidebarProps) {
  const exportSave = async () => {
    const code = saveCode(game);
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

      <AccountSection game={game} setToast={setToast}
                      account={props.account} onAuthChanged={props.onAuthChanged} />

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
