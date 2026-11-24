'use client';

import React from 'react';
import { DynastyValueSource } from '@/lib/types/mba';

/**
 * Subtle provenance badge rendered beside Dynasty Value when a player's score
 * relies on a multi-season/projected baseline or small-sample blend (< 10 GP).
 */
export function DynastyValueEstBadge({
  source,
  basisNote,
}: {
  source?: DynastyValueSource;
  basisNote?: string | null;
}) {
  if (source !== 'BASELINE_ESTIMATE' && source !== 'SMALL_SAMPLE_BLENDED') {
    return null;
  }

  return (
    <span
      title={basisNote ?? undefined}
      className="cursor-help rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-300/90"
    >
      Est.
    </span>
  );
}
