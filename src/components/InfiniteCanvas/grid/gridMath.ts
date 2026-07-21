import type { GridItem, OriginCardConfig, Work } from '../types';

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
  const seen = new Set<string>();
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      const distance = Math.abs(dx) + Math.abs(dy);
      if (distance > radius) continue;
      const id = generateItemId(x + dx, y + dy);
      const item = items.get(id);
      if (item?.work && !seen.has(getWorkKey(item.work))) {
        adjacent.push(item.work);
        seen.add(getWorkKey(item.work));
      }
    }
  }
  return adjacent;
};

export const selectUniqueWork = ({
  x,
  y,
  adjacentWorks,
  works,
  originCardKey,
  seedFactor,
  workUsageCount
}: {
  x: number;
  y: number;
  adjacentWorks: Work[];
  works: Work[];
  originCardKey: string | null;
  seedFactor: number;
  workUsageCount: Map<string, number>;
}) => {
  const seed = x * seedFactor + y * seedFactor * 0.7;
  const adjacentKeys = new Set(adjacentWorks.map(getWorkKey));

  const availableWorks = works.filter((work) => {
    const key = getWorkKey(work);
    if (originCardKey && key === originCardKey) return false;
    return !adjacentKeys.has(key);
  });

  const fallbackWorks = originCardKey
    ? works.filter((work) => getWorkKey(work) !== originCardKey)
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
