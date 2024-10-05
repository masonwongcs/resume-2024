import { create } from 'zustand';

type WorkItem = {
  name: string;
  url: string;
  image: string;
  description: string;
};

interface WorkState {
  selectedWork: WorkItem | null;
  setSelectedWork: (workItem: WorkItem) => void;
  removeSelectedWork: () => void;
}

const useWorkStore = create<WorkState>((set) => ({
  selectedWork: null,
  setSelectedWork: (workItem) => {
    set({
      selectedWork: workItem
    });
  },
  removeSelectedWork: () => set({ selectedWork: null })
}));

export { useWorkStore };
