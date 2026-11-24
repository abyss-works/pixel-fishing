import type { GameState } from '../../../../game/rules/logic';
import type { AchievementReward } from '../../../../game/content/achievements';
import { DEFAULT_LOOK, hatById } from '../../../../game/content/wardrobe';
import { canClaim } from '../../../../features/achievement/model/achievements';
import type {
  AchievementRow,
  AchievementRowStatus,
  CumulativeBonusCardModel,
  NamedGroupCardModel,
} from '../../../../features/achievement/model/achievements';
import { fmtGold, fmtNum } from '../../../ui/format';
import { cx } from '../../../ui/cx';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import type { InsetBorder } from '../../../ui/Inset';
import PersonSprite from '../../../ui/PersonSprite';
import PixelIcon from '../../../ui/PixelIcon';
import ProgressMeter from '../../../ui/ProgressMeter';
import SegmentedStepBar from '../../../ui/SegmentedStepBar';
import Tip from '../../../ui/Tip';

interface Props {
  row: AchievementRow;
  game: GameState;
  /** 게스트 여부 — 게스트는 수령이 거절되므로 버튼은 잠긴다 */
  guest?: boolean;
  /** 수령 요청이 진행 중이다 — 받기 버튼을 잠근다 */
  busy: boolean;
  onClaim: () => void;
}

const cardTone = (status: AchievementRowStatus) =>
  status === 'claimed' ? 'deep' : status === 'claimable' ? 'light' : 'base';

const cardBorder = (status: AchievementRowStatus): InsetBorder =>
  status === 'claimable' ? 'gold' : 'line';

const cardFrameClass = (status: AchievementRowStatus) => cx(
  'flex min-w-0 flex-col',
  status === 'claimable' && 'bg-[color-mix(in_oklab,var(--c-gold)_12%,var(--c-surface))]',
);

function StatusBadge({ status }: { status: AchievementRowStatus }) {
  if (status === 'claimable') {
    return <Badge tone="gold" size="xs">수령 가능</Badge>;
  }
  if (status === 'claimed') {
    return (
      <Badge tone="dim-plain" size="xs" inline>
        <PixelIcon glyph="check" size={10} />
        완료
      </Badge>
    );
  }
  return <Badge tone="dim-plain" size="xs">미달성</Badge>;
}

// 업적 카드 — 오목한 Inset 위계, 단일 우선순위 골드 강조, 2단 게이지(막대 위 + 비율/수치 아래),
// 고정 높이 하단 줄(받기 / 받음 / 진행 중)로 상태가 바뀌어도 카드 높이가 흔들리지 않는다.
export default function AchievementCard({ row, game, guest = false, busy, onClaim }: Props) {
  const { def, progress } = row;
  const clamped = Math.min(progress.current, progress.target);
  const ratio = progress.target > 0 ? clamped / progress.target : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  return (
    <Inset tone={cardTone(row.status)} border={cardBorder(row.status)} className={cardFrameClass(row.status)}>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <b data-achievement-name className="text-sm text-text break-keep break-words">
            {def.name}
          </b>
          <StatusBadge status={row.status} />
        </div>
        <p data-achievement-desc className="text-2xs leading-[1.5] text-text-dim break-keep break-words">{def.desc}</p>
        <ProgressMeter
          stacked
          className="mt-auto pt-1"
          current={progress.current}
          target={progress.target}
          tone={row.status === 'claimable' ? 'gold' : row.status === 'claimed' ? 'dim' : 'accent'}
          ariaLabel={`진척, ${def.name}`}
          fillTestAttr="achievement"
          leftLabel={<span className={cx('pf-accent', row.status === 'claimable' ? 'text-gold' : 'text-text-dim')}>{pct}%</span>}
          rightLabel={<span className="pf-accent text-text">{fmtNum(progress.current)} / {fmtNum(progress.target)}</span>}
        />
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
    </Inset>
  );
}

/** 누적 보너스 다단계 카드 — 단일 분절 게이지(중복 막대 없음) + 3상태 단계 툴팁 */
export function CumulativeBonusCard({ card }: { card: CumulativeBonusCardModel }) {
  const target = Math.max(card.nextThreshold, 1);
  const doneCount = card.steps.filter(step => step.state === 'done').length;
  const activeRatio = Math.min(100, Math.round((card.current / target) * 100));

  const tipContent = (
    <span className="flex min-w-48 flex-col gap-1">
      <span className="flex flex-col">
        {card.steps.map((step, idx) => {
          const stateLabel = step.state === 'done' ? '완료' : step.state === 'now' ? '진행 중' : '예정';
          const stateTone = step.state === 'done' ? 'gold-plain' : step.state === 'now' ? 'accent' : 'dim-plain';
          return (
            <span key={step.id} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5">
                <Badge tone={stateTone} size="2xs">{stateLabel}</Badge>
                <span>{idx + 1}단계 ({step.label})</span>
              </span>
              <span className="pf-accent text-text">{step.deltaText}</span>
            </span>
          );
        })}
      </span>
      <span className="pt-1 border-t border-line text-text-dim">{card.maxText}</span>
    </span>
  );

  return (
    <Inset tone={card.allDone ? 'deep' : 'base'} className="flex min-w-0 flex-col">
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <PixelIcon glyph={card.icon} size={14} className={cx('shrink-0', card.allDone ? 'text-gold' : 'text-accent')} />
            <b data-achievement-name className="text-sm text-text break-keep break-words">
              {card.series.name}
            </b>
            {card.series.scope === 'zone' && <Badge>{card.scopeLabel}</Badge>}
          </div>
          <Badge tone={card.allDone ? 'gold-plain' : 'dim-plain'} size="xs" pixel>
            {card.allDone ? '최대 단계' : `${doneCount} / ${card.steps.length}단계`}
          </Badge>
        </div>
        <p data-achievement-desc className="text-2xs leading-[1.5] text-text-dim break-keep break-words">{card.series.desc}</p>
        <div className="mt-auto flex flex-col gap-1 pt-1">
          <SegmentedStepBar
            steps={card.steps.map(step => ({
              id: step.id,
              state: step.state === 'done' ? 'done' : step.state === 'now' ? 'now' : 'open',
              pct: activeRatio,
            }))}
            ariaLabel={`진척, ${card.series.name}`}
            valueNow={card.current}
            valueMax={target}
            fillTestAttr="achievement"
          />
          <div className="flex items-center justify-between gap-2 text-2xs">
            <span className="pf-accent text-text-dim">
              {card.allDone ? '최대 도달' : `다음 ${doneCount + 1}단계 ${card.nextDeltaText ?? ''}`}
            </span>
            <span className="pf-accent text-text whitespace-nowrap">{fmtNum(card.current)} / {fmtNum(card.nextThreshold)}</span>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-line px-2.5 py-1.5">
        <Tip text={tipContent}>
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
        <span className="text-xs text-text-dim">자동 적용</span>
      </div>
    </Inset>
  );
}

