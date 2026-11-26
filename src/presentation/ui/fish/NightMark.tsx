import type { Fish } from '../../../game/rules/logic';
import { cx } from '../cx';
import IconButton from '../IconButton';
import PixelIcon from '../PixelIcon';
import Tip, { TipCard } from '../Tip';

/** 밤 전용 어종 카드의 우측 상단 달 아이콘 — 발견·미발견 카드 모두 표시하며 도감·가방 카드뷰·지역 어군 정보가 함께 쓴다.
 *  카드(RARITY_CARD)가 기준 위치(relative)를 갖고, 노치는 좌상단·우하단이라 우측 상단은 비어 있다. */
export default function NightMark({ fish, discovered }: { fish: Fish; discovered: boolean }) {
  if (!fish.night) return null;
  return (
    <Tip
      wraps
      hoverOnly
      plain
      className="absolute top-1 right-1 leading-none cursor-help"
      text={(
        <TipCard
          title="밤 전용 어종"
          rows={[{ label: '출현 시각(게임)', value: '22:00~06:00' }]}
          note="달빛 미끼를 쓰면 낮에도 낚여요."
        />
      )}
    >
      <span
        data-night-mark
        className={cx('inline-flex items-center justify-center leading-none', discovered ? 'text-accent' : 'text-[#6797b8]')}
      >
        <PixelIcon glyph="moon" size={12} />
      </span>
    </Tip>
  );
}

/** 도감·지역 탭 어군 정보의 밤 전용 어종 단독 범례(`?`) */
export function NightMarkLegend({ className }: { className?: string }) {
  return (
    <Tip
      wraps
      pressOpens
      text={(
        <TipCard
          rows={[
            {
              text: (
                <span className="inline-flex items-center gap-1.5">
                  <PixelIcon glyph="moon" size={11} className="text-accent shrink-0" />
                  <span>밤 전용 어종</span>
                </span>
              ),
            },
          ]}
          note="밤(게임 22:00~06:00)에만 낚여요."
        />
      )}
    >
      <IconButton
        type="button"
        glyph="question"
        size={12}
        tone="dim"
        className={cx('p-1', className)}
        aria-label="밤 전용 어종 아이콘 안내"
      />
    </Tip>
  );
}
