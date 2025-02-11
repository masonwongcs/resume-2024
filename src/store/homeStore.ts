import { create } from 'zustand';

interface HomeState {
  immersiveModeOn: boolean;
  setImmersiveModeOn: (immersiveModeOn: boolean) => void;
  loaded: boolean;
  setIsLoaded: () => void;
  loadingProgress: number;
  setLoadingProgress: (progress: number) => void;
}

const useHomeStore = create<HomeState>((set) => ({
  immersiveModeOn: false,
  loaded: false,
  loadingProgress: 0,
  setImmersiveModeOn: (immersiveModeOn) => {
    set({
      immersiveModeOn: immersiveModeOn
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
  }
}));

export { useHomeStore };