/** 네임드 다회 토벌(1·5·10회) 치장 다단계 압축 카드 — 미토벌 시 스포일러 실명·모자 실루엣·툴팁까지 100% 가린다 */
export function NamedGroupCard({
  card, game, guest = false, busy, onClaim,
}: {
  card: NamedGroupCardModel;
  game: GameState;
  guest?: boolean;
  busy: boolean;
  onClaim: (row: AchievementRow) => void;
}) {
  const clamped = Math.min(card.current, card.target);
  const ratio = card.target > 0 ? clamped / card.target : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const activeReward = card.activeRow.def.reward;
  const doneSteps = card.steps.filter(s => s.status === 'claimed').length;

  const stepBadge = card.status === 'claimable'
    ? <StatusBadge status="claimable" />
    : card.status === 'claimed'
      ? <StatusBadge status="claimed" />
      : (
        <Badge tone="dim-plain" size="xs" pixel>
          {doneSteps}/{card.steps.length} 단계
        </Badge>
      );

  const tipContent = (
    <span className="flex min-w-44 flex-col">
      {card.steps.map(step => {
        const stateLabel = step.status === 'claimed' ? '완료' : step.status === 'claimable' ? '수령 가능' : '예정';
        const stateTone = step.status === 'claimed' ? 'gold-plain' : step.status === 'claimable' ? 'accent' : 'dim-plain';
        return (
          <span key={step.id} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5">
              <Badge tone={stateTone} size="2xs">{stateLabel}</Badge>
              <span>{step.label}</span>
            </span>
            <span className="text-text">{card.discovered ? step.hatName : '???'}</span>
          </span>
        );
      })}
    </span>
  );

  const activeStepIdx = card.steps.findIndex(step => step.status === 'progress');

  return (
    <Inset tone={card.status === 'claimed' ? 'deep' : card.status === 'claimable' ? 'light' : 'base'}
           border={cardBorder(card.status)}
           className={cardFrameClass(card.status)}>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <b data-achievement-name className="text-sm text-text break-keep break-words">
            {card.title}
          </b>
          {stepBadge}
        </div>
        <p data-achievement-desc className="text-2xs leading-[1.5] text-text-dim break-keep break-words">{card.desc}</p>
        <div className="mt-auto flex flex-col gap-1 pt-1">
          <SegmentedStepBar
            steps={card.steps.map((step, idx) => ({
              id: step.id,
              state: step.status === 'claimed'
                ? 'done'
                : step.status === 'claimable'
                  ? 'claimable'
                  : idx === activeStepIdx
                    ? 'now'
                    : 'open',
              pct: step.threshold > 0 ? Math.round((card.current / step.threshold) * 100) : 0,
            }))}
            ariaLabel={`진척, ${card.title}`}
            valueNow={clamped}
            valueMax={Math.max(card.target, 1)}
            fillTestAttr="achievement"
          />
          <div className="flex items-center justify-between gap-2 text-2xs">
            <span className={cx('pf-accent', card.status === 'claimable' ? 'text-gold' : 'text-text-dim')}>
              {card.discovered ? `목표 ${card.target}회` : `${pct}%`}
            </span>
            <span className="pf-accent text-text whitespace-nowrap">{fmtNum(card.current)} / {fmtNum(card.target)}</span>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-line px-2.5 py-1.5">
        {activeReward.kind === 'hat' ? (
          <>
            <PersonSprite
              look={card.discovered ? { ...DEFAULT_LOOK, hat: activeReward.hatId } : DEFAULT_LOOK}
              scale={3}
              headOnly
              mystery={!card.discovered}
              className="shrink-0"
            />
            <div className="flex min-w-0 flex-col">
              <Tip text={tipContent}>
                <b data-achievement-reward className="text-2xs break-keep break-words">
                  {card.discovered ? (hatById(activeReward.hatId)?.name ?? '모자') : '미확인 모자'}
                </b>
              </Tip>
              <span className="text-2xs text-text-dim">
                {card.discovered ? `${card.target}회 토벌 보상` : '토벌하면 정체와 모자가 열려요'}
              </span>
            </div>
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
    </Inset>
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
