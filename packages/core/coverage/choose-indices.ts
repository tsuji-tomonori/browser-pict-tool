export function chooseIndices(size: number, choose: number): number[][] {
  const results: number[][] = [];
  const current: number[] = [];

  const walk = (start: number): void => {
    if (current.length === choose) {
      results.push([...current]);
      return;
    }

    for (let index = start; index < size; index += 1) {
      current.push(index);
      walk(index + 1);
      current.pop();
    }
  };

  walk(0);
  return results;
}
