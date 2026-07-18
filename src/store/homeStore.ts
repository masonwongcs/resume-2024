import { create } from 'zustand';

interface HomeState {
  immersiveModeOn: boolean;
  setImmersiveModeOn: (immersiveModeOn: boolean) => void;
  /** Canvas work focus — slides the header away for immersion */
  canvasFocused: boolean;
  setCanvasFocused: (canvasFocused: boolean) => void;
  loaded: boolean;
  setIsLoaded: () => void;
  loadingProgress: number;
  setLoadingProgress: (progress: number) => void;
  shouldDelayRender: boolean;
  setShouldDelayRender: () => void;
}

const useHomeStore = create<HomeState>((set) => ({
  immersiveModeOn: false,
  canvasFocused: false,
  loaded: false,
  loadingProgress: 0,
  shouldDelayRender: true,
  setImmersiveModeOn: (immersiveModeOn) => {
    set({
      immersiveModeOn: immersiveModeOn
    });
  },
  setCanvasFocused: (canvasFocused) => {
    set({
      canvasFocused
    });
  },
  setIsLoaded: () => {
    set({
      loaded: true
    });
  },
  setLoadingProgress: (progress) => {
    set({
      loadingProgress: progress
    });
  },
  setShouldDelayRender: () => {
    set({
      shouldDelayRender: false
    });
  }
}));

export { useHomeStore };
