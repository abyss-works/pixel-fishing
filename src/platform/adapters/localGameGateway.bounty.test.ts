// 오프라인(로컬) 게이트웨이의 바운티 헌팅 — 같은 리듀서를 쓰지만 서버가 주입하는 수배 진실
// (오늘 클리어 횟수·수주 중 의뢰·진행도)이 없어 수주·납품·결투 확정이 닫혀 있다.
// 클리어 기준 한도와 04:00 만료는 DB 행을 읽는 서버의 몫이라 로컬에서는 우회할 길이 없다.
import { describe, expect, it } from 'vitest';
import { LocalGameGateway } from './localGameGateway';
import { LICENSE_GRADES, newState, zoneDexMissing } from '../../game/rules/logic';
import type { GameState } from '../../game/rules/logic';

function readyAtHarbor(): GameState {
  const dex: GameState['dex'] = {};
  for (const id of zoneDexMissing(newState(), 'pacific', LICENSE_GRADES.named)) {
    dex[id] = { normal: { count: 1, maxSize: 30, first: '2026-01-01' } };
  }
  return { ...newState(), fame: 1500, dex, location: { kind: 'base', id: 'harbor' } };
}

describe('LocalGameGateway 바운티 헌팅', () => {
  it('라이선스 조건을 채워도 수주는 거부한다 — 한도를 셀 서버 기록이 없다', () => {
    const gateway = new LocalGameGateway(readyAtHarbor());
    for (const questId of ['pacific-easy-common', 'pacific-named-megalodon']) {
      expect(gateway.dispatch({ type: 'acceptQuest', questId, port: 'harbor' }), questId)
        .toEqual({ status: 'rejected', error: 'no-license' });
    }
  });

  it('납품은 완료를 증명할 진행 기록이 없어 거부한다 — 클리어가 생기지 않는다', () => {
    const gateway = new LocalGameGateway(readyAtHarbor());
    expect(gateway.dispatch({ type: 'deliverBounty', questId: 'pacific-easy-common' }))
      .toEqual({ status: 'rejected', error: 'quest-incomplete' });
  });

  it('결투 결과 확정도 거부한다', () => {
    const gateway = new LocalGameGateway(readyAtHarbor());
    expect(gateway.dispatch({
      type: 'resolveChallenge', questId: 'pacific-named-megalodon', success: true, hits: 6, misses: 0,
    })).toEqual({ status: 'rejected', error: 'no-license' });
  });
});
