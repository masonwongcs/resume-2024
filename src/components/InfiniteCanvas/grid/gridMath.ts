import type { CustomCardConfig, GridItem, OriginCardConfig, Work } from '../types';

export const generateItemId = (x: number, y: number) => `item_${x}_${y}`;

export const getWorkKey = (work: Work) => work.url ?? work.name;

export const parseGridCoords = (id: string): { x: number; y: number } | null => {
  const match = /^item_(-?\d+)_(-?\d+)$/.exec(id);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
};

export const seededRandom = (seed: number, seedFactor: number) => {
  // Improved random function with better distribution
  const x = Math.sin(seed) * seedFactor;
  const y = Math.cos(seed * 0.5) * (seedFactor * 0.7);
  return x + y - Math.floor(x + y);
};

export type CellMetrics = {
  cellWidth: number;
  cellHeight: number;
  gapSize: number;
  staggerOffset: number;
};

export const findCenterGridSeat = (width: number, height: number, metrics: CellMetrics) => {
  const { cellWidth, cellHeight, gapSize, staggerOffset } = metrics;
  const strideX = cellWidth + gapSize;
  const strideY = cellHeight + gapSize;
  const idealCX = width / 2;
  const idealCY = height / 2;
  let originX = idealCX;
  let originY = idealCY;
  let originGX = 0;
  let originGY = 0;
  let bestDist = Infinity;
  const searchGX = Math.round(idealCX / strideX);
  const searchGY = Math.round(idealCY / strideY);
  for (let gx = searchGX - 3; gx <= searchGX + 3; gx++) {
    for (let gy = searchGY - 3; gy <= searchGY + 3; gy++) {
      const itemOffsetY = gx % 2 === 0 ? 0 : staggerOffset;
      const tx = gx * strideX + cellWidth / 2;
      const ty = gy * strideY + itemOffsetY + cellHeight / 2;
      const d = Math.hypot(tx - idealCX, ty - idealCY);
      if (d < bestDist) {
        bestDist = d;
        originX = tx;
        originY = ty;
        originGX = gx;
        originGY = gy;
      }
    }
  }
  return { originX, originY, originGX, originGY };
};

export const getCellWindowKey = (
  ox: number,
  oy: number,
  z: number,
  width: number,
  height: number,
  metrics: CellMetrics & { initialOffsetX: number; viewportPadding: number }
) => {
  const { cellWidth, cellHeight, gapSize, initialOffsetX, viewportPadding } = metrics;
  const strideX = (cellWidth + gapSize) * z;
  const strideY = (cellHeight + gapSize) * z;
  const startX = Math.floor((-ox + initialOffsetX) / strideX) - viewportPadding;
  const startY = Math.floor(-oy / strideY) - viewportPadding;
  const endX = Math.ceil((width - ox + initialOffsetX) / strideX) + viewportPadding;
  const endY = Math.ceil((height - oy) / strideY) + viewportPadding;
  return `${startX},${startY},${endX},${endY}`;
};

export const getItemPosition = (
  item: { x: number; y: number; offsetX: number; offsetY: number },
  metrics: Pick<CellMetrics, 'cellWidth' | 'cellHeight' | 'gapSize'>
) => ({
  x: item.x * (metrics.cellWidth + metrics.gapSize) + item.offsetX,
  y: item.y * (metrics.cellHeight + metrics.gapSize) + item.offsetY
});

export const getGridItemContentCenter = (
  item: { x: number; y: number; offsetX: number; offsetY: number },
  metrics: Pick<CellMetrics, 'cellWidth' | 'cellHeight' | 'gapSize'>
) => {
  const pos = getItemPosition(item, metrics);
  return {
    x: pos.x + metrics.cellWidth / 2,
    y: pos.y + metrics.cellHeight / 2
  };
};

export const getAdjacentWorks = (
  x: number,
  y: number,
  items: Map<string, GridItem>,
  radius: number = 2
) => {
  const adjacent: Work[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      const id = generateItemId(x + dx, y + dy);
      const neighbor = items.get(id);
      if (neighbor) adjacent.push(neighbor.work);
    }
  }
  return adjacent;
};

