import { useMemo, type RefObject } from 'react';

import {
  findCenterGridSeat,
  generateItemId,
  getAdjacentWorks,
  parseGridCoords,
  pickRandomCustomCardSeat,
  pinCustomCardAt,
  pinOriginCardAt,
  selectUniqueWork
} from './gridMath';
import type { CustomCardConfig, GridItem, OriginCardConfig, Work } from '../types';

type UseVisibleGridItemsArgs = {
  outerContainerRef: RefObject<HTMLDivElement | null>;
  itemsRef: RefObject<Map<string, GridItem>>;
  workUsageCountRef: RefObject<Map<string, number>>;
  originCardIdRef: RefObject<string | null>;
  customCardIdsRef: RefObject<Map<string, string>>;
  offset: { x: number; y: number };
  zoom: number;
  works: Work[];
  originCard?: OriginCardConfig;
  originCardKey: string | null;
  customCards?: CustomCardConfig[];
  excludedWorkKeys: Set<string>;
  seedFactor: number;
  cellWidth: number;
  cellHeight: number;
  gapSize: number;
  staggerOffset: number;
  initialOffsetX: number;
  viewportPadding: number;
};

export const useVisibleGridItems = ({
  outerContainerRef,
  itemsRef,
  workUsageCountRef,
  originCardIdRef,
  customCardIdsRef,
  offset,
  zoom,
  works,
  originCard,
  originCardKey,
  customCards,
  excludedWorkKeys,
  seedFactor,
  cellWidth,
  cellHeight,
  gapSize,
  staggerOffset,
  initialOffsetX,
  viewportPadding
}: UseVisibleGridItemsArgs) => {
  const metrics = { cellWidth, cellHeight, gapSize, staggerOffset };

  return useMemo(() => {
    if (!outerContainerRef.current) return [];
    const { width, height } = outerContainerRef.current.getBoundingClientRect();

    // Pin the custom center card as soon as we have a viewport (avoids a wrong-work flash)
    if (originCard && !originCardIdRef.current && width > 0 && height > 0) {
      const { originGX, originGY } = findCenterGridSeat(width, height, metrics);
      pinOriginCardAt({
        gx: originGX,
        gy: originGY,
        originCard,
        items: itemsRef.current,
        originCardIdRef,
        staggerOffset
      });
    }

    // Pin random-seat custom cards once (stable across pan/cull)
    if (customCards?.length && width > 0 && height > 0) {
      let originGX = 0;
      let originGY = 0;
      const originId = originCardIdRef.current;
      const originCoords = originId ? parseGridCoords(originId) : null;
      if (originCoords) {
        originGX = originCoords.x;
        originGY = originCoords.y;
      } else {
        const seat = findCenterGridSeat(width, height, metrics);
        originGX = seat.originGX;
        originGY = seat.originGY;
      }

      const occupied = new Set<string>();
      if (originId) occupied.add(originId);
      for (const id of customCardIdsRef.current.values()) occupied.add(id);

      customCards.forEach((card, cardIndex) => {
        if (card.placement === 'origin') return;
        if (customCardIdsRef.current.has(card.id)) return;
        const { gx, gy } = pickRandomCustomCardSeat({
          originGX,
          originGY,
          seedFactor,
          cardIndex,
          occupied
        });
        const pinned = pinCustomCardAt({
          gx,
          gy,
          customCard: card,
          items: itemsRef.current,
          customCardIdsRef,
          staggerOffset
        });
        occupied.add(pinned.id);
      });
    }

    const customGridIdToConfigId = new Map<string, string>();
    for (const [configId, gridId] of customCardIdsRef.current) {
      customGridIdToConfigId.set(gridId, configId);
    }
    const customCardById = new Map((customCards ?? []).map((card) => [card.id, card]));

    const startX =
      Math.floor((-offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) - viewportPadding;
    const startY =
      Math.floor(-offset.y / ((cellHeight + gapSize) * zoom)) - viewportPadding;
    const endX =
      Math.ceil((width - offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) +
      viewportPadding;
    const endY =
      Math.ceil((height - offset.y) / ((cellHeight + gapSize) * zoom)) + viewportPadding;

    const items: (GridItem & { x: number; y: number })[] = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const id = generateItemId(x, y);
        let item = itemsRef.current.get(id);
        if (!item) {
          if (originCard && originCardIdRef.current === id) {
            item = pinOriginCardAt({
              gx: x,
              gy: y,
              originCard,
              items: itemsRef.current,
              originCardIdRef,
              staggerOffset
            });
          } else if (customGridIdToConfigId.has(id)) {
            const configId = customGridIdToConfigId.get(id)!;
            const card = customCardById.get(configId);
            if (card) {
              item = pinCustomCardAt({
                gx: x,
                gy: y,
                customCard: card,
                items: itemsRef.current,
                customCardIdsRef,
                staggerOffset
              });
            }
          }

          if (!item) {
            const adjacentWorks = getAdjacentWorks(x, y, itemsRef.current, 3);
            const selectedWork = selectUniqueWork({
              x,
              y,
              adjacentWorks,
              works,
              excludedWorkKeys,
              seedFactor,
              workUsageCount: workUsageCountRef.current
            });
            item = {
              id,
              work: selectedWork,
              offsetX: 0,
              offsetY: x % 2 === 0 ? 0 : staggerOffset
            };
            itemsRef.current.set(id, item);
          }
        }
        items.push({ ...item, x, y });
      }
    }

    // Periodically reset usage counts to allow for long-term variety
    if (items.length > works.length * 2) {
      workUsageCountRef.current.clear();
    }

    return items;
    // metrics fields listed individually for exhaustive-deps clarity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    offset,
    zoom,
    works,
    initialOffsetX,
    originCard,
    originCardKey,
    customCards,
    excludedWorkKeys,
    seedFactor,
    cellWidth,
    cellHeight,
    gapSize,
    staggerOffset,
    viewportPadding,
    findCenterGridSeat,
    outerContainerRef,
    itemsRef,
    workUsageCountRef,
    originCardIdRef,
    customCardIdsRef
  ]);
};
