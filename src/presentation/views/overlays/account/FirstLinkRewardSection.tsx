import type { FirstLinkRewardViewItem } from '../../../../features/account/model/firstLinkReward';
import Inset from '../../../ui/Inset';
import ItemSprite from '../../../ui/ItemSprite';
import Tip, { TipCard, TipList } from '../../../ui/Tip';
import { cx } from '../../../ui/cx';
import { GradeName } from '../../../ui/fish/RarityTag';

/** 게스트 최초 구글 연결 선물 3종 — 출항 연결 창과 설정 계정 관리 게스트 창이 함께 쓰는 공용 보상 구획 */
export default function FirstLinkRewardSection({
  items,
  className,
}: {
  items: readonly FirstLinkRewardViewItem[];
  className?: string;
}) {
  return (
    <section aria-label="최초 연결 선물" className={cx('flex flex-col gap-2 pt-2 border-t border-line/40', className)}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-[13px] font-bold text-gold">최초 연결 선물</span>
        <span className="text-xs text-text-dim">우편함 지급</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {items.map(item => (
          <Tip
            key={item.id}
            plain
            hoverOnly
            className="block group"
            text={(
              <TipCard
                title={<GradeName name={item.name} grade={item.grade} />}
                badge={<span className="text-xs font-normal text-text-dim">{item.kindLabel}</span>}
                description={(
                  <TipList
                    rows={[
                      { label: '지속', value: item.durationLabel },
                      ...item.effects.map(effect => ({ label: '효과', value: effect })),
                    ]}
                  />
                )}
              />
            )}
          >
            <Inset tone="deep" hoverAccent className="w-full px-2.5 py-[7px] flex items-center gap-2.5 text-left">
              <span aria-hidden="true" className="size-9 p-px inline-flex items-center justify-center bg-bg border border-line shrink-0">
                <ItemSprite kind={item.spriteKind} id={item.id} preset="list" />
              </span>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <div className="text-[13px] font-bold leading-[1.3] text-text">
                  <GradeName name={item.name} grade={item.grade} />
                </div>
                <p className="text-xs leading-[1.35] text-text-dim">{item.summaryLine}</p>
              </div>
              <span className="pf-accent text-sm text-gold shrink-0 whitespace-nowrap pl-1 leading-none">×{item.qty}</span>
            </Inset>
          </Tip>
        ))}
      </div>
    </section>
  );
}
