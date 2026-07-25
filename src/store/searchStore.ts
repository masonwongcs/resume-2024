import { create } from 'zustand';

interface SearchState {
  isOpen: boolean;
  query: string;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  clear: () => void;
}

const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  query: '',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setQuery: (query) => set({ query }),
  clear: () => set({ query: '', isOpen: false })
}));

export { useSearchStore };
