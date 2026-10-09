// 수배판 — 현상금 라이선스·수주·납품 UI (항구 전용, 고향 제외).
// 상태 변경은 dispatch(서버 권위)만, 표시용 조회는 readBounty(RLS 본인 읽기)다.
// 성공할 때마다 스냅샷을 다시 읽는다 — 진행도·수주권은 서버(DB)가 진실이다.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BOUNTIES, LICENSE_TIER_OF, zoneOfPort } from '../data/bounties.js';
import type { BountyDifficulty, BountyPort, BountyQuest, BountyTier } from '../data/bounties.js';
import type { NamedFish } from '../data/named.js';
import { BOUNTY_DAILY_CAP, BOUNTY_PORT_DAILY_CAP } from '../game/balance.js';
import { RARITY } from '../data/rarity.js';
import { namedById } from '../data/named.js';
import { REJECT_TEXT, formDiscovered, licenseConditions } from '../game/logic.js';
import type { Fish } from '../data/fish';
import type { GameState } from '../game/logic.js';
import type { GameAction } from '../game/actions.js';
import { readBounty } from '../api';
import type { BountySnapshot } from '../api';
import type { DispatchResult, MaybePromise } from '../api';
import { when } from '../api';
import Button from '../ui/Button';
import FishSprite from '../ui/FishSprite';
import Note from '../ui/Note';
import PixelIcon from '../ui/PixelIcon';
import SubTabs from '../ui/SubTabs';

type BoardScreen = 'quests' | 'named';

// 난이도 열 머리 색 — 쉬움 dim · 보통 accent · 어려움 gold
const DIFF_HEAD: Record<Exclude<BountyDifficulty, 'named'>, string> = {
  easy: 'text-text-dim', normal: 'text-accent', hard: 'text-gold',
};
const DIFF_NAME: Record<Exclude<BountyDifficulty, 'named'>, string> = {
  easy: '쉬움', normal: '보통', hard: '어려움',
};

// 수배서 사진 — 레지스트리에서 Fish 껍데기를 만든다 (표시 전용, 저장 안 함).
// 가격 0은 찍지 않는다 — 카드에 가격을 그리지 않으므로 상관없다.
const namedFishOf = (n: NamedFish): Fish => ({
  id: n.id, name: n.name, spot: 'deep', rarity: 'legendary', price: 0,
  color: n.color, shape: n.shape, lore: n.lore,
  variant: { name: n.name, color: n.color, lore: n.lore },
});

