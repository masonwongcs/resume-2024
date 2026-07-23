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
  hydrate: (forceCanvas?: boolean) => void;
  setViewMode: (mode: PortfolioViewMode) => void;
  /**
   * One-shot override for entry navigation into `/work` or `/work/[slug]` (KTD6) — always
   * lands on canvas for that load without touching the persisted reading/canvas preference.
   */
  forceCanvasView: () => void;
}

const usePortfolioViewStore = create<PortfolioViewState>((set) => ({
  viewMode: 'canvas',
  hasHydrated: false,
  hydrate: (forceCanvas) => {
    if (forceCanvas) {
      set({ viewMode: 'canvas', hasHydrated: true });
      return;
    }
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
  },
  forceCanvasView: () => set({ viewMode: 'canvas', hasHydrated: true })
}));

export { usePortfolioViewStore };
