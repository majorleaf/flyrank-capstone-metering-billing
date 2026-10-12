export interface Period {
  readonly start: Date;
  readonly end: Date; 
}

export function utcMonthBounds(now: Date): Period {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
}