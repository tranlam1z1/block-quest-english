// ============================================================
// Kiểm tra dữ liệu bài học: chạy `npm run check-content`
// - Mỗi unit phải sinh được ít nhất 20 câu hỏi
// - Không trùng id, không trùng từ, đủ từ để làm đáp án nhiễu
// ============================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/content/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TYPES = [
  { id: 'img-vi', image: true },
  { id: 'img-en', image: true },
  { id: 'listen-vi' },
  { id: 'listen-en' },
  { id: 'en-vi' },
  { id: 'vi-en' },
];

let errors = 0;
const fail = (msg) => {
  errors++;
  console.log('  ❌ ' + msg);
};

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const units = walk(ROOT).filter((f) => /unit-\d+\.json$/.test(f));
for (const file of units) {
  const u = JSON.parse(readFileSync(file, 'utf8'));
  let possible = 0;
  for (const v of u.vocab) for (const t of TYPES) if (!t.image || v.image) possible++;
  // Mẫu câu: 1 câu "chọn câu trả lời" + câu "sắp xếp" (câu ≥ 3 từ) + câu "điền từ" (mỗi từ đục lỗ)
  let patternQ = 0;
  for (const p of u.patterns) {
    patternQ += 1;
    for (const s of [p.q, p.a]) if (s.replace(/[.?!]+$/, '').split(/\s+/).length >= 3) patternQ++;
    for (const b of p.blanks ?? []) {
      const w = typeof b === 'string' ? b : b.w;
      const found = [p.q, p.a].some((s) => s.split(/\s+/).some((t) => t.toLowerCase().replace(/[.,?!]/g, '') === w.toLowerCase()));
      if (!found) fail(`Mẫu câu ${p.id}: không tìm thấy từ "${w}" để đục lỗ`);
      else patternQ++;
      if (typeof b !== 'string' && b.wrong.length < 3) fail(`Mẫu câu ${p.id}: từ "${w}" cần ít nhất 3 đáp án nhiễu`);
    }
    if (!p.vi.includes(' – ')) fail(`Mẫu câu ${p.id}: nghĩa tiếng Việt phải có dạng "hỏi – đáp"`);
  }
  console.log(`${u.id} (${u.title}): ${u.vocab.length} từ, ${u.patterns.length} mẫu câu → ${possible} câu từ vựng + ${patternQ} câu mẫu câu`);

  if (possible + patternQ < 20) fail('Ít hơn 20 câu hỏi');
  if (u.patterns.length < 4) fail('Cần ít nhất 4 mẫu câu để có đủ đáp án nhiễu cho dạng "chọn câu trả lời"');
  const ids = new Set();
  const ens = new Set();
  for (const v of u.vocab) {
    if (ids.has(v.id)) fail(`Trùng id: ${v.id}`);
    if (ens.has(v.en.toLowerCase())) fail(`Trùng từ: ${v.en}`);
    ids.add(v.id);
    ens.add(v.en.toLowerCase());
    if (!v.en || !v.vi) fail(`Thiếu en/vi: ${v.id}`);
    // Đếm số từ có thể làm đáp án nhiễu cho từ này
    const others = u.vocab.filter((o) => o.id !== v.id && !(v.group && o.group === v.group));
    if (others.length < 3) fail(`Không đủ đáp án nhiễu cho: ${v.en}`);
  }
  const imgs = u.vocab.filter((v) => v.image).map((v) => v.image);
  if (new Set(imgs).size !== imgs.length) fail('Có 2 từ dùng chung một hình');
}

console.log(errors ? `\n${errors} lỗi.` : `\n✅ ${units.length} unit hợp lệ.`);
process.exit(errors ? 1 : 0);
