// 방치 결과 알림 - 방치 결과 카드에 흔적 줄 데이터(수배판 스냅샷)를 이어 준다. 카드를 띄울 때 마운트되어 그 시각을 흔적 줄의 기준으로 잡는다.
import type { ComponentProps } from 'react';
import { useAwayTraceLine } from '../../../../features/bounty/service/useAwayTraceLine';
import AwayCard from './AwayCard';

export default function AwayNotice({ atSea, ...card }: { atSea: boolean } & Omit<ComponentProps<typeof AwayCard>, 'trace'>) {
  return <AwayCard {...card} trace={useAwayTraceLine(atSea)} />;
}
