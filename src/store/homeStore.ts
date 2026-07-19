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
  /** True after the intro spread finishes — reveals chrome like the header */
  introComplete: boolean;
  setIntroComplete: (introComplete: boolean) => void;
  /** Reset so remounts / HMR can replay the loader + stack intro */
  resetLoading: () => void;
  shouldDelayRender: boolean;
  setShouldDelayRender: () => void;
}

const useHomeStore = create<HomeState>((set) => ({
  immersiveModeOn: false,
  canvasFocused: false,
  loaded: false,
  loadingProgress: 0,
  introComplete: false,
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
  setIntroComplete: (introComplete) => {
    set({
      introComplete
    });
  },
  resetLoading: () => {
    set({
      loaded: false,
      loadingProgress: 0,
      introComplete: false
    });
  },
  setShouldDelayRender: () => {
    set({
      shouldDelayRender: false
    });
  }
}));

export { useHomeStore };
