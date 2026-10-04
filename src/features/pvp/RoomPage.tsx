// ============================================================
// Phòng solo với bạn: sảnh chờ (mã phòng, 2 người chơi, bài học) → trận đấu → kết quả
// ============================================================
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { describeSelection, getUnit } from '../../content';
import { rankOf } from '../../game/duel';
import type { PeerInfo } from '../../net/transport';
import { stopSpeaking } from '../../services/speech';
import { useBattle } from '../../stores/battle';
import { PVP_EMOTES } from '../../stores/emotes';
import { useProgress } from '../../stores/progress';
import { useRoom } from '../../stores/room';
import { Button, Modal, SoundToggles, TopBar } from '../../components/ui';
import { RankIcon } from '../../components/rank';
import { PlayerNameModal } from '../../components/PlayerName';
import { UnitPicker } from '../../components/UnitPicker';
import { QuestionPanel } from '../battle/QuestionPanel';
import { DuelHud, DuelResult, DuelScene } from '../duel/DuelPage';
import { OfflineNotice, roomKind } from './PvpHomePage';

// React StrictMode gắn/gỡ component 2 lần khi phát triển → chỉ rời phòng khi trang thật sự đóng
let mounted = 0;

export function RoomPage() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const status = useRoom((s) => s.status);
  const roomCode = useRoom((s) => s.code);
  const matchId = useRoom((s) => s.matchId);
  const inMatch = useBattle((s) => !!matchId && s.duel?.remote === true && s.duel.matchId === matchId && !s.duel.aborted);
  const aborted = useBattle((s) => !!matchId && s.duel?.matchId === matchId && s.duel.aborted);
  const playerName = useProgress((s) => s.playerName);
  const [nameOpen, setNameOpen] = useState(false);

  // Mở link phòng trực tiếp (hoặc tải lại trang) → vào phòng với vai khách
  useEffect(() => {
    if (!/^\d{6}$/.test(code)) {
      nav('/pvp', { replace: true });
      return;
    }
    const s = useRoom.getState();
    if (s.status !== 'idle' && s.code === code) return;
    if (!useProgress.getState().playerName) setNameOpen(true);
    else s.join(code, roomKind());
  }, [code, nav]);

  useEffect(() => {
    mounted++;
    return () => {
      mounted--;
      setTimeout(() => {
        if (mounted === 0) {
          useRoom.getState().leave();
          stopSpeaking();
        }
      }, 0);
    };
  }, []);

  if (nameOpen || (!playerName && status === 'idle'))
    return (
      <PlayerNameModal
        open
        onClose={() => nav('/pvp')}
        onSaved={() => {
          setNameOpen(false);
          useRoom.getState().join(code, roomKind());
        }}
      />
    );

  if (aborted) return <AbortedModal />;
  if (inMatch && roomCode === code) return <MatchView />;
  return <Lobby code={code} />;
}

// ---------------- Sảnh chờ ----------------

