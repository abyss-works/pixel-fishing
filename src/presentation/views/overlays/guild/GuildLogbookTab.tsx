import { logAgoText, logLine } from '../../../../features/guild/model/guild';
import type { GuildLogItem } from '../../../../features/guild/model/guild';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { cx } from '../../../ui/cx';
import Note from '../../../ui/Note';

// 항해일지 탭 — 가입·탈퇴, 전설 획득, 네임드 토벌, 기부가 최신순으로 남는다. 전설과 네임드 줄은 금색이다.
export default function GuildLogbookTab({ logbook }: { logbook: readonly GuildLogItem[] }) {
  const nowMs = Date.parse(useNow());
  if (logbook.length === 0) return <Note>아직 남은 기록이 없어요. 가입·탈퇴, 전설 획득, 네임드 토벌이 여기에 남아요.</Note>;
  return (
    <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
      {logbook.map(l => (
        <li key={l.id} className={cx('flex items-start gap-2 text-sm',
          (l.kind === 'legendary' || l.kind === 'named') && 'text-gold')}>
          <span className="flex-1 min-w-0">{logLine(l)}</span>
          <span className="shrink-0 text-xs text-text-dim">{logAgoText(l.at, nowMs)}</span>
        </li>
      ))}
    </ul>
  );
}
