import { useState } from 'react';
import type { PatchNote } from '../../../../game/content/patchnotes';
import Inset from '../../../ui/Inset';
import NoteTag from '../../../ui/NoteTag';
import PixelIcon from '../../../ui/PixelIcon';
import PressRow from '../../../ui/PressRow';
import Subheading from '../../../ui/Subheading';
import { cx } from '../../../ui/cx';
import { SCROLL_Y } from '../../../ui/scrollArea';

type NoteEntry = PatchNote['notes'][number];

function VersionHead({ note }: { note: PatchNote }) {
  return (
    <Inset className="px-3 py-2 flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="pf-accent text-xl text-gold">v{note.version}</span>
        <span className="pf-accent text-2xs text-text-dim">{note.date}</span>
      </div>
      <p className="text-sm">{note.summary}</p>
    </Inset>
  );
}

function NewsNoteRow({ item, important = false }: { item: NoteEntry; important?: boolean }) {
  const [open, setOpen] = useState(false);
  const title = item.compact ?? item.text;
  const expandable = Boolean(item.compact && item.compact !== item.text);

  if (!expandable) {
    return (
      <div className="px-2.5 py-2 flex items-start gap-2">
        <NoteTag tag={item.tag} className="shrink-0 mt-[0.15em]" />
        <span className={cx('flex-1 min-w-0 text-sm leading-[1.6]', important && 'font-bold text-text')}>
          {title}
        </span>
      </div>
    );
  }

  return (
    <div>
      <PressRow expanded={open} onPress={() => setOpen(v => !v)} className="px-2.5 py-2 flex items-center gap-2">
        <NoteTag tag={item.tag} className="shrink-0" />
        <span className={cx('flex-1 min-w-0 text-sm leading-[1.6]', important && 'font-bold text-text')}>
          {title}
        </span>
        <PixelIcon glyph={open ? 'caretDown' : 'caretRight'} size={8} className="shrink-0 text-text-dim" />
      </PressRow>
      {open && (
        <p className="px-2.5 pb-2 text-xs leading-[1.6] text-text-dim">{item.text}</p>
      )}
    </div>
  );
}

function NoteSections({ note }: { note: PatchNote }) {
  const importantNotes = note.notes.filter(n => n.important === true);
  const otherNotes = note.notes.filter(n => !n.important);

  return (
    <>
      {importantNotes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Subheading className="flex items-center justify-between mb-0">
            <span className="text-gold font-bold">핵심 변경</span>
            <span className="pf-accent text-xs text-gold">{importantNotes.length}건</span>
          </Subheading>
          {importantNotes.map((n, i) => (
            <Inset key={i} border="gold">
              <NewsNoteRow item={n} important />
            </Inset>
          ))}
        </div>
      )}
      {otherNotes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Subheading className="flex items-center justify-between mb-0">
            <span>그 밖의 변경 요약</span>
            <span className="pf-accent text-xs text-text-dim">{otherNotes.length}건</span>
          </Subheading>
          <Inset divided>
            {otherNotes.map((n, i) => (
              <NewsNoteRow key={i} item={n} />
            ))}
          </Inset>
        </div>
      )}
    </>
  );
}

// 업데이트 소식 — 버전마다 머리(버전, 날짜, 한 줄 요약)를 먼저 세우고 핵심 변경과 요약 목록을 계층별로 보인다. 버전은 최신 순이다.
// 버전이 하나면 머리는 고정하고 목록만 스크롤한다. 여럿이면 머리까지 한 스크롤 안에 이어 둔다.
// 노트가 길어도 창이 화면을 넘지 않게 스크롤한다.
export default function NewsStep({ news }: { news: readonly PatchNote[] }) {
  if (news.length === 1) {
    return (
      <div className="flex flex-col gap-3 min-h-0">
        <VersionHead note={news[0]} />
        <div className={`${SCROLL_Y} max-h-[calc(42vh+8px)] flex flex-col gap-3`}>
          <NoteSections note={news[0]} />
        </div>
      </div>
    );
  }
  return (
    <div className={`${SCROLL_Y} max-h-[calc(56vh+8px)] flex flex-col gap-4`}>
      {news.map(note => (
        <section key={note.version} aria-label={`v${note.version}`} className="flex flex-col gap-3">
          <VersionHead note={note} />
          <NoteSections note={note} />
        </section>
      ))}
    </div>
  );
}
