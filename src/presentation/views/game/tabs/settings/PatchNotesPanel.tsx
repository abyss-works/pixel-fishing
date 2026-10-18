import { PATCH_NOTES } from '../../../../../game/content/patchnotes';
import Accordion from '../../../../ui/Accordion';
import SectionTitle from '../../../../ui/SectionTitle';
import NoteTag from '../../../../ui/NoteTag';
import Button from '../../../../ui/Button';
import { reopenWhatsNew } from '../../../../../features/announcements/service/whatsNew';

// 패치노트 콘텐츠 — GameTabs의 '설정' 탭에서 렌더한다.
// 버전별 아코디언: 기본은 전부 닫힘, 노트마다 범주(UI/기능/기타) 뱃지를 단다.
// 목록이 길어져 스크롤 상자에 넣는다 — 약 8줄(38px × 8)까지만 보이고 나머지는 휠로.
export default function PatchNotesPanel() {
  return (
    <div>
      <SectionTitle>패치노트</SectionTitle>
      {/* 접속 시 뜨는 이번 버전 소식 창을 다시 연다 */}
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={reopenWhatsNew}>이번 소식 다시 보기</Button>
      </div>
      <div className="pf-scroll overflow-y-auto max-h-[304px] pr-1 flex flex-col gap-2">
        {PATCH_NOTES.map(p => (
          <Accordion
            key={p.version}
            summary={
              <>
                <span className="pf-accent">v{p.version}</span>
                <span className="flex-1 text-text-dim overflow-hidden text-ellipsis whitespace-nowrap">{p.summary}</span>
                <span className="text-text-dim text-2xs">{p.date}</span>
              </>
            }
          >
            {/* 범주 배지를 왼쪽 열에 두어 줄바꿈된 본문이 배지 아래로 파고들지 않게 한다 */}
            <ul className="list-none px-2 pb-2 flex flex-col gap-2 text-sm leading-[1.6]">
              {p.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-2">
                  <NoteTag tag={n.tag} className="shrink-0 mt-[0.15em]" />
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </Accordion>
        ))}
      </div>
    </div>
  );
}
