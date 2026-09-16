export type HistoryEntry = { kind?: string };

export function clampHistoryStep(historyLength: number, step: number) {
  return Math.max(0, Math.min(step, historyLength));
}

export function lastClearIndex(history: HistoryEntry[], step: number) {
  const safeStep = clampHistoryStep(history.length, step);
  for (let i = safeStep - 1; i >= 0; i--) {
    if (history[i].kind === 'clear_all') return i;
  }
  return -1;
}

export function isHistoryItemVisible(history: HistoryEntry[], itemIndex: number, step: number) {
  const safeStep = clampHistoryStep(history.length, step);
  return itemIndex < safeStep
    && itemIndex > lastClearIndex(history, safeStep)
    && history[itemIndex].kind !== 'clear_all';
}