function Lobby({ code }: { code: string }) {
  const nav = useNavigate();
  const s = useRoom();
  const [pickOpen, setPickOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);
  const unit = getUnit(s.unitId);
  const desc = unit ? describeSelection({ bookId: unit.bookId, gradeId: unit.gradeId, unitId: unit.id }) : null;
  const isHost = s.role === 'host';

  // Khách chờ quá 6 giây mà chưa thấy chủ phòng → có thể nhập sai mã
  useEffect(() => {
    setWaitedLong(false);
    if (isHost || s.opponent || s.status !== 'lobby') return;
    const t = setTimeout(() => setWaitedLong(true), 6000);
    return () => clearTimeout(t);
  }, [isHost, s.opponent, s.status]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/pvp/room/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* trình duyệt không cho chép */
    }
  };

  const leave = () => nav('/pvp');
  // Kết nối lại cùng mã phòng (chủ phòng giữ vai chủ phòng)
  const retry = () => (isHost ? s.recreate() : s.join(code, roomKind()));

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title={isHost ? '🏠 Phòng của bạn' : '🚪 Vào phòng'} back={leave} />
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-8 space-y-4">
        <OfflineNotice />

        {/* Mã phòng */}
        <div className="panel p-4 text-center">
          <div className="text-sm font-extrabold text-slate-400">MÃ PHÒNG</div>
          <div className="mt-1 flex justify-center gap-1.5 sm:gap-2" data-testid="room-code">
            {code.split('').map((d, i) => (
              <span key={i} className="grid h-14 w-11 sm:h-16 sm:w-12 place-items-center rounded-xl border-b-4 border-sky-700 bg-sky-500 text-3xl sm:text-4xl font-extrabold text-white">
                {d}
              </span>
            ))}
          </div>
          {isHost && <p className="mt-2 text-sm font-bold text-slate-500">Đọc mã này cho bạn của em, bạn ấy chọn "Vào phòng" rồi nhập mã.</p>}
          <button onClick={copyLink} className="mt-1 text-sm font-extrabold text-sky-600 underline">
            {copied ? '✅ Đã chép link phòng' : '🔗 Chép link phòng'}
          </button>
        </div>

        {s.status === 'connecting' && <Info>⏳ Đang kết nối…</Info>}
        {s.status === 'error' && (
          <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 font-bold text-rose-700">
            ❌ Không kết nối được máy chủ. Kiểm tra mạng Internet rồi thử lại.
            <div className="text-xs opacity-70">{s.error}</div>
            <Button color="red" className="mt-2" onClick={retry}>
              🔁 Thử lại
            </Button>
          </div>
        )}
        {s.full && <Info tone="red">🚫 Phòng này đã đủ 2 người. Hãy tạo phòng khác nhé!</Info>}

        {/* Người chơi */}
        {s.status === 'lobby' && !s.full && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {s.me && <PlayerCard p={s.me} me />}
            <span className="text-2xl font-extrabold text-rose-500">VS</span>
            {s.opponent ? (
              <PlayerCard p={s.opponent} />
            ) : (
              <div className="panel h-full p-3 grid place-items-center text-center text-sm font-bold text-slate-400 animate-pulse">
                <div>
                  <div className="text-4xl">⏳</div>
                  {isHost ? 'Đang chờ bạn vào phòng…' : 'Đang tìm phòng…'}
                </div>
              </div>
            )}
          </div>
        )}
        {s.opponentLeft && !s.opponent && <Info tone="amber">👋 Bạn kia đã rời phòng. Chờ người khác vào nhé!</Info>}
        {waitedLong && <Info tone="amber">🤔 Chưa thấy phòng {code}. Kiểm tra lại mã phòng, hoặc nhờ bạn tạo phòng trước nhé!</Info>}

        {/* Bài học */}
        {s.status === 'lobby' && !s.full && (isHost || s.opponent) && (
          <div className="panel p-4">
            <div className="text-sm font-extrabold text-slate-400">Bài học {isHost ? '' : '(chủ phòng chọn)'}</div>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xl font-extrabold text-slate-800 truncate">{desc?.unit ?? '…'}</div>
                <div className="text-sm font-bold text-slate-500 truncate">{desc ? `${desc.book} · ${desc.grade} · ${unit!.titleVi}` : ''}</div>
              </div>
              {isHost && (
                <Button color="white" onClick={() => setPickOpen(true)}>
                  Đổi bài
                </Button>
              )}
            </div>
          </div>
        )}

        {s.status === 'lobby' && !s.full &&
          (isHost ? (
            <Button className="w-full text-2xl !py-4" disabled={!s.opponent || !unit} onClick={() => s.startMatch()}>
              {s.opponent ? '⚔️ Bắt đầu!' : '⏳ Chờ bạn vào…'}
            </Button>
          ) : (
            s.opponent && <Info>⏳ Chờ chủ phòng bấm "Bắt đầu"…</Info>
          ))}

        <Button color="white" className="w-full" onClick={leave}>
          🚪 Rời phòng
        </Button>
      </div>
      <UnitPicker open={pickOpen} value={s.unitId} onPick={(id) => s.setUnit(id)} onClose={() => setPickOpen(false)} />
    </div>
  );
}

function PlayerCard({ p, me }: { p: PeerInfo; me?: boolean }) {
  const rank = rankOf(p.rp);
  return (
    <div className={`panel p-3 text-center animate-pop ${me ? '!border-sky-300' : '!border-rose-300'}`}>
      <div className="text-4xl">🧒</div>
      <div className="truncate text-lg font-extrabold text-slate-800">
        {p.name}
        {me && <span className="text-sm text-slate-400"> (em)</span>}
      </div>
      <div className="mt-0.5 flex items-center justify-center gap-1 text-xs font-extrabold" style={{ color: rank.dark }}>
        <RankIcon rank={rank} className="h-5 w-5" /> {rank.name} · {p.rp}
      </div>
      <div className="text-xs font-bold text-slate-400">{p.role === 'host' ? '👑 Chủ phòng' : 'Khách'}</div>
    </div>
  );
}

function Info({ children, tone = 'sky' }: { children: ReactNode; tone?: 'sky' | 'amber' | 'red' }) {
  const cls = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'red' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-white/80 text-sky-800';
  return <div className={`rounded-2xl border-2 p-3 text-center font-bold ${cls}`}>{children}</div>;
}

