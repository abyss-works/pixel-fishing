import type { GameState } from '../../../../game/rules/logic';
import type { AchievementReward } from '../../../../game/content/achievements';
import { DEFAULT_LOOK, hatById } from '../../../../game/content/wardrobe';
import { canClaim } from '../../../../features/achievement/model/achievements';
import type {
  AchievementRow,
  CumulativeBonusCardModel,
  NamedGroupCardModel,
} from '../../../../features/achievement/model/achievements';
import { fmtGold, fmtNum } from '../../../ui/format';
import { cx } from '../../../ui/cx';
import Button from '../../../ui/Button';
import Frame from '../../../ui/Frame';
import PersonSprite from '../../../ui/PersonSprite';
import PixelIcon from '../../../ui/PixelIcon';
import Tip, { TipList } from '../../../ui/Tip';

interface Props {
  row: AchievementRow;
  game: GameState;
  /** 게스트 여부 — 게스트는 수령이 거절되므로 버튼은 잠긴다 */
  guest?: boolean;
  /** 수령 요청이 진행 중이다 — 받기 버튼을 잠근다 */
  busy: boolean;
  onClaim: () => void;
}

// 업적 카드 — 업적 창 탭 본문 격자의 한 장. 위에서 아래로 이름표, 조건 문구, 진척 게이지와 숫자,
// 보상 칸(1px 선으로 나눈 칸), 상태와 받기 줄을 둔다. 상태 줄은 높이를 고정해 상태가 바뀌어도 카드 높이가 흔들리지 않는다.
// 카드 본문은 포커스를 받지 않고 받기 버튼만 받는다. 이름·조건·보상 글자는 말줄임하지 않고 카드 안에서 줄을 바꾼다.
export default function AchievementCard({ row, game, guest = false, busy, onClaim }: Props) {
  const { def, progress } = row;
  const ratio = progress.target > 0 ? Math.min(progress.current, progress.target) / progress.target : 0;
  return (
    <Frame
      className={cx(
        'flex min-w-0 flex-col bg-surface-2',
        row.status === 'claimable' && 'border-[color-mix(in_oklab,var(--c-accent)_60%,var(--c-line))]',
        row.status === 'claimed' && 'opacity-50',
      )}
    >
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <b data-achievement-name className="text-sm break-keep break-words">{def.name}</b>
        <p data-achievement-desc className="text-2xs leading-[1.5] text-text-dim break-keep break-words">{def.desc}</p>
        <div className="flex items-center gap-2">
          <span role="meter" aria-label={`진척, ${def.name}`} aria-valuemin={0} aria-valuemax={Math.max(progress.target, 1)}
                aria-valuenow={Math.min(progress.current, progress.target)}
                className="block h-2 flex-1 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]">
            <span data-achievement-gauge-fill
                  className="block h-full bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                  style={{ width: `${ratio * 100}%` }} />
          </span>
          <span className="pf-accent text-2xs whitespace-nowrap">{progress.current}/{progress.target}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-line px-2.5 py-1.5">
        <Reward reward={def.reward} />
      </div>
      <div className="flex h-9 shrink-0 items-center justify-end px-2.5">
        {row.status === 'claimable' ? (
          <Button variant="primary" size="sm" disabled={busy || !canClaim(game, def.id, guest)}
                  aria-label={`받기, ${def.name}`} onClick={onClaim}>받기</Button>
        ) : (
          <span className="text-xs text-text-dim">{row.status === 'claimed' ? '받음' : '진행 중'}</span>
        )}
      </div>
    </Frame>
  );
}

