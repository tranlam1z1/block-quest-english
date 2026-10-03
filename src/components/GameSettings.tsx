// ============================================================
// Bảng cài đặt trước trận: bật/tắt dạng câu hỏi, thời gian mỗi câu, âm thanh
// ============================================================
import { CATEGORY_LABEL, QUESTION_TYPES } from '../game/questions/types';
import { speechSupported } from '../services/speech';
import { TIMER_OPTIONS, useSettings } from '../stores/settings';
import { Button } from './ui';

export function GameSettings() {
  const s = useSettings();
  const noSpeech = !speechSupported();
  return (
    <div className="space-y-5">
      <section>
        <h3 className="font-extrabold text-sky-900 mb-2">⏱️ Thời gian mỗi câu</h3>
        <div className="grid grid-cols-4 gap-2">
          {TIMER_OPTIONS.map((sec) => (
            <Button key={sec} color={s.timerSec === sec ? 'blue' : 'white'} className="!px-2" onClick={() => s.setTimer(sec)}>
              {sec}s
            </Button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-extrabold text-sky-900">📝 Dạng câu hỏi</h3>
          <div className="flex gap-1">
            <button className="text-sm font-bold text-sky-600 underline px-1" onClick={() => s.setAllTypes(true)}>
              Bật tất cả
            </button>
          </div>
        </div>
        {(['vocab', 'pattern'] as const).map((cat) => (
          <div key={cat} className="mb-3">
            <div className="text-sm font-extrabold text-slate-500 mb-1">{CATEGORY_LABEL[cat]}</div>
            <div className="space-y-2">
              {QUESTION_TYPES.filter((t) => t.category === cat).map((t) => {
                const on = s.enabledTypes[t.id];
                const disabled = noSpeech && t.needsAudio;
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 cursor-pointer ${on ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'} ${disabled ? 'opacity-50' : ''}`}
                  >
                    <input type="checkbox" className="h-6 w-6 accent-green-500" checked={on} onChange={() => s.toggleType(t.id)} />
                    <span className="text-xl">{t.icon}</span>
                    <span className="flex-1 font-bold">{t.label}</span>
                    <span className="text-xs font-bold text-slate-400">{'★'.repeat(t.difficulty)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {noSpeech && <p className="mt-2 text-sm text-rose-600 font-bold">Trình duyệt này không hỗ trợ đọc phát âm, dạng câu "Nghe" sẽ được bỏ qua.</p>}
        <p className="mt-2 text-xs text-slate-500">Phải bật ít nhất 1 dạng. ★ = độ khó; quái càng mạnh càng hay ra câu khó.</p>
      </section>

      <section>
        <h3 className="font-extrabold text-sky-900 mb-2">🔊 Âm thanh</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button color={s.musicOn ? 'green' : 'gray'} onClick={s.toggleMusic}>
            {s.musicOn ? '🎵 Nhạc: Bật' : '🔇 Nhạc: Tắt'}
          </Button>
          <Button color={s.sfxOn ? 'green' : 'gray'} onClick={s.toggleSfx}>
            {s.sfxOn ? '🔊 Hiệu ứng: Bật' : '🔈 Hiệu ứng: Tắt'}
          </Button>
        </div>
      </section>
    </div>
  );
}