export default function BountyPanel({ game, port, dispatch, setToast }: {
  game: GameState;
  port: BountyPort;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const zone = zoneOfPort(port)!;
  const [snap, setSnap] = useState<BountySnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<BoardScreen>('quests');
  const refresh = () => {
    let live = true;
    readBounty().then(s => { if (live) { setSnap(s); setLoaded(true); } });
    return () => { live = false; };
  };
  useEffect(refresh, []);
  const run = (action: GameAction, done: string) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') { setToast(done); refresh(); }
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });
  };

  const covers = (tier: BountyTier): boolean => snap?.licensed.some(
    l => l.zone === zone && (l.tier === tier || l.tier === 'named')) ?? false;
  const licensedFor = (q: BountyQuest): boolean => covers(LICENSE_TIER_OF[q.difficulty]);
  const leftAll = snap ? BOUNTY_DAILY_CAP - snap.acceptsToday : null;
  const leftPort = snap ? BOUNTY_PORT_DAILY_CAP - (snap.acceptsByPort[port] ?? 0) : null;
  const progressOf = (id: string) => snap?.progress.find(p => p.questId === id)?.progress ?? 0;
  const quests = BOUNTIES.filter(q => q.zone === zone);

  const licenseBlock = (tier: BountyTier, title: string) => {
    const conds = licenseConditions(game, zone, tier);
    const held = covers(tier);
    const can = conds.every(c => c.ok);
    return (
      <div>
        <h4 className="text-sm text-text-dim font-normal border-b border-line pb-1 mb-1">{title}</h4>
        <ul className="text-sm mb-1">
          {conds.map(c => (
            <li key={c.key} className={c.ok ? '' : 'line-through text-text-dim'}>
              <PixelIcon glyph={c.ok ? 'checkOn' : 'checkOff'} size={11} /> {c.label}
            </li>
          ))}
        </ul>
        {!held && (
          <Button size="sm" disabled={!can || busy}
            onClick={() => run({ type: 'acceptBountyLicense', zone, tier },
              `${title}을 받았다!`)}>
            라이선스 받기
          </Button>
        )}
      </div>
    );
  };

  const questButtons = (q: BountyQuest) => {
    const prog = progressOf(q.id);
    const done = prog >= q.count;
    if (done) {
      return (
        <Button size="sm" disabled={busy}
          onClick={() => run({ type: 'deliverBounty', questId: q.id },
            `납품 완료! ${q.reward}G를 받았다.`)}>
          납품하기
        </Button>
      );
    }
    return (
      <Button size="sm" disabled={snap === null || !licensedFor(q) || (leftAll ?? 0) <= 0 || (leftPort ?? 0) <= 0 || busy}
        onClick={() => run({ type: 'acceptQuest', questId: q.id, port },
          `의뢰를 수주했다 — ${q.id}.`)}>
        수주하기
      </Button>
    );
  };

  const gradeRow = (q: BountyQuest) => {
    const prog = progressOf(q.id);
    const active = prog > 0;
    return (
      <div key={q.id} className="flex flex-col gap-1 text-sm border-b border-line pb-1">
        <span>{RARITY[q.grade!].name} {q.count}마리 <span className="pf-accent">{q.reward}G</span></span>
        {active && <span className="text-text-dim text-xs">진행 {prog}/{q.count}</span>}
        <span>{questButtons(q)}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-dim text-xs">
        {leftAll === null ? '수주권 —' : `수주권 ${leftAll}/${BOUNTY_DAILY_CAP} · 이 항구 ${leftPort}/${BOUNTY_PORT_DAILY_CAP}`}
      </p>
      {loaded && snap === null && (
        <Note>오프라인에서는 라이선스만 받을 수 있다. 수주·납품은 서버 연결이 필요하다.</Note>
      )}
      {licenseBlock('basic', '수배 라이선스')}
      {licenseBlock('named', '지명수배 라이선스')}
      <SubTabs
        items={[
          { key: 'quests' as BoardScreen, label: '일반 의뢰' },
          { key: 'named' as BoardScreen, label: '네임드 의뢰' },
        ]}
        activeKey={screen}
        onSelect={setScreen}
      />
      {screen === 'quests' ? (
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DIFF_NAME) as (keyof typeof DIFF_NAME)[]).map(d => (
            <div key={d}>
              <h4 className={`text-sm font-normal border-b border-line pb-1 mb-1 ${DIFF_HEAD[d]}`}>{DIFF_NAME[d]}</h4>
              <div className="flex flex-col gap-1">
                {quests.filter(q => q.difficulty === d).map(gradeRow)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {quests.filter(q => q.difficulty === 'named').map(q => (
            <NamedCard key={q.id} game={game} quest={q} buttons={questButtons(q)}
                       progress={progressOf(q.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NamedCard({ game, quest, buttons, progress }: {
  game: GameState; quest: BountyQuest; buttons: ReactNode; progress: number;
}) {
  const n = quest.targetFish ? namedById(quest.targetFish) : undefined;
  const fish = n ? namedFishOf(n) : null;
  const found = quest.targetFish ? formDiscovered(game, quest.targetFish, 'normal') : false;
  return (
    <div className="border-2 border-gold rounded-sm bg-surface-2 p-2 grid grid-cols-2 gap-2">
      <div>
        {fish && (
          <FishSprite fish={fish} preset="portrait" discovered={found}
                      ariaLabel={found && n ? n.name : '미확인 지명수배'} className="block mx-auto" />
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <b className="text-gold">{found && n ? n.name : '???'}</b>
        <p className="text-text-dim italic text-xs flex-1">
          {found && n ? n.lore : '수배서에만 이름이 돈다.'}
        </p>
        <span className="pf-accent">{quest.reward}G</span>
        {progress > 0 && <span className="text-text-dim text-xs">진행 {progress}/{quest.count}</span>}
        <span>{buttons}</span>
      </div>
    </div>
  );
}