/** 누적 보너스 다단계 카드 — 현재 단계 진척과 적용 효과를 보이고, 전체 단계 목록은 보상 툴팁으로 제공한다 */
export function CumulativeBonusCard({ card }: { card: CumulativeBonusCardModel }) {
  const target = Math.max(card.nextThreshold, 1);
  const ratio = Math.min(card.current, target) / target;
  const doneCount = card.steps.filter(step => step.state === 'done').length;
  return (
    <Frame
      className={cx(
        'flex min-w-0 flex-col bg-surface-2',
        card.allDone && 'border-gold',
      )}
    >
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <b data-achievement-name className="text-sm break-keep break-words">{card.series.name}</b>
          {card.series.scope === 'zone' && (
            <span className="shrink-0 text-2xs text-text-dim">{card.scopeLabel}</span>
          )}
        </div>
        <p data-achievement-desc className="text-2xs leading-[1.5] text-text-dim break-keep break-words">{card.series.desc}</p>
        <div className="flex items-center gap-2">
          <span role="meter" aria-label={`진척, ${card.series.name}`} aria-valuemin={0} aria-valuemax={target}
                aria-valuenow={Math.min(card.current, target)}
                className="block h-2 flex-1 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]">
            <span data-achievement-gauge-fill
                  className={cx('block h-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]', card.allDone ? 'bg-gold' : 'bg-accent')}
                  style={{ width: `${ratio * 100}%` }} />
          </span>
          <span className="pf-accent text-2xs whitespace-nowrap">{fmtNum(card.current)}/{fmtNum(card.nextThreshold)}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-line px-2.5 py-1.5">
        <Tip
          text={(
            <TipList
              rows={card.steps.map(step => ({ label: step.label, value: step.deltaText }))}
              note={card.maxText}
            />
          )}
        >
          <b
            data-achievement-reward
            className={cx(
              'text-xs break-keep break-words',
              card.allDone ? 'text-gold' : doneCount > 0 ? 'text-accent' : 'text-text-dim',
            )}
          >
            {card.activeText}
          </b>
        </Tip>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-end px-2.5">
        <span className={cx('text-xs', card.allDone ? 'text-gold' : doneCount > 0 ? 'text-accent' : 'text-text-dim')}>
          {card.allDone ? '최대 단계' : `${doneCount}/${card.steps.length} 단계`}
        </span>
      </div>
    </Frame>
  );
}

/** 네임드 다회 토벌(1·5·10회) 치장 다단계 압축 카드 — 미토벌 시 스포일러 규칙에 맞춰 실명을 가리고, 전체 단계는 보상 툴팁으로 제공한다 */
export function NamedGroupCard({
  card, game, guest = false, busy, onClaim,
}: {
  card: NamedGroupCardModel;
  game: GameState;
  guest?: boolean;
  busy: boolean;
  onClaim: (row: AchievementRow) => void;
}) {
  const ratio = card.target > 0 ? Math.min(card.current, card.target) / card.target : 0;
  const activeReward = card.activeRow.def.reward;
  return (
    <Frame
      className={cx(
        'flex min-w-0 flex-col bg-surface-2',
        card.status === 'claimable' && 'border-[color-mix(in_oklab,var(--c-accent)_60%,var(--c-line))]',
        card.status === 'claimed' && 'opacity-50',
      )}
    >
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <b data-achievement-name className="text-sm break-keep break-words">{card.title}</b>
        <p data-achievement-desc className="text-2xs leading-[1.5] text-text-dim break-keep break-words">{card.desc}</p>
        <div className="flex items-center gap-2">
          <span role="meter" aria-label={`진척, ${card.title}`} aria-valuemin={0} aria-valuemax={Math.max(card.target, 1)}
                aria-valuenow={Math.min(card.current, card.target)}
                className="block h-2 flex-1 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]">
            <span data-achievement-gauge-fill
                  className="block h-full bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                  style={{ width: `${ratio * 100}%` }} />
          </span>
          <span className="pf-accent text-2xs whitespace-nowrap">{card.current}/{card.target}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-line px-2.5 py-1.5">
        {activeReward.kind === 'hat' ? (
          <>
            <PersonSprite look={{ ...DEFAULT_LOOK, hat: activeReward.hatId }} scale={3} headOnly className="shrink-0" />
            <Tip text={<TipList rows={card.steps.map(step => ({ label: step.label, value: step.hatName }))} />}>
              <b data-achievement-reward className="text-2xs break-keep break-words">
                {hatById(activeReward.hatId)?.name ?? '모자'}
              </b>
            </Tip>
          </>
        ) : (
          <Reward reward={activeReward} />
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center justify-end px-2.5">
        {card.status === 'claimable' ? (
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !canClaim(game, card.activeRow.def.id, guest)}
            aria-label={`받기, ${card.activeRow.def.name}`}
            onClick={() => onClaim(card.activeRow)}
          >
            받기
          </Button>
        ) : (
          <span className="text-xs text-text-dim">{card.status === 'claimed' ? '받음' : '진행 중'}</span>
        )}
      </div>
    </Frame>
  );
}

/** 보상 칸 — 골드는 동전 아이콘과 금액, 모자는 모자를 쓴 머리 그림과 모자 이름이다 */
function Reward({ reward }: { reward: AchievementReward }) {
  if (reward.kind === 'gold') {
    return (
      <>
        <PixelIcon glyph="coin" className="shrink-0 text-gold" />
        <b data-achievement-reward className="pf-accent text-2xs text-gold break-keep break-words">{fmtGold(reward.gold)}</b>
      </>
    );
  }
  return (
    <>
      <PersonSprite look={{ ...DEFAULT_LOOK, hat: reward.hatId }} scale={3} headOnly className="shrink-0" />
      <b data-achievement-reward className="text-2xs break-keep break-words">{hatById(reward.hatId)?.name ?? '모자'}</b>
    </>
  );
}
