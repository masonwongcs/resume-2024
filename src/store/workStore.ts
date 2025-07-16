import { create } from 'zustand';

type StickerItem = {
  src: string;
  alt: string;
  startX: string;
  startY: string;
  transformEndX: number;
  transformEndY: number;
};

type WorkItem = {
  name?: string;
  url?: string;
  image?: string;
  video?: string;
  description?: string;
  skills?: string[];
  stickers?: StickerItem[];
};

interface WorkState {
  selectedWork: WorkItem | null;
  setSelectedWork: (workItem: WorkItem) => void;
  removeSelectedWork: () => void;
  stickersQueue: StickerItem[] | [];
  setStickerQueue: (sticker: StickerItem[]) => void;
}

const useWorkStore = create<WorkState>((set, get) => ({
  selectedWork: null,
  stickersQueue: [],
  setSelectedWork: (workItem) => {
    set({
      selectedWork: workItem
    });
  },
  removeSelectedWork: () => set({ selectedWork: null }),
  setStickerQueue: (sticker) => {
    const stickersQueue = Array.from(new Set([...get().stickersQueue, ...sticker]));
    set({
      stickersQueue
    });
  }
}));

export { useWorkStore };
