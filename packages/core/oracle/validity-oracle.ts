export interface ValidityOracle {
  canComplete(partial: ReadonlyMap<number, number>): boolean;
  feasibleValues(partial: ReadonlyMap<number, number>, parameterIndex: number): number[];
  completeRow(partial: ReadonlyMap<number, number>): number[] | null;
  stats?(): { memoHits: number; memoMisses: number; memoSize: number };
}
