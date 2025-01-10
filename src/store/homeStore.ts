import { create } from 'zustand';

interface HomeState {
  immersiveModeOn: boolean;
  setImmersiveModeOn: (immersiveModeOn: boolean) => void;
}

const useHomeStore = create<HomeState>((set) => ({
  immersiveModeOn: false,
  setImmersiveModeOn: (immersiveModeOn) => {
    set({
      immersiveModeOn: immersiveModeOn
    });
  }
}));

export { useHomeStore };
