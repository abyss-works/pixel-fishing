import { useState } from 'react';
import {
  formatFortuneDay,
  fortuneModalRows,
  selectFortuneCollection,
} from '../../../../features/fortune/model/fortune';
import type {
  FortuneCollectionItem,
  FortuneDiscoveredItem,
} from '../../../../features/fortune/model/fortune';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import EmptyState from '../../../ui/EmptyState';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Locked from '../../../ui/Locked';
import ProgressCount from '../../../ui/ProgressCount';
import Skeleton from '../../../ui/Skeleton';
import ToggleChip from '../../../ui/ToggleChip';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import {
  FortuneMotifIcon,
  FortuneStrength,
  MiniIndexPips,
} from './fortuneParts';
import { fortuneToneOf } from './fortuneTone';

const UNDISCOVERED_LORE = '아직 만나지 않은 점괘예요.\n오늘의 운세에서 처음 나오면 점괘첩에 기록돼요.';

function CollectionDetailPanel({ item }: { item: FortuneCollectionItem }) {
  const rows = item.discovered ? fortuneModalRows(item) : [];
  return (
    <Inset
      className="h-full p-2.5 mobile:p-1.5 flex flex-col justify-between gap-2 mobile:gap-1 min-w-0 text-left"
      aria-label="점괘 상세"
    >
      <Inset tone="light" className="px-2.5 py-2 mobile:px-2 mobile:py-0.5 flex items-center gap-2.5 mobile:gap-2 shrink-0">
        <Inset
          tone="deep"
          className={cx(
            'size-9 mobile:size-6 shrink-0 flex items-center justify-center',
            !item.discovered && 'grayscale brightness-75',
          )}
        >
          <FortuneMotifIcon kind={item.kind} index={item.index} size={20} dimmed={!item.discovered} className="mobile:size-4" />
        </Inset>
        <div className="flex flex-col gap-0.5 mobile:gap-0 min-w-0">
          <span
            className={cx(
              'text-sm mobile:text-xs font-bold leading-tight truncate',
              item.discovered ? fortuneToneOf(item.kind) : 'text-text-dim',
            )}
          >
            {item.name}
          </span>
          {item.discovered ? (
            <FortuneStrength index={item.index} compact />
          ) : (
            <span className="text-2xs mobile:leading-tight text-text-dim leading-none">미발견</span>
          )}
        </div>
      </Inset>

      <p className="m-0 text-xs mobile:text-2xs text-text-dim leading-[1.55] mobile:leading-[1.35] flex-1 min-h-0 whitespace-pre-line">
        {item.discovered ? item.phrase : UNDISCOVERED_LORE}
      </p>

      <div className="flex flex-col gap-1.5 mobile:gap-1 shrink-0">
        <Inset tone="deep" divided className="w-full text-left">
          {item.discovered ? (
            rows.map(row => (
              <KeyValueRow
                key={row.label}
                label={<HighlightRarityText text={row.label} />}
                value={row.accent ? row.value : <HighlightRarityText text={row.value} />}
                valueEnd
                className="text-xs py-1 mobile:py-0 mobile:px-1.5 mobile:leading-[1.35]"
                valueClassName={row.accent ? 'pf-accent text-accent' : undefined}
              />
            ))
          ) : (
            <KeyValueRow
              label="효과"
              value="???"
              valueEnd
              className="text-xs py-1 mobile:py-0 mobile:px-1.5 mobile:leading-[1.35]"
              valueClassName="text-text-dim"
            />
          )}
        </Inset>

        <Inset
          tone="deep"
          divided
          className="w-full text-left mobile:grid mobile:grid-cols-[auto_minmax(0,1fr)] mobile:divide-y-0 mobile:divide-x"
        >
          <KeyValueRow
            label="모은 횟수"
            value={item.discovered ? `${item.count}회` : '0회'}
            valueEnd
            className="text-xs py-1 mobile:py-0 mobile:px-1.5 mobile:gap-1.5 mobile:leading-[1.35]"
            valueClassName={item.discovered ? 'pf-accent text-gold' : 'text-text-dim'}
          />
          <KeyValueRow
            label="처음 만난 날"
            value={item.discovered && item.firstDay ? formatFortuneDay(item.firstDay) : '미발견'}
            valueEnd
            className="text-xs py-1 mobile:py-0 mobile:px-1.5 mobile:gap-1.5 mobile:leading-[1.35]"
            valueClassName={!item.discovered ? 'text-text-dim' : undefined}
          />
        </Inset>
      </div>
    </Inset>
  );
}

