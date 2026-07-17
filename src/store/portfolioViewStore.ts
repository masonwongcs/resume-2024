import { create } from 'zustand';

export type PortfolioViewMode = 'canvas' | 'reading';

const STORAGE_KEY = 'portfolio-view-mode';

const readStoredViewMode = (): PortfolioViewMode | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'canvas' || stored === 'reading' ? stored : null;
};

interface PortfolioViewState {
  viewMode: PortfolioViewMode;
  hasHydrated: boolean;
  hydrate: () => void;
  setViewMode: (mode: PortfolioViewMode) => void;
}

const usePortfolioViewStore = create<PortfolioViewState>((set) => ({
  viewMode: 'canvas',
  hasHydrated: false,
  hydrate: () => {
    const stored = readStoredViewMode();
    set({
      viewMode: stored ?? 'canvas',
      hasHydrated: true
    });
  },
  setViewMode: (viewMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, viewMode);
    }
    set({ viewMode });
  }
}));

export { usePortfolioViewStore };
