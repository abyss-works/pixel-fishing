import { useQueryClient } from '@tanstack/react-query';
import {
  readAdminIntegrityEvents,
  readAdminIntegrityMetrics,
  readAdminIntegrityStages,
  releaseAdminIntegrityStage,
} from './queries';
import { adminKeys } from './queryKeys';
import { useAdminQuery } from './useAdminQuery';

const DEFAULT_EVENT_LIMIT = 50;
const DEFAULT_METRIC_DAYS = 7;

/** 무결성 감등 현황·전환 이력·지표 조회와 오탐 해제 조치. 해제 후 무결성 캐시를 무효화한다 */
export function useAdminIntegrity(
  granted: boolean,
  eventLimit: number = DEFAULT_EVENT_LIMIT,
  metricDays: number = DEFAULT_METRIC_DAYS,
) {
  const client = useQueryClient();
  const stages = useAdminQuery(adminKeys.integrityStages, readAdminIntegrityStages, granted);
  const events = useAdminQuery(
    adminKeys.integrityEvents(undefined, eventLimit),
    () => readAdminIntegrityEvents(undefined, eventLimit),
    granted,
  );
  const metrics = useAdminQuery(
    adminKeys.integrityMetrics(metricDays),
    () => readAdminIntegrityMetrics(metricDays),
    granted,
  );

  const releaseStage = async (userId: string) => {
    const result = await releaseAdminIntegrityStage(userId);
    await Promise.all([
      client.invalidateQueries({ queryKey: adminKeys.integrityStages }),
      client.invalidateQueries({ queryKey: adminKeys.integrityEvents(undefined, eventLimit) }),
      client.invalidateQueries({ queryKey: adminKeys.integrityMetrics(metricDays) }),
    ]);
    return result;
  };

  const refresh = () => {
    stages.refresh();
    events.refresh();
    metrics.refresh();
  };

  return {
    stages,
    events,
    metrics,
    releaseStage,
    refresh,
  };
}
