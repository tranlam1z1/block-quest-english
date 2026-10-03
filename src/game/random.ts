// Các hàm ngẫu nhiên dùng chung

/** Trộn mảng (Fisher–Yates), trả về mảng mới */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Trộn có trọng số: phần tử trọng số cao có xu hướng đứng trước */
export function weightedShuffle<T>(items: readonly T[], weight: (x: T) => number): T[] {
  return items
    .map((x) => ({ x, key: Math.pow(Math.random(), 1 / Math.max(weight(x), 0.0001)) }))
    .sort((a, b) => b.key - a.key)
    .map((e) => e.x);
}

let counter = 0;
/** Sinh id duy nhất trong phiên chơi */
export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
