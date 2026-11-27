import type { ReactNode } from 'react';
import { GAME_DAY_RESET_TEXT } from '../../../../game/rules/time.js';
import Button from '../../../ui/Button';
import KeyValueRow from '../../../ui/KeyValueRow';
import PixelIcon from '../../../ui/PixelIcon';
import SharedProgressMeter from '../../../ui/ProgressMeter';
import ProgressCount from '../../../ui/ProgressCount';
import Tip, { TipBullets } from '../../../ui/Tip';
import { splitTipLines } from '../../../ui/tipText';
import { fmtMinutes } from '../../../ui/format';

// 수배판 카드(일반 의뢰, 네임드 토벌, 유물)가 함께 쓰는 조각.

/** 이름 왼쪽, 값 오른쪽의 줄 목록 — 카드 본문의 대상, 진행, 보상 같은 항목 */
export function BoardRows({ rows }: { rows: { key: string; label: ReactNode; value: ReactNode; wrap?: boolean }[] }) {
  return (
    <ul className="list-none m-0 p-0 text-xs">
      {rows.map(r => (
        <KeyValueRow as="li" compact wrap={r.wrap} key={r.key} label={r.label} value={r.value} />
      ))}
    </ul>
  );
}

/** 수주 버튼 — 누를 수 없는 이유가 있으면 그 이유를 툴팁으로 보인다 */
export function AcceptButton({ disabled, reason, onClick }: {
  disabled: boolean; reason: string | null; onClick: () => void;
}) {
  const button = <Button variant="primary" full disabled={disabled} onClick={onClick}>수주</Button>;
  if (!reason) return button;
  const lines = splitTipLines(reason);
  return <Tip wraps text={lines.length > 1 ? <TipBullets items={lines} /> : reason} className="block">{button}</Tip>;
}

/** 진행 막대와 "진행/목표" - 수배판 일반 의뢰 카드와 의뢰 창 카드가 함께 쓴다 */
export function ProgressMeter({ progress, count }: { progress: number; count: number }) {
  const shown = Math.min(progress, count);
  return (
    <SharedProgressMeter
      current={shown}
      target={count}
      tone="accent"
      ariaLabel="진행"
      className="h-3.5"
      rightLabel={<ProgressCount current={shown} target={count} tight />}
    />
  );
}

/** 오늘 남은 클리어(일반 의뢰, 네임드 토벌) - 고정 정보 줄에 놓는 세 조각. 스냅샷이 오기 전에는 값 자리에 -를 둔다.
 *  초기화 시각과 클리어 기준은 이름의 툴팁이다 */
export function ClearsLeft({ leftAll, leftNamed, dailyCap, namedDailyCap, shortLabels }: {
  leftAll: number | null; leftNamed: number | null; dailyCap: number; namedDailyCap: number;
  /** 줄 맨 앞이면 이름 왼쪽에 구분선을 두지 않는다 */
  first?: boolean;
  /** 값 이름을 메뉴 줄의 의뢰 배지처럼 "일반", "네임드"로 줄인다 */
  shortLabels?: boolean;
}) {
  return (
    <>
      <span className="text-text-dim whitespace-nowrap">
        <Tip text={<TipBullets items={['보상을 받으면 완료 1회예요.', `조건을 채우지 못한 의뢰는 ${GAME_DAY_RESET_TEXT}에 사라져요.`]} />}>오늘 남은 클리어</Tip>
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-text-dim">{shortLabels ? '일반' : '일반 의뢰'}</span>
        <span aria-label="오늘 남은 일반 의뢰"><ProgressCount current={leftAll} target={dailyCap} tight /></span>
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-text-dim">{shortLabels ? '네임드' : '네임드 토벌'}</span>
        <span aria-label="오늘 남은 네임드 토벌"><ProgressCount current={leftNamed} target={namedDailyCap} tight /></span>
      </span>
    </>
  );
}

/** 흔적 남은 시간 - 라벨 "흔적", 설명 툴팁, 남은 분. 수배판과 의뢰 창의 네임드 카드가 함께 쓴다.
 *  도전권은 규칙 용어라 화면에 쓰지 않는다 */
export function TraceTime({ mins }: { mins: number }) {
  return (
    <span className="text-xs text-text-dim whitespace-nowrap">
      <Tip text={<TipBullets items={['흔적이 남아 있어요.', '이 구역 바다로 나가 흔적 카드의 추적을 눌러 보세요.']} />}>흔적</Tip>
      {' '}<span className="pf-accent text-text">{fmtMinutes(mins)}</span>
    </span>
  );
}

/** 네임드 카드 머리 줄 - 왼쪽에 대상 이름(titleTip이 있으면 이름의 툴팁), 오른쪽에 흔적 남은 시간(있을 때만) */
export function NamedCardHead({ title, titleTip, traceMins }: {
  title: string; titleTip?: ReactNode; traceMins: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 h-6">
      <b className="inline-flex items-center gap-1.5 text-base text-named truncate min-w-0">
        <PixelIcon glyph="target" size={13} className="shrink-0" />
        <span className="truncate">{titleTip ? <Tip text={titleTip}>{title}</Tip> : title}</span>
      </b>
      {traceMins !== null && <TraceTime mins={traceMins} />}
    </div>
  );
}