// 운세 창 점괘첩 탭 — 21종 운세를 3열×7행 고정 격자로 보여 주고 선택 점괘의 로어·효과·수집 기록을 표시한다.
export default function FortuneCollectionTab({
  discovered,
  lockLines,
  loading,
  failed,
  offline,
  onRetry,
}: {
  discovered: readonly FortuneDiscoveredItem[];
  lockLines: readonly string[] | null;
  loading: boolean;
  failed: boolean;
  offline: boolean;
  onRetry: () => void;
}) {
  const collection = selectFortuneCollection(discovered);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>(() => collection.items[0].key);

  if (lockLines !== null) {
    return (
      <Locked
        title="점괘첩"
        description="지금까지 만난 21종 운세를 모아 확인해요."
        lines={lockLines}
        label="점괘첩 잠금"
        className="block w-full"
      >
        <Inset
          tone="deep"
          border="line-dim"
          className="h-[404px] mobile:h-[456px] flex items-center justify-center p-4 text-center"
        >
          <span className="text-sm font-bold text-text-dim">점괘첩 잠금</span>
        </Inset>
      </Locked>
    );
  }

  if (offline) {
    return (
      <Inset tone="deep" border="line-dim" className="flex-1 min-h-0 flex items-center justify-center p-3">
        <EmptyState glyph="sparkle" message="점괘첩은 연결된 상태에서만 볼 수 있어요." />
      </Inset>
    );
  }

  if (loading) {
    return (
      <div role="status" aria-label="점괘첩을 불러오는 중" className="flex flex-col flex-1 min-h-0">
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  if (failed) {
    return (
      <Inset tone="deep" border="line-dim" className="flex-1 min-h-0 flex items-center justify-center p-3">
        <EmptyState
          glyph="warn"
          message={<>점괘첩을 불러오지 못했어요.<br />잠시 뒤 다시 시도해 주세요.</>}
          action={<Button size="sm" onClick={onRetry}>다시 불러오기</Button>}
        />
      </Inset>
    );
  }

  const visibleItems = ownedOnly ? collection.items.filter(item => item.discovered) : collection.items;
  const selected = (visibleItems.find(item => item.key === selectedKey)
    ?? collection.items.find(item => item.key === selectedKey)
    ?? visibleItems[0]
    ?? collection.items[0]);

  const toggleOwnedOnly = () => {
    const next = !ownedOnly;
    setOwnedOnly(next);
    if (next && !selected.discovered) {
      const firstOwned = collection.items.find(item => item.discovered);
      if (firstOwned) setSelectedKey(firstOwned.key);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_236px] mobile:grid-cols-1 mobile:grid-rows-[minmax(0,1fr)_206px] gap-2.5 mobile:gap-1.5 flex-1 min-h-0">
      <div className="flex flex-col gap-1.5 mobile:gap-1 min-w-0 min-h-0">
        <div className="flex items-center justify-between gap-2 shrink-0 min-h-[26px]">
          <div className="inline-flex items-baseline gap-1.5 text-sm mobile:text-xs font-bold text-text">
            <span>모은 점괘</span>
            <ProgressCount current={collection.discoveredCount} target={collection.totalCount} />
          </div>
          <ToggleChip size="sm" pressed={ownedOnly} onClick={toggleOwnedOnly}>
            모은 것만 보기
          </ToggleChip>
        </div>

        <Inset tone="deep" border="line-dim" className="flex-1 min-h-0 p-1.5 mobile:p-1 flex flex-col">
          {visibleItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-text-dim text-center p-3">
              아직 모은 점괘가 없어요.
            </div>
          ) : (
            <div
              role="listbox"
              aria-label="점괘첩 목록"
              className="grid grid-cols-3 grid-rows-7 gap-1 mobile:gap-0.5 flex-1 min-h-0"
            >
              {visibleItems.map(item => {
                const isSelected = item.key === selected.key;
                return (
                  <Button
                    key={item.key}
                    size="sm"
                    role="option"
                    aria-selected={isSelected}
                    pressed={isSelected}
                    aria-label={item.discovered ? `${item.name}, ${item.strengthLabel}` : `${item.name}, 미발견`}
                    onClick={() => setSelectedKey(item.key)}
                    className={cx(
                      'min-h-0 min-w-0 w-full justify-start gap-1.5 mobile:gap-1 px-1.5 py-0.5 mobile:px-1 text-left font-normal overflow-hidden',
                      isSelected && 'border-gold bg-(--inset-light)',
                      !item.discovered && !isSelected && 'bg-(--inset-deep) border-line-dim text-text-dim',
                    )}
                  >
                    <Inset
                      tone="deep"
                      border="line-dim"
                      className={cx(
                        'size-6 mobile:size-4 shrink-0 flex items-center justify-center',
                        !item.discovered && 'grayscale brightness-75',
                      )}
                    >
                      <FortuneMotifIcon
                        kind={item.kind}
                        index={item.index}
                        size={13}
                        dimmed={!item.discovered}
                      />
                    </Inset>
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span
                        className={cx(
                          'text-2xs leading-tight truncate',
                          item.discovered ? cx('font-bold', fortuneToneOf(item.kind)) : 'font-normal text-text-dim',
                        )}
                      >
                        {item.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-2xs leading-none text-text-dim mobile:hidden">
                        {item.discovered ? (
                          <>
                            <MiniIndexPips index={item.index} />
                            <span className="truncate">{item.strengthLabel}</span>
                          </>
                        ) : (
                          <span>효과 ???</span>
                        )}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
        </Inset>
      </div>

      <CollectionDetailPanel item={selected} />
    </div>
  );
}