export const selectUniqueWork = ({
  x,
  y,
  adjacentWorks,
  works,
  excludedWorkKeys,
  seedFactor,
  workUsageCount
}: {
  x: number;
  y: number;
  adjacentWorks: Work[];
  works: Work[];
  excludedWorkKeys?: Set<string> | null;
  seedFactor: number;
  workUsageCount: Map<string, number>;
}) => {
  const seed = x * seedFactor + y * seedFactor * 0.7;
  const adjacentKeys = new Set(adjacentWorks.map(getWorkKey));

  const availableWorks = works.filter((work) => {
    const key = getWorkKey(work);
    if (excludedWorkKeys?.has(key)) return false;
    return !adjacentKeys.has(key);
  });

  const fallbackWorks = excludedWorkKeys?.size
    ? works.filter((work) => !excludedWorkKeys.has(getWorkKey(work)))
    : works;
  const candidateWorks =
    availableWorks.length > 0 ? availableWorks : fallbackWorks.length > 0 ? fallbackWorks : works;

  const weightedWorks = candidateWorks.map((work) => {
    const usageCount = workUsageCount.get(getWorkKey(work)) || 0;
    const descriptionSeed =
      typeof work.description === 'string' ? work.description.length : work.name.length;
    const randomWeight = seededRandom(seed + descriptionSeed, seedFactor);
    const weight = (1 / (usageCount + 1)) * (0.7 + randomWeight * 0.3);
    return { work, weight };
  });

  weightedWorks.sort((a, b) => b.weight - a.weight);

  const topCandidates = Math.min(3, weightedWorks.length);
  const randomIndex = Math.floor(seededRandom(seed, seedFactor) * topCandidates);
  const selectedWork = weightedWorks[randomIndex]?.work || weightedWorks[0]?.work || works[0];

  const selectedWorkKey = getWorkKey(selectedWork);
  workUsageCount.set(selectedWorkKey, (workUsageCount.get(selectedWorkKey) || 0) + 1);

  return selectedWork;
};

export const pinOriginCardAt = ({
  gx,
  gy,
  originCard,
  items,
  originCardIdRef,
  staggerOffset
}: {
  gx: number;
  gy: number;
  originCard: OriginCardConfig;
  items: Map<string, GridItem>;
  originCardIdRef: { current: string | null };
  staggerOffset: number;
}) => {
  const id = generateItemId(gx, gy);
  const prevId = originCardIdRef.current;
  if (prevId && prevId !== id) {
    items.delete(prevId);
  }
  const item: GridItem = {
    id,
    work: originCard.work,
    offsetX: 0,
    offsetY: gx % 2 === 0 ? 0 : staggerOffset,
    isOriginCard: true
  };
  items.set(id, item);
  originCardIdRef.current = id;
  return item;
};

const CUSTOM_CARD_MIN_DIST = 3;
const CUSTOM_CARD_MAX_DIST = 6;

/** Stable seeded seat in a ring around origin (Chebyshev distance 3–6). */
export const pickRandomCustomCardSeat = ({
  originGX,
  originGY,
  seedFactor,
  cardIndex,
  occupied
}: {
  originGX: number;
  originGY: number;
  seedFactor: number;
  cardIndex: number;
  occupied: Set<string>;
}) => {
  const candidates: { gx: number; gy: number }[] = [];
  for (let dx = -CUSTOM_CARD_MAX_DIST; dx <= CUSTOM_CARD_MAX_DIST; dx++) {
    for (let dy = -CUSTOM_CARD_MAX_DIST; dy <= CUSTOM_CARD_MAX_DIST; dy++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist < CUSTOM_CARD_MIN_DIST || dist > CUSTOM_CARD_MAX_DIST) continue;
      const gx = originGX + dx;
      const gy = originGY + dy;
      const id = generateItemId(gx, gy);
      if (occupied.has(id)) continue;
      candidates.push({ gx, gy });
    }
  }

  if (candidates.length === 0) {
    return { gx: originGX + CUSTOM_CARD_MIN_DIST, gy: originGY };
  }

  const t = seededRandom(seedFactor * 1.618 + cardIndex * 97.13 + 11.7, seedFactor);
  const idx = Math.floor(Math.abs(t) * candidates.length) % candidates.length;
  return candidates[idx]!;
};

