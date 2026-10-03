// ============================================================
// Nhập tên hiển thị trên bảng xếp hạng
// ============================================================
import { useState } from 'react';
import { useProgress } from '../stores/progress';
import { Button, Modal } from './ui';

export function PlayerNameModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const current = useProgress((s) => s.playerName);
  const setName = useProgress((s) => s.setPlayerName);
  const [value, setValue] = useState(current);
  if (!open) return null;
  const ok = value.trim().length > 0;
  const save = () => {
    if (!ok) return;
    setName(value);
    onClose();
    onSaved?.();
  };
  return (
    <Modal open onClose={onClose} title="✏️ Tên của bạn">
      <p className="font-bold text-slate-600 mb-2">Tên này hiện trên bảng xếp hạng và giúp thầy cô xem kết quả học của em.</p>
      <input
        autoFocus
        value={value}
        maxLength={16}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="VD: Minh Anh"
        className="w-full rounded-2xl border-4 border-sky-200 px-4 py-3 text-2xl font-extrabold text-sky-900 outline-none focus:border-sky-400"
      />
      <Button className="w-full mt-4 text-xl" disabled={!ok} onClick={save}>
        Lưu tên
      </Button>
    </Modal>
  );
}
