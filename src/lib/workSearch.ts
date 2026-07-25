import { getWorkKey } from '@/components/InfiniteCanvas/grid/gridMath';
import type { Work } from '@/components/InfiniteCanvas/types';

const getSearchableDescription = (description: Work['description']): string => {
  if (typeof description === 'string') return description;
  return '';
};

/** Case-insensitive substring match on work name + string description. */
export const getMatchingWorkKeys = (works: Work[], query: string): Set<string> => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return new Set();

  const matches = new Set<string>();
  for (const work of works) {
    const name = work.name.toLowerCase();
    const description = getSearchableDescription(work.description).toLowerCase();
    if (name.includes(normalized) || description.includes(normalized)) {
      matches.add(getWorkKey(work));
    }
  }
  return matches;
};

export const isWorkSearchMatch = (work: Work, matchingKeys: Set<string>, query: string): boolean => {
  if (!query.trim()) return true;
  return matchingKeys.has(getWorkKey(work));
};