export const pinCustomCardAt = ({
  gx,
  gy,
  customCard,
  items,
  customCardIdsRef,
  staggerOffset
}: {
  gx: number;
  gy: number;
  customCard: CustomCardConfig;
  items: Map<string, GridItem>;
  customCardIdsRef: { current: Map<string, string> };
  staggerOffset: number;
}) => {
  const id = generateItemId(gx, gy);
  const prevId = customCardIdsRef.current.get(customCard.id);
  if (prevId && prevId !== id) {
    const prev = items.get(prevId);
    if (prev?.customCardId === customCard.id) {
      items.delete(prevId);
    }
  }
  const item: GridItem = {
    id,
    work: customCard.work,
    offsetX: 0,
    offsetY: gx % 2 === 0 ? 0 : staggerOffset,
    customCardId: customCard.id
  };
  items.set(id, item);
  customCardIdsRef.current.set(customCard.id, id);
  return item;
};

/** Whether a grid seat can open / be landed on in focus mode */
export const isGridItemFocusable = (
  item: GridItem,
  originCard?: OriginCardConfig,
  customCards?: CustomCardConfig[]
) => {
  if (item.isOriginCard && originCard?.focusable === false) return false;
  if (item.customCardId) {
    const card = customCards?.find((c) => c.id === item.customCardId);
    if (card?.focusable === false) return false;
  }
  return true;
};

export type EnsureGridItemArgs = {
  x: number;
  y: number;
  items: Map<string, GridItem>;
  works: Work[];
  excludedWorkKeys?: Set<string> | null;
  seedFactor: number;
  workUsageCount: Map<string, number>;
  staggerOffset: number;
  originCard?: OriginCardConfig;
  originCardIdRef?: { current: string | null };
  customCards?: CustomCardConfig[];
  customCardIdsRef?: { current: Map<string, string> };
};

/**
 * Return the grid item at (x, y), creating it with the same rules as the visible window
 * when missing. Used by spatial focus prev/next so neighbors always exist.
 */
export const ensureGridItemAt = ({
  x,
  y,
  items,
  works,
  excludedWorkKeys,
  seedFactor,
  workUsageCount,
  staggerOffset,
  originCard,
  originCardIdRef,
  customCards,
  customCardIdsRef
}: EnsureGridItemArgs): GridItem & { x: number; y: number } => {
  const id = generateItemId(x, y);
  let item = items.get(id);

  if (!item && originCard && originCardIdRef?.current === id) {
    item = pinOriginCardAt({
      gx: x,
      gy: y,
      originCard,
      items,
      originCardIdRef,
      staggerOffset
    });
  }

  if (!item && customCardIdsRef) {
    let configId: string | undefined;
    for (const [cid, gridId] of customCardIdsRef.current) {
      if (gridId === id) {
        configId = cid;
        break;
      }
    }
    if (configId) {
      const card = customCards?.find((c) => c.id === configId);
      if (card) {
        item = pinCustomCardAt({
          gx: x,
          gy: y,
          customCard: card,
          items,
          customCardIdsRef,
          staggerOffset
        });
      }
    }
  }

  if (!item) {
    const adjacentWorks = getAdjacentWorks(x, y, items, 3);
    const selectedWork = selectUniqueWork({
      x,
      y,
      adjacentWorks,
      works,
      excludedWorkKeys,
      seedFactor,
      workUsageCount
    });
    item = {
      id,
      work: selectedWork,
      offsetX: 0,
      offsetY: x % 2 === 0 ? 0 : staggerOffset
    };
    items.set(id, item);
  }

  return { ...item, x, y };
};

