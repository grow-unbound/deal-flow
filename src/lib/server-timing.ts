export function createTimer() {
  const start = performance.now();

  return {
    elapsedMs(): number {
      return Math.max(0, performance.now() - start);
    },
    header(metric = 'total'): string {
      return `${metric};dur=${Math.max(0.1, this.elapsedMs()).toFixed(1)}`;
    },
  };
}
