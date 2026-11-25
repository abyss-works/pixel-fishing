import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { ENERGY_NAME } from '../../../../features/kitchen/model/energy';
import { selectKitchenStatus } from '../../../../features/kitchen/model/recipes';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import { GradeName } from '../../../ui/fish/RarityTag';
import Inset from '../../../ui/Inset';
import ItemSprite from '../../../ui/ItemSprite';
import KeyValueRow from '../../../ui/KeyValueRow';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import ProgressCount from '../../../ui/ProgressCount';
import { SCROLL_Y_ROWS } from '../../../ui/scrollArea';
import TabBar from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import { fmtMinutes } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import RecipeTab from './RecipeTab';
import TransmuteTab from './TransmuteTab';
import type { FacilityAct } from './facilityParts';

type KitchenTab = 'lunch' | 'bait' | 'transmute';

// 부엌 창 — 920 폭, 높이 고정. 제목 아래 고정 정보 줄(조리 중, 다음 완성, 대기열 펼침/접기 토글, 보관함)은 어느 탭에서나 같은 자리에 두고,
// 대기열을 펼치면 진행·대기 항목과 짧은 취소 버튼이 나온다. 취소 확인은 공용 ConfirmDialog에서 100% 환급 내역과 승계 안내를 보인 뒤 확정한다.
// 그 아래 탭 셋(도시락, 미끼, 기운 변환)을 둔다.
export default function KitchenPanel({ game, busy, act, setToast, onClose }: {
  game: GameState;
  busy: boolean;
  act: FacilityAct;
  setToast?: Notify;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<KitchenTab>('lunch');
  const [queueOpen, setQueueOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const now = useNow();
  const status = selectKitchenStatus(game, now);
  const cancelTarget = cancelTargetId ? status.queue.find(q => q.id === cancelTargetId) ?? null : null;
  const nextAfterCancel = cancelTarget?.isCurrent ? status.queue[1] ?? null : null;
  const drawerOpen = queueOpen && status.queue.length > 0;

  return (
    <>
      <ModalCard title="부엌" onClose={onClose} fixed>
        <Inset className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm shrink-0">
          {status.cooking ? (
            <>
              <span><span className="text-text-dim">조리 중</span>{' '}
                <span className="inline-flex align-middle"><ItemSprite kind={status.cooking.recipe.kind} id={status.cooking.recipe.id} preset="row" /></span>{' '}<GradeName name={status.cooking.title.name} grade={status.cooking.title.grade} />{' '}
                <ProgressCount current={status.cooking.completed} target={status.cooking.count} tight /></span>
              <span className="text-text-dim">다음 완성 <span className="pf-accent text-text">{fmtMinutes(status.cooking.nextInMin)}</span></span>
            </>
          ) : (
            <span className="text-text-dim">조리 중인 요리 없음</span>
          )}
          <span className="ml-auto flex items-center gap-3">
            <Button
              size="xs"
              pressed={drawerOpen}
              disabled={status.queueCount === 0}
              aria-expanded={drawerOpen}
              onClick={() => setQueueOpen(o => !o)}
            >
              대기열 {status.queueCount}건
            </Button>
            <span className="text-text-dim">
              <Tip text={<>가방에 있는 요리와 조리 중이거나 대기 중인 요리를 함께 세요.<br />가득 차면 조리를 시작할 수 없어요.</>}>보관함</Tip>{' '}
              <ProgressCount current={status.stored} target={status.cap} tight tone={status.full ? 'danger' : 'gold'} />
            </span>
          </span>
        </Inset>

        {drawerOpen && (
          <Inset tone="deep" className="px-3 py-1 shrink-0">
            <ul aria-label="조리 대기열" className={cx(SCROLL_Y_ROWS, 'max-h-[168px] divide-y divide-line')}>
              {status.queue.map((item, idx) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <Badge tone={item.isCurrent ? 'gold' : 'dim'} size="2xs">
                      {item.isCurrent ? '조리 중' : `대기 ${idx}`}
                    </Badge>
                    <ItemSprite kind={item.recipe.kind} id={item.recipe.id} preset="row" className="shrink-0" />
                    <span className="truncate"><GradeName name={item.title.name} grade={item.title.grade} /></span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 ml-auto">
                    <span className="pf-accent text-text">{item.completed}/{item.count}</span>
                    <span className="text-text-dim">예상 <span className="pf-accent text-text">{fmtMinutes(item.estimatedMin)}</span></span>
                    <Button size="xs" variant="danger" disabled={busy} onClick={() => setCancelTargetId(item.id)}>
                      취소
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Inset>
        )}

        <TabBar
          tabs={[
            { key: 'lunch' as KitchenTab, label: '도시락' },
            { key: 'bait' as KitchenTab, label: '미끼' },
            { key: 'transmute' as KitchenTab, label: '기운 변환' },
          ]}
          activeKey={tab}
          onSelect={setTab}
        />
        {tab === 'transmute'
          ? <TransmuteTab game={game} busy={busy} act={act} setToast={setToast} />
          : <RecipeTab key={tab} kind={tab} game={game} now={now} busy={busy} act={act} setToast={setToast} />}
      </ModalCard>

      {cancelTarget && (
        <ConfirmDialog
          layer="stage"
          title="조리 취소"
          confirmLabel="취소하기"
          onCancel={() => setCancelTargetId(null)}
          onConfirm={() => {
            const target = cancelTarget;
            act({ type: 'cancelCook', id: target.id }, () => {
              setCancelTargetId(null);
              if (!setToast) return;
              sendNotice(setToast, {
                kind: 'kitchen.cookAndBuff',
                text: `${target.label} 조리를 취소하고 남은 기운을 돌려받았어요.`,
                toastText: `${target.label} 조리 취소`,
              });
            });
          }}
        >
          <p className="text-sm text-text">
            <GradeName name={cancelTarget.title.name} grade={cancelTarget.title.grade} /> 남은 {cancelTarget.pending}개 조리를 취소해요.
          </p>
          <Inset divided className="px-3">
            {cancelTarget.refundLines.map(line => (
              <KeyValueRow
                key={line.grade}
                label={<GradeName name={ENERGY_NAME} grade={line.grade} />}
                value={`${line.amountText}개`}
                valueEnd
                valueClassName="pf-accent text-accent"
              />
            ))}
          </Inset>
          <Note className="my-0">
            {nextAfterCancel ? (
              <>
                취소하면 대기 중인 <GradeName name={nextAfterCancel.title.name} grade={nextAfterCancel.title.grade} /> 조리가 바로 시작돼요.
              </>
            ) : (
              '남은 수량에 든 기운은 100% 돌려받고, 이미 완성된 요리는 보관함에 남아요.'
            )}
          </Note>
        </ConfirmDialog>
      )}
    </>
  );
}
