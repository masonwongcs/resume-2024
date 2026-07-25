'use client';

import { useEffect, useState } from 'react';

/**
 * Compact Cover Flow / playlist layout (inline player, no flip overlay).
 *
 * - Phones (narrow, or short landscape): compact
 * - Portrait tablets (coarse pointer): compact
 * - Landscape tablets: desktop flip → floating playlist
 */
export const COVER_FLOW_COMPACT_MQ =
  '(max-width: 480px), ((pointer: coarse) and (orientation: portrait)), ((pointer: coarse) and (max-height: 600px))';

export const useIsCoverFlowCompact = () => {
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(COVER_FLOW_COMPACT_MQ).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(COVER_FLOW_COMPACT_MQ);
    const apply = () => setCompact(mql.matches);
    apply();
    mql.addEventListener?.('change', apply);
    return () => mql.removeEventListener?.('change', apply);
  }, []);

  return compact;
};
