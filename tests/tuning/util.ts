export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function report(game: string, task: string, medianS: number, correctRate: number, wrongFailRate: number): void {
  console.log(
    `[tune] ${game} · ${task}: correct median ${medianS.toFixed(1)} s, correct finishes ${(correctRate * 100).toFixed(0)}%, wrong strategy fails ${(wrongFailRate * 100).toFixed(0)}%`,
  );
}