// ---------------- Trận đấu ----------------

function Countdown() {
  const end = useRoom((s) => s.countdownEnd);
  const [left, setLeft] = useState(3);
  useEffect(() => {
    if (!end) return;
    const id = setInterval(() => setLeft(Math.max(1, Math.ceil((end - performance.now()) / 1000))), 100);
    return () => clearInterval(id);
  }, [end]);
  if (!end) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40">
      <div className="text-center">
        <div className="text-2xl font-extrabold text-white drop-shadow">Chuẩn bị…</div>
        <div key={left} className="text-9xl font-extrabold text-amber-300 drop-shadow-[0_6px_0_rgba(146,64,14,0.9)] animate-pop">
          {left}
        </div>
      </div>
    </div>
  );
}

/** Nút biểu cảm: nhân vật của em làm hành động, bạn kia cũng thấy */
function EmoteBar() {
  const emote = useRoom((s) => s.emote);
  return (
    <div className="absolute bottom-6 lg:bottom-3 left-2 flex gap-1">
      {PVP_EMOTES.map((e) => (
        <button
          key={e.kind}
          onClick={() => emote(e.kind)}
          title={e.label}
          aria-label={e.label}
          className="h-10 w-10 rounded-xl bg-white/90 border-b-4 border-slate-300 text-xl active:translate-y-0.5"
        >
          {e.emoji}
        </button>
      ))}
    </div>
  );
}

function MatchView() {
  const phase = useBattle((s) => s.phase);
  const duel = useBattle((s) => s.duel);
  const room = useRoom();
  const [menuOpen, setMenuOpen] = useState(false);
  const isHost = room.role === 'host';
  if (!duel) return null;

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row overflow-hidden bg-sky-200">
      <div className="relative shrink-0 h-[38dvh] min-h-[200px] lg:h-auto lg:flex-1">
        <Suspense fallback={<div className="h-full grid place-items-center font-bold text-sky-700">Đang tải cảnh…</div>}>
          <DuelScene />
        </Suspense>
        <DuelHud onPause={() => setMenuOpen(true)} />
        <EmoteBar />
      </div>

      <div className="flex-1 lg:flex-none lg:w-[480px] overflow-y-auto bg-white/95 rounded-t-3xl lg:rounded-none lg:rounded-l-3xl -mt-4 lg:mt-0 relative z-10 p-3 sm:p-5 shadow-[0_-6px_20px_rgba(0,0,0,0.1)]">
        {(phase === 'question' || phase === 'feedback') && <QuestionPanel />}
      </div>

      <Countdown />

      <Modal open={menuOpen && (phase === 'question' || phase === 'feedback' || phase === 'ready')} title="⚙️ Menu" onClose={() => setMenuOpen(false)}>
        <div className="space-y-3">
          <p className="text-center text-sm font-bold text-slate-500">Đồng hồ vẫn chạy vì bạn của em đang chơi.</p>
          <Button className="w-full text-xl" onClick={() => setMenuOpen(false)}>
            ▶ Chơi tiếp
          </Button>
          <div className="flex justify-center">
            <SoundToggles />
          </div>
          <Button color="red" className="w-full" onClick={() => room.backToLobby()}>
            🚪 Thoát trận (không tính điểm)
          </Button>
        </div>
      </Modal>

      {(phase === 'won' || phase === 'lost' || phase === 'draw') && (
        <DuelResult>
          {isHost ? (
            <Button color="green" className="w-full text-xl" disabled={!room.opponent} onClick={() => room.startMatch()}>
              {room.opponent ? '🔁 Ván mới' : '👋 Bạn đã rời phòng'}
            </Button>
          ) : (
            <div className="rounded-2xl bg-sky-50 p-3 text-center font-bold text-sky-800 animate-pulse">{room.opponent ? '⏳ Chờ chủ phòng mở ván mới…' : '👋 Chủ phòng đã rời đi'}</div>
          )}
          <Button color="white" className="w-full" onClick={() => room.backToLobby()}>
            🏠 Về sảnh chờ
          </Button>
        </DuelResult>
      )}
    </div>
  );
}

function AbortedModal() {
  const room = useRoom();
  return (
    <div className="min-h-full">
      <Modal open title="🛑 Trận đấu đã dừng">
        <p className="font-bold text-slate-600">{room.opponent ? 'Bạn kia đã thoát trận.' : 'Bạn kia đã rời phòng hoặc mất kết nối.'} Trận này không tính điểm.</p>
        <Button className="w-full mt-4 text-xl" onClick={() => room.backToLobby()}>
          🏠 Về sảnh chờ
        </Button>
      </Modal>
    </div>
  );
}
