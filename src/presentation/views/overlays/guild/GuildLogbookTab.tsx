import { logbookDays } from '../../../../features/guild/model/guild';
import type { GuildLogItem, LogEntry, LogPart } from '../../../../features/guild/model/guild';
import { cx } from '../../../ui/cx';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import Subheading from '../../../ui/Subheading';
import type { GlyphId } from '../../../ui/PixelIcon';

// 항해일지 탭: 한국 날짜마다 금색 날짜 머리를 두고, 기록은 세로 줄로 잇는다.
// 기록마다 종류를 알리는 픽셀 표식과 한국 시각을 붙이고, 이름과 전설, 네임드, 길드 스킬은 색과 굵기로 세운다.
// 떠남과 내보냄은 낮춘 색으로 보인다.
const MARK: Record<LogEntry['kind'], { glyph: GlyphId; tone: string }> = {
  join: { glyph: 'people', tone: 'text-accent' },
  leave: { glyph: 'exit', tone: 'text-text-dim' },
  kick: { glyph: 'exit', tone: 'text-danger' },
  legendary: { glyph: 'star', tone: 'text-legend border-gold-dark bg-[color-mix(in_oklab,var(--c-legend)_22%,var(--c-surface-2))]' },
  named: { glyph: 'flag', tone: 'text-epic border-[#9a4d8f] bg-[color-mix(in_oklab,var(--c-epic)_22%,var(--c-surface-2))]' },
  donate: { glyph: 'coin', tone: 'text-gold' },
  'bonus-up': { glyph: 'upload', tone: 'text-gold border-gold-dark' },
};

const TONE: Record<NonNullable<LogPart['tone']>, string> = {
  nick: 'font-bold text-text',
  me: 'font-bold text-gold',
  legend: 'font-bold text-legend',
  named: 'font-bold text-epic',
  skill: 'font-bold text-gold',
  num: 'pf-accent text-xs',
};

export default function GuildLogbookTab({ logbook, me }: { logbook: readonly GuildLogItem[]; me: string }) {
  const days = logbookDays(logbook, me);
  return (
    <Inset className="pf-scroll-panel flex-1 min-h-0 pf-vscroll px-4 pt-3 pb-4">
      {days.length === 0 && <Note className="my-0">아직 기록이 없어요.</Note>}
      {days.map((d, i) => (
        <section key={d.day} aria-label={d.day} className={cx(i > 0 && 'mt-4')}>
          <Subheading className="flex items-center gap-3 mb-2 pf-accent text-xs font-normal text-gold
                                 after:content-[''] after:flex-1 after:h-px after:bg-linear-to-r after:from-gold-dark after:to-transparent after:opacity-60">
            {d.day}
          </Subheading>
          <ul className="m-0 ml-[11px] pl-[22px] list-none border-l-2 border-line/80">
            {d.items.map(item => <LogLine key={item.id} item={item} />)}
          </ul>
        </section>
      ))}
    </Inset>
  );
}

function LogLine({ item }: { item: LogEntry }) {
  const mark = MARK[item.kind];
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_44px] items-start gap-3 py-[7px] text-sm leading-relaxed">
      <span className={cx('absolute -left-[35px] top-1.5 size-6 flex items-center justify-center border-2 border-line bg-surface-2',
        '[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]',
        'shadow-[inset_1px_1px_0_var(--bevel-lo),inset_-1px_-1px_0_var(--bevel-hi)]', mark.tone)} aria-hidden="true">
        <PixelIcon glyph={mark.glyph} size={12} />
      </span>
      <span className={cx(item.quiet && 'text-text-dim')}>
        {item.parts.map((p, i) => <span key={i} className={p.tone ? TONE[p.tone] : undefined}>{p.text}</span>)}
      </span>
      <time className="pf-accent text-2xs text-text-dim text-right pt-[3px]">{item.time}</time>
    </li>
  );
}
