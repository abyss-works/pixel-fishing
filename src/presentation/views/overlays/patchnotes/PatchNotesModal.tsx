import { PATCH_NOTES } from '../../../../game/content/patchnotes';
import Accordion from '../../../ui/Accordion';
import Button from '../../../ui/Button';
import Modal from '../../../ui/Modal';
import NoteTag from '../../../ui/NoteTag';
import { reopenWhatsNew } from '../../../../features/announcements/service/whatsNew';
import { SCROLL_Y_ROWS } from '../../../ui/scrollArea';

// 패치노트 창: 버전별 아코디언(기본은 전부 닫힘)에 노트마다 범주 뱃지를 단다.
// 목록이 길어 스크롤 상자에 넣는다. 닫힌 줄 일곱 개(36.56px씩, 줄 사이 8px)와 위아래 여백 4px씩까지만 보이고 나머지는 휠로 본다.
// 최근 소식 다시 보기는 이 창을 닫고 항목이 있는 가장 최근 버전의 소식 창을 연다. 소식 창의 "다시 보지 않기" 체크도 거기서 바꾼다.
export default function PatchNotesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="패치노트" narrow fill onClose={onClose}>
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={() => { onClose(); reopenWhatsNew(); }}>최근 소식 다시 보기</Button>
      </div>
      <div className={`${SCROLL_Y_ROWS} max-h-[312px] flex flex-col gap-2`}>
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
    </Modal>
  );
}
