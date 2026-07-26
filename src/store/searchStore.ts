import { create } from 'zustand';

import { isDiscoQuery } from '@/lib/workSearch';

interface SearchState {
  isOpen: boolean;
  query: string;
  /** User opted into the disco easter egg (does not auto-start on typing "disco"). */
  discoEnabled: boolean;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  clear: () => void;
  enableDisco: () => void;
  disableDisco: () => void;
}

const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  query: '',
  discoEnabled: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setQuery: (query) =>
    set((state) => ({
      query,
      // Drop opt-in once the query leaves the exact easter egg
      discoEnabled: isDiscoQuery(query) ? state.discoEnabled : false
    })),
  clear: () => set({ query: '', isOpen: false, discoEnabled: false }),
  enableDisco: () => set({ discoEnabled: true }),
  disableDisco: () => set({ discoEnabled: false })
}));

export { useSearchStore };
