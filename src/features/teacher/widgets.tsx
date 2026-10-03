// ============================================================
// Thành phần nhỏ dùng chung trong Khu vực giáo viên
// ============================================================
import type { ReactNode } from 'react';
import type { Issue } from '../../content/validate';

export function SaveStatus({ status }: { status: { kind: 'idle' | 'saving' | 'ok' | 'error'; text?: string } }) {
  if (status.kind === 'idle') return null;
  const cls = status.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-700' : status.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-700';
  return (
    <div role="status" className={`rounded-2xl border-2 p-3 font-bold ${cls}`}>
      {status.kind === 'saving' ? '⏳ Đang lưu…' : status.kind === 'ok' ? `✅ ${status.text}` : `❌ ${status.text ?? 'Không lưu được'}`}
    </div>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-extrabold text-slate-500">{label}</span>
      {children}
      {hint && <span className="block text-xs font-bold text-slate-400">{hint}</span>}
    </label>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-1 max-h-48 overflow-y-auto">
      {issues.map((x, i) => (
        <li key={i} className={`rounded-lg px-2 py-1 text-sm font-bold ${x.level === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
          {x.level === 'error' ? '❌' : '⚠️'} {x.msg}
        </li>
      ))}
    </ul>
  );
}

/** Màu theo tỉ lệ đúng */
export function pctClass(pct: number) {
  return pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600';
}
