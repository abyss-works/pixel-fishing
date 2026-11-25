import type { DailyFortune } from '../../../../game/rules/fortune';
import {
  FORTUNE_KIND,
  FORTUNE_MENU_GUIDE_NOTE,
  FORTUNE_RESET_NOTE,
  fortuneEffectNote,
  fortunePhrase,
  fortuneSummaryRows,
} from '../../../../features/fortune/model/fortune';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import { FortuneIndexMeter, FortuneMotifIcon } from './fortuneParts';

// 오늘의 운세 창: 그 게임 날짜의 첫 접속에 고정된 운세의 종류, 문구, 지수, 적용 대상, 효과를 보여 준다.
export default function FortuneModal({ fortune, onClose }: { fortune: DailyFortune; onClose: () => void }) {
  const kind = FORTUNE_KIND[fortune.kind];
  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title="오늘의 운세" onClose={onClose} centered
                 confirm={<Button variant="primary" full onClick={onClose}>확인</Button>}>
        <div className="flex flex-col items-center gap-2.5 text-center">
          <Inset className="w-full flex items-center justify-center h-[82px]">
            <FortuneMotifIcon kind={fortune.kind} size={56} />
          </Inset>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-lg font-bold text-gold">{kind.name}</span>
            <p className="text-xs text-text-dim">{fortunePhrase(fortune)}</p>
          </div>
          <FortuneIndexMeter index={fortune.index} />
          <Inset divided aria-label="오늘의 보너스" className="w-full text-left">
            {fortuneSummaryRows(fortune).map(row => (
              <KeyValueRow
                key={row.label}
                label={row.label}
                value={<HighlightRarityText text={row.value} />}
                valueEnd
                valueClassName={row.accent ? 'pf-accent text-accent' : undefined}
              />
            ))}
          </Inset>
          <Note size="2xs" className="my-0 text-center whitespace-pre-line">
            <HighlightRarityText text={fortuneEffectNote(fortune)} />
            {'\n'}
            {FORTUNE_RESET_NOTE}
            {'\n'}
            {FORTUNE_MENU_GUIDE_NOTE}
          </Note>
        </div>
      </ModalCard>
    </Modal>
  );
}