/** Directly place a specific work at a seat, overwriting any procedural occupant. */
export const pinWorkAt = ({
  gx,
  gy,
  work,
  items,
  staggerOffset
}: {
  gx: number;
  gy: number;
  work: Work;
  items: Map<string, GridItem>;
  staggerOffset: number;
}): GridItem & { x: number; y: number } => {
  const id = generateItemId(gx, gy);
  const item: GridItem = {
    id,
    work,
    offsetX: 0,
    offsetY: gx % 2 === 0 ? 0 : staggerOffset
  };
  items.set(id, item);
  return { ...item, x: gx, y: gy };
};

/** Find an already-generated, non-special seat currently showing `work` (matched by name). */
export const findExistingSeatForWork = (
  items: Map<string, GridItem>,
  work: Work
): (GridItem & { x: number; y: number }) | null => {
  for (const [id, item] of items) {
    if (item.isOriginCard || item.customCardId) continue;
    if (item.work.name !== work.name) continue;
    const coords = parseGridCoords(id);
    if (!coords) continue;
    return { ...item, ...coords };
  }
  return null;
};

/**
 * Find (or force) a focusable seat for `work` — used by deep-link focus-by-slug.
 * Prefers an already-generated seat; otherwise pins the work into a nearby ring around
 * the origin card, overwriting whatever procedural work currently occupies it (never
 * displacing the origin seat itself or a pinned custom card).
 */
export const ensureSeatForWork = ({
  work,
  items,
  originCardIdRef,
  staggerOffset
}: {
  work: Work;
  items: Map<string, GridItem>;
  originCardIdRef?: { current: string | null };
  staggerOffset: number;
}): GridItem & { x: number; y: number } => {
  const existing = findExistingSeatForWork(items, work);
  if (existing) return existing;

  const originId = originCardIdRef?.current ?? null;
  const originCoords = originId ? parseGridCoords(originId) : null;
  const baseGX = originCoords?.x ?? 0;
  const baseGY = originCoords?.y ?? 0;

  const maxRadius = 12;
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const gx = baseGX + dx;
        const gy = baseGY + dy;
        const id = generateItemId(gx, gy);
        if (id === originId) continue;
        if (items.get(id)?.customCardId != null) continue;
        return pinWorkAt({ gx, gy, work, items, staggerOffset });
      }
    }
  }
  // Fallback — should not happen given the generous search radius
  return pinWorkAt({ gx: baseGX + maxRadius + 1, gy: baseGY, work, items, staggerOffset });
};

/**
 * Walk horizontally from a focused seat (±x, same y) until a focusable neighbor is found.
 * Prefers a different work than the current seat so the overlay always advances.
 * Creates missing cells along the way. No wrap — the grid is infinite.
 */
export const findHorizontalFocusNeighbor = ({
  fromId,
  direction,
  maxSteps = 24,
  ...ensureArgs
}: {
  fromId: string;
  direction: -1 | 1;
  maxSteps?: number;
} & Omit<EnsureGridItemArgs, 'x' | 'y'>): (GridItem & { x: number; y: number }) | null => {
  const coords = parseGridCoords(fromId);
  if (!coords) return null;

  const fromItem = ensureArgs.items.get(fromId);
  const fromKey = fromItem ? getWorkKey(fromItem.work) : null;
  let fallback: (GridItem & { x: number; y: number }) | null = null;

  for (let step = 1; step <= maxSteps; step++) {
    const cell = ensureGridItemAt({
      ...ensureArgs,
      x: coords.x + direction * step,
      y: coords.y
    });
    if (!isGridItemFocusable(cell, ensureArgs.originCard, ensureArgs.customCards)) continue;
    if (!fallback) fallback = cell;
    // Skip duplicate works so prev/next always changes overlay content (matches old gallery).
    if (fromKey && getWorkKey(cell.work) === fromKey) continue;
    return cell;
  }
  return fallback;
};
