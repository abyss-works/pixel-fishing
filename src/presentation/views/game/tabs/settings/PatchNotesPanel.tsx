import { PATCH_NOTES } from '../../../../../game/content/patchnotes';
import Accordion from '../../../../ui/Accordion';
import SectionTitle from '../../../../ui/SectionTitle';
import NoteTag from '../../../../ui/NoteTag';
import CheckToggle from '../../../../ui/CheckToggle';
import Button from '../../../../ui/Button';
import { reopenWhatsNew, useNewsAutoOpen } from '../../../../../features/announcements/service/whatsNew';

// 패치노트 콘텐츠 — GameTabs의 '설정' 탭에서 렌더한다.
// 버전별 아코디언: 기본은 전부 닫힘, 노트마다 범주(UI/기능/기타) 뱃지를 단다.
// 목록이 길어져 스크롤 상자에 넣는다 — 약 8줄(38px × 8)까지만 보이고 나머지는 휠로.
export default function PatchNotesPanel() {
  const [autoOpen, setAutoOpen] = useNewsAutoOpen();
  return (
    <div>
      <SectionTitle>업데이트 소식</SectionTitle>
      {/* 접속 시 소식 창 — 자동 열기 켜고 끄기와 이번 버전 소식 다시 보기 */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <CheckToggle checked={autoOpen} onChange={setAutoOpen} label="새 버전 소식을 자동으로 열기" />
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
            <ul className="list-none px-2 pb-2 flex flex-col gap-1 text-sm leading-[1.6]">
              {p.notes.map((n, i) => (
                <li key={i}>
                  <NoteTag tag={n.tag} className="mr-1" />
                  {n.text}
                </li>
              ))}
            </ul>
          </Accordion>
        ))}
      </div>
    </div>
  );
}
