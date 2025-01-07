import { create } from 'zustand';

type InfoItem = {
  name: string;
  url: string;
  image: string;
  description: string;
};

interface InfoState {
  selectedInfo: InfoItem | null;
  setSelectedInfo: (workItem: InfoItem) => void;
  removeSelectedInfo: () => void;
}

const useInfoStore = create<InfoState>((set) => ({
  selectedInfo: null,
  setSelectedInfo: (workItem) => {
    set({
      selectedInfo: workItem
    });
  },
  removeSelectedInfo: () => set({ selectedInfo: null })
}));

export { useInfoStore };
