import {
  aiStickers,
  backendStickers,
  devopsSticker,
  frontEndStickers,
  softSkillSticker
} from './Info.fixture';

export type StickerItem = {
  src: string;
  alt: string;
};

export const ALL_STICKERS: StickerItem[] = [
  ...frontEndStickers,
  ...backendStickers,
  ...devopsSticker,
  ...aiStickers,
  ...softSkillSticker
].reduce((acc, sticker) => {
  if (!acc.some((item) => item.src === sticker.src)) {
    acc.push({ src: sticker.src, alt: sticker.alt });
  }

  return acc;
}, [] as StickerItem[]);
