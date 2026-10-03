// ============================================================
// Góc phụ huynh (trên máy của con): bài tập về nhà, thời gian luyện tập 7 ngày qua,
// tiến độ từng bài, từ con hay sai (bấm để nghe), hoạt động gần đây.
// Dữ liệu: kết quả lưu trên máy này + kết quả trên máy thầy cô (VD giờ luyện tập trên lớp)
// khi máy đang kết nối được.
// ============================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { books, getUnit } from '../../content';
import { api, checkServer } from '../../services/api';
import { deviceId, localResults, type ResultMode, type ResultRecord } from '../../services/results';
import { daysLeft, dueText, fmtDate, fmtGrade, gradeColor, localDate, useHomework } from '../../services/homework';
import { speak } from '../../services/speech';
import { useProgress } from '../../stores/progress';
import { rankOf } from '../../game/duel';
import { Button, TopBar, WordImage } from '../../components/ui';

const MODE_TEXT: Record<ResultMode, string> = {
  adventure: '🗺️ Phiêu lưu',
  'duel-bot': '🤖 Solo với máy',
  'duel-pvp': '⚔️ Solo với bạn',
  class: '🏫 Luyện tập trên lớp',
  homework: '📝 Bài tập về nhà',
};

const pct = (c: number, a: number) => (a ? Math.round((c / a) * 100) : 0);
const pctColor = (p: number) => (p >= 80 ? 'text-green-600' : p >= 50 ? 'text-amber-600' : 'text-rose-600');
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Kết quả của máy này: bản lưu trên máy + bản trên máy chủ (gộp theo id) */
function useDeviceResults() {
  const [list, setList] = useState<ResultRecord[]>(() => localResults());
  const [server, setServer] = useState<'checking' | 'ok' | 'off'>('checking');
  useEffect(() => {
    let alive = true;
    (async () => {
      const { ok } = await checkServer(true);
      const r = ok ? await api.deviceResults(deviceId()) : null;
      if (!alive) return;
      if (!r?.ok || !Array.isArray(r.data)) return setServer('off');
      const map = new Map<string, ResultRecord>();
      for (const x of [...localResults(), ...(r.data as ResultRecord[])]) map.set(x.id, x);
      setList([...map.values()].sort((a, b) => a.at.localeCompare(b.at)));
      setServer('ok');
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { list, server };
}

export function ParentPage() {
  const nav = useNavigate();
  const playerName = useProgress((s) => s.playerName);
  const { list: all, server } = useDeviceResults();

  // Máy dùng chung cho nhiều bé → chọn tên
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) if (r.player.trim()) m.set(r.player.trim().toLowerCase(), r.player.trim());
    if (playerName) m.set(playerName.toLowerCase(), playerName);
    return [...m.values()];
  }, [all, playerName]);
  const [child, setChild] = useState(playerName);
  const isMe = sameName(child, playerName);
  // Bản ghi chưa có tên (chơi trước khi đặt tên) tính cho tên đang dùng trên máy
  const list = all.filter((r) => sameName(r.player, child) || (isMe && !r.player.trim()));

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="👪 Góc phụ huynh" back="/" />
      <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-10 space-y-3">
        <div className="panel p-4 flex flex-wrap items-center gap-3">
          <div className="text-5xl">🧒</div>
          <div className="flex-1 min-w-[160px]">
            <div className="text-2xl font-extrabold text-sky-900">{child || 'Bé chưa đặt tên'}</div>
            <div className="text-sm font-bold text-slate-500">Kết quả học tập trên máy này{server === 'ok' ? ' và trên máy của thầy cô' : ''}</div>
          </div>
          {names.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {names.map((n) => (
                <Button key={n} color={sameName(n, child) ? 'blue' : 'white'} className="!py-1.5 !px-3 text-sm" onClick={() => setChild(n)}>
                  {n}
                </Button>
              ))}
            </div>
          )}
        </div>

        <Week list={list} />
        {isMe && <HomeworkBox />}
        {isMe && <Adventure />}
        {isMe && <Mistakes />}
        <Recent list={list} />

        <Section title="💡 Gợi ý cho phụ huynh">
          <ul className="list-disc pl-5 space-y-1 font-bold text-slate-600">
            <li>Mỗi ngày con chơi khoảng 15–20 phút là đủ. Học đều mỗi ngày tốt hơn học dồn.</li>
            <li>Ngồi cùng con ở mục <b>Từ con hay sai</b>: bấm 🔊 để nghe, cho con đọc theo và chỉ đồ vật thật quanh nhà.</li>
            <li>Khen con khi làm xong bài tập, kể cả khi điểm chưa cao. Con được làm lại bài để luyện thêm.</li>
            <li>Kết quả gửi về thầy cô khi máy dùng chung Wi-Fi với máy của thầy cô. Mất mạng thì kết quả được giữ lại và tự gửi sau.</li>
          </ul>
        </Section>
        <Button color="white" className="w-full" onClick={() => nav('/')}>
          🏠 Về trang chủ
        </Button>
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg sm:text-xl font-extrabold text-sky-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** 7 ngày qua: số câu mỗi ngày (cột) + tỉ lệ đúng */
function Week({ list }: { list: ResultRecord[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return localDate(d);
  });
  const per = days.map((day) => {
    const rs = list.filter((r) => localDate(new Date(r.at)) === day);
    return { day, games: rs.length, answered: rs.reduce((a, r) => a + r.answered, 0), correct: rs.reduce((a, r) => a + r.correct, 0) };
  });
  const answered = per.reduce((a, d) => a + d.answered, 0);
  const correct = per.reduce((a, d) => a + d.correct, 0);
  const active = per.filter((d) => d.games > 0).length;
  const max = Math.max(1, ...per.map((d) => d.answered));
  const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return (
    <Section title="📅 7 ngày qua">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile label="Ngày có học" value={`${active}/7`} />
        <Tile label="Câu đã trả lời" value={answered} />
        <Tile label="Tỉ lệ đúng" value={answered ? `${pct(correct, answered)}%` : '—'} cls={answered ? pctColor(pct(correct, answered)) : undefined} />
      </div>
      <div className="flex items-end gap-2 h-32 pt-2" aria-label="Số câu trả lời mỗi ngày">
        {per.map((d) => {
          const p = pct(d.correct, d.answered);
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${fmtDate(d.day)}: ${d.answered} câu, đúng ${p}%`}>
              <span className="text-xs font-extrabold text-slate-500 tabular-nums">{d.answered || ''}</span>
              <div className={`w-full rounded-t-lg ${d.answered ? (p >= 80 ? 'bg-green-400' : p >= 50 ? 'bg-amber-400' : 'bg-rose-400') : 'bg-slate-100'}`} style={{ height: `${d.answered ? Math.max(6, (d.answered / max) * 80) : 4}%` }} />
              <span className="text-xs font-extrabold text-slate-400">{wd[new Date(d.day + 'T12:00').getDay()]}</span>
            </div>
          );
        })}
      </div>
      <div className="text-xs font-bold text-slate-400">Màu cột: xanh = đúng từ 80%, vàng = 50–79%, đỏ = dưới 50%.</div>
    </Section>
  );
}

function Tile({ label, value, cls = 'text-sky-800' }: { label: string; value: ReactNode; cls?: string }) {
  return (
    <div className="rounded-2xl bg-sky-50 p-2">
      <div className="text-xs font-extrabold text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold ${cls}`}>{value}</div>
    </div>
  );
}

function HomeworkBox() {
  const list = useHomework((s) => s.list);
  const done = useHomework((s) => s.done);
  const rows = list.filter((h) => done[h.id] || !h.closed).sort((a, b) => b.due.localeCompare(a.due));
  return (
    <Section title="📝 Bài tập về nhà">
      {rows.length === 0 && <div className="font-bold text-slate-500">Chưa có bài tập nào được giao về máy này.</div>}
      <div className="space-y-1.5">
        {rows.slice(0, 12).map((h) => {
          const d = done[h.id];
          const late = !d && daysLeft(h.due) < 0;
          return (
            <div key={h.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2" data-testid="parent-hw">
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-slate-800 truncate">{h.title}</div>
                <div className="text-xs font-bold text-slate-500 truncate">
                  {h.unit} · hạn {fmtDate(h.due)}
                </div>
              </div>
              {d ? (
                <div className="text-right">
                  <div className={`text-xl font-extrabold ${gradeColor(d.first)}`}>{fmtGrade(d.first)} điểm</div>
                  <div className="text-xs font-bold text-slate-500">
                    {d.late ? 'nộp muộn' : 'đúng hạn'}
                    {d.attempts > 1 ? ` · làm ${d.attempts} lần, cao nhất ${fmtGrade(d.best)}` : ''}
                  </div>
                </div>
              ) : (
                <span className={`rounded-lg px-2 py-1 text-sm font-extrabold ${late ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>{late ? '⚠️ Chưa làm · quá hạn' : `⏳ Chưa làm · ${dueText(h.due).toLowerCase()}`}</span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Adventure() {
  const units = useProgress((s) => s.units);
  const gold = useProgress((s) => s.gold);
  const gems = useProgress((s) => s.gems.length);
  const rp = useProgress((s) => s.duel.rp);
  const rows = books.flatMap((b) => b.grades.flatMap((g) => g.units.map((u) => ({ u, label: `${b.name} · ${g.name}`, stars: (units[u.id]?.stars ?? []).reduce((a, x) => a + x, 0) })))).filter((x) => x.stars > 0);
  return (
    <Section title="🗺️ Tiến độ bài học" right={<span className="text-sm font-extrabold text-slate-500">🪙 {gold} · 💎 {gems}/7 · Rank {rankOf(rp).name}</span>}>
      {rows.length === 0 && <div className="font-bold text-slate-500">Con chưa qua màn phiêu lưu nào.</div>}
      <div className="space-y-1.5">
        {rows.map(({ u, label, stars }) => (
          <div key={u.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-slate-800 truncate">
                Unit {u.number}: {u.title} <span className="font-bold text-slate-500">– {u.titleVi}</span>
              </div>
              <div className="text-xs font-bold text-slate-400 truncate">{label}</div>
            </div>
            <div className="w-28 h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${(stars / 15) * 100}%` }} />
            </div>
            <span className="w-14 text-right text-sm font-extrabold text-amber-600 tabular-nums">⭐{stars}/15</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Từ / mẫu câu hay sai (đếm trên máy này) */
function Mistakes() {
  const mistakes = useProgress((s) => s.mistakes);
  const rows = Object.entries(mistakes)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => {
      const [unitId, itemId] = key.split('/');
      const u = getUnit(unitId);
      const v = u?.vocab.find((x) => x.id === itemId);
      if (v) return { key, n, en: v.en, vi: v.vi, image: v.image ?? null, audio: v.audio ?? null };
      const p = u?.patterns.find((x) => x.id === itemId);
      if (p) return { key, n, en: `${p.q} ${p.a}`, vi: p.vi, image: p.image ?? null, audio: null };
      return null;
    })
    .filter((x) => x !== null)
    .slice(0, 12);
  return (
    <Section title="🔁 Từ con hay sai">
      {rows.length === 0 ? (
        <div className="font-bold text-green-600">Chưa có từ nào bị sai 🎉</div>
      ) : (
        <>
          <div className="text-sm font-bold text-slate-500">Bấm vào từ để nghe phát âm, cho con đọc theo.</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {rows.map((w) => (
              <button key={w.key} onClick={() => speak(w.en, w.audio)} className="flex items-center gap-2 rounded-xl border-2 border-rose-100 bg-rose-50 px-2 py-1.5 text-left active:scale-95 transition">
                <span className="h-9 w-9 grid place-items-center shrink-0">{w.image ? <WordImage src={w.image} className="h-8 w-8 text-2xl" /> : '🔊'}</span>
                <span className="flex-1 min-w-0">
                  <b className="block truncate text-sky-700">{w.en}</b>
                  <span className="block truncate text-xs font-bold text-slate-500">{w.vi}</span>
                </span>
                <span className="text-sm font-extrabold text-rose-500">×{w.n}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function Recent({ list }: { list: ResultRecord[] }) {
  const rows = [...list].reverse().slice(0, 12);
  return (
    <Section title="🕘 Hoạt động gần đây">
      {rows.length === 0 && <div className="font-bold text-slate-500">Chưa có hoạt động nào.</div>}
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const p = pct(r.correct, r.answered);
          return (
            <div key={r.id} className="flex items-center gap-2 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-slate-800 truncate">
                  {MODE_TEXT[r.mode] ?? r.mode}
                  {r.mode === 'homework' && r.grade !== undefined && <span className={`ml-1 ${gradeColor(r.grade)}`}>· {fmtGrade(r.grade)} điểm</span>}
                  {r.mode === 'class' && r.place && <span className="ml-1 text-amber-600">· hạng {r.place}</span>}
                </div>
                <div className="text-xs font-bold text-slate-500 truncate">
                  {new Date(r.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} · {r.unit}
                </div>
              </div>
              <span className={`text-sm font-extrabold tabular-nums ${pctColor(p)}`}>
                {r.correct}/{r.answered} đúng
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
