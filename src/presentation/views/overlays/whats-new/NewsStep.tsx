import type { PatchNote } from '../../../../game/content/patchnotes';
import NoteTag from '../../../ui/NoteTag';
import Frame from '../../../ui/Frame';

// 범주를 묶어 보여 주는 순서 — 새로 생긴 것 → 보이는 변화 → 수치 → 그 밖
const TAG_ORDER = ['기능', 'UI', '밸런스', '기타'] as const;

// 이번 버전 소식 — 머리(버전·날짜·한 줄 요약)를 먼저 세우고, 범주별로 묶어 훑게 한다.
// 노트가 길어도 창이 화면을 넘지 않게 목록만 스크롤한다.
export default function NewsStep({ news }: { news: PatchNote }) {
  const groups = TAG_ORDER
    .map(tag => ({ tag, items: news.notes.filter(n => n.tag === tag) }))
    .filter(g => g.items.length > 0);
  return (
    <div className="flex flex-col gap-3">
      <Frame className="px-3 py-2 flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="pf-accent text-xl text-gold">v{news.version}</span>
          <span className="pf-accent text-2xs text-text-dim">{news.date}</span>
        </div>
        <p className="text-sm">{news.summary}</p>
      </Frame>
      <div className="pf-scroll overflow-y-auto max-h-[42vh] pr-1 flex flex-col gap-3">
        {groups.map(({ tag, items }) => (
          <section key={tag} className="flex flex-col gap-1">
            <NoteTag tag={tag} className="self-start" />
            <ul className="list-none flex flex-col gap-1.5">
              {items.map((n, i) => (
                <li key={i} className="flex gap-2 text-sm leading-[1.6]">
                  <span aria-hidden className="mt-[0.6em] w-1 h-1 shrink-0 bg-text-dim" />
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
