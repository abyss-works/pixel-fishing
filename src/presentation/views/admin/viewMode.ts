import { createContext, useContext } from 'react';

export type AdminViewMode = 'summary' | 'detail';

const STORAGE_KEY = 'pf_admin_view_mode';

export function readStoredViewMode(): AdminViewMode {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === 'detail' ? 'detail' : 'summary';
  } catch {
    return 'summary';
  }
}

export function writeStoredViewMode(mode: AdminViewMode): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* 저장소 제한 환경 무해 */
  }
}

export const AdminViewModeCtx = createContext<{
  viewMode: AdminViewMode;
  setViewMode: (mode: AdminViewMode) => void;
}>({
  viewMode: 'summary',
  setViewMode: () => {},
});

export const useAdminViewMode = () => useContext(AdminViewModeCtx);

export const AdminSubnavHostCtx = createContext<HTMLDivElement | null>(null);
export const useAdminSubnavHost = () => useContext(AdminSubnavHostCtx);
