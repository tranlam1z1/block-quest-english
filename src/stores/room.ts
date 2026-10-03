// ============================================================
// Phòng solo với bạn: tạo phòng bằng mã 6 số, vào phòng, đồng bộ trận đấu.
//
// Tin nhắn trong phòng:
//  - 'start' (chủ phòng → khách): mã trận + bài học + 10 câu hỏi + thời gian mỗi câu
//  - 'ack'   (khách → chủ phòng): đã nhận câu hỏi
//  - 'state' (hai chiều): toàn bộ câu trả lời của mình + câu đã bấm "tiếp".
//    Gửi lại định kỳ nên lỡ mất 1 tin cũng không sao.
// ============================================================
import { create } from 'zustand';
import { getUnit } from '../content';
import { PVP_STAKES, rankOf, type Opponent } from '../game/duel';
import { QuestionDeck } from '../game/questions/buildQuiz';
import type { Question } from '../game/questions/types';
import { createTransport, onlineConfigured, type NetMessage, type PeerInfo, type Transport } from '../net/transport';
import { speechSupported } from '../services/speech';
import { useBattle, type RoundAnswer } from './battle';
import { useProgress } from './progress';
import { enabledTypeList, useSettings } from './settings';

export type RoomStatus = 'idle' | 'connecting' | 'lobby' | 'error';

/** Đếm ngược trước khi vào trận (ms) */
export const COUNTDOWN_MS = 3000;

interface RoomState {
  status: RoomStatus;
  kind: 'online' | 'local';
  code: string;
  role: 'host' | 'guest';
  me: PeerInfo | null;
  opponent: PeerInfo | null;
  /** Phòng đã đủ 2 người, mình không vào được */
  full: boolean;
  /** Bài học chủ phòng chọn */
  unitId: string;
  /** Trận đang chơi (null = đang ở sảnh chờ) */
  matchId: string | null;
  /** Thời điểm (performance.now) bắt đầu câu 1 */
  countdownEnd: number | null;
  /** Bạn đã rời phòng giữa trận */
  opponentLeft: boolean;
  error: string | null;

  /** Tạo phòng mới (chủ phòng) */
  create: (unitId: string, kind: 'online' | 'local') => string;
  /** Vào phòng bằng mã (khách) */
  join: (code: string, kind: 'online' | 'local') => void;
  /** Chủ phòng kết nối lại cùng mã (sau khi lỗi mạng) */
  recreate: () => void;
  leave: () => void;
  /** Chủ phòng đổi bài học */
  setUnit: (unitId: string) => void;
  /** Chủ phòng bắt đầu trận (hoặc ván mới) */
  startMatch: () => boolean;
  /** Rời màn trận về sảnh chờ của phòng */
  backToLobby: () => void;
}

let transport: Transport | null = null;
let heartbeat = 0;
let resendStart = 0;
let countdownTimer = 0;
let lastStart: NetMessage | null = null;
let unsubBattle: (() => void) | null = null;

const uid = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
export const newRoomCode = () => String(Math.floor(100000 + Math.random() * 900000));

function myInfo(role: 'host' | 'guest', unitId?: string): PeerInfo {
  const p = useProgress.getState();
  return { id: uid(), name: p.playerName || 'Bạn', avatar: p.avatar, rp: p.duel.rp, role, joinedAt: Date.now(), unitId };
}

/** Người chơi trong phòng → đối thủ để vẽ & tính thưởng */
export function peerOpponent(p: PeerInfo): Opponent {
  return { key: 'peer-' + p.id, name: p.name, emoji: '🧒', avatar: p.avatar, label: `Rank ${rankOf(p.rp).name}`, stakes: PVP_STAKES };
}

function send(m: Omit<NetMessage, 'from'>) {
  const me = useRoom.getState().me;
  if (transport && me) transport.send({ ...m, from: me.id } as NetMessage);
}

/** Gửi toàn bộ trạng thái trận của mình */
function sendState() {
  const d = useBattle.getState().duel;
  const { matchId } = useRoom.getState();
  if (!d || !d.remote || d.matchId !== matchId) return;
  send({ type: 'state', matchId, answers: d.myAnswers, ready: d.myReady });
}

function stopTimers() {
  clearInterval(heartbeat);
  clearInterval(resendStart);
  clearTimeout(countdownTimer);
  heartbeat = resendStart = countdownTimer = 0;
}

/** Vào trận: dựng bộ câu hỏi, đếm ngược 3 giây rồi ra câu 1 */
function enterMatch(o: { matchId: string; unitId: string; questions: Question[]; limitMs: number }, opp: PeerInfo) {
  const ok = useBattle.getState().setupRemoteDuel({ ...o, opp: peerOpponent(opp) });
  if (!ok) return false;
  clearTimeout(countdownTimer);
  useRoom.setState({ matchId: o.matchId, countdownEnd: performance.now() + COUNTDOWN_MS, opponentLeft: false, unitId: o.unitId });
  countdownTimer = window.setTimeout(() => {
    useRoom.setState({ countdownEnd: null });
    useBattle.getState().begin();
  }, COUNTDOWN_MS);
  return true;
}

function onPeers(peers: PeerInfo[]) {
  const s = useRoom.getState();
  if (!s.me) return;
  // 2 người vào sớm nhất là người chơi; người đến sau thấy "phòng đầy"
  const players = [...peers].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).slice(0, 2);
  const inRoom = players.some((p) => p.id === s.me!.id);
  const other = players.find((p) => p.id !== s.me!.id) ?? null;
  // Khách chỉ ghép với chủ phòng; chủ phòng chỉ ghép với khách
  const opponent = other && other.role !== s.role ? other : null;

  const left = !!s.opponent && !opponent;
  const d = useBattle.getState().duel;
  const playing = !!d?.remote && d.matchId === s.matchId && !d.outcome;
  if (left && playing) useBattle.getState().abortRemote();
  if (left) {
    clearInterval(resendStart);
    lastStart = null;
  }
  useRoom.setState({
    opponent,
    full: !inRoom,
    opponentLeft: left ? true : opponent ? false : s.opponentLeft,
    unitId: s.role === 'guest' && opponent?.unitId ? opponent.unitId : s.unitId,
  });
}

function onMessage(m: NetMessage) {
  const s = useRoom.getState();
  if (!s.opponent || m.from !== s.opponent.id) return;
  if (m.type === 'start' && s.role === 'guest') {
    const matchId = m.matchId as string;
    if (matchId !== s.matchId) enterMatch({ matchId, unitId: m.unitId as string, questions: m.questions as Question[], limitMs: m.limitMs as number }, s.opponent);
    send({ type: 'ack', matchId });
  } else if (m.type === 'ack' && s.role === 'host' && m.matchId === s.matchId) {
    clearInterval(resendStart);
    resendStart = 0;
  } else if (m.type === 'quit' && m.matchId === s.matchId) {
    clearTimeout(countdownTimer);
    useRoom.setState({ countdownEnd: null });
    useBattle.getState().abortRemote();
  } else if (m.type === 'state' && m.matchId === s.matchId) {
    if (s.role === 'host') {
      clearInterval(resendStart);
      resendStart = 0;
    }
    useBattle.getState().receiveOpp(m.matchId as string, m.answers as Record<number, RoundAnswer>, m.ready as number);
  }
}

function connect(code: string, role: 'host' | 'guest', kind: 'online' | 'local', unitId: string) {
  useRoom.getState().leave();
  const me = myInfo(role, role === 'host' ? unitId : undefined);
  transport = createTransport(kind);
  useRoom.setState({ status: 'connecting', kind, code, role, me, opponent: null, full: false, unitId, matchId: null, countdownEnd: null, opponentLeft: false, error: null });
  transport.connect(code, me, {
    onPeers,
    onMessage,
    onStatus: (st, detail) => {
      if (st === 'connected') useRoom.setState({ status: 'lobby', error: null });
      else useRoom.setState({ status: 'error', error: detail ?? 'Không kết nối được' });
    },
  });
  // Gửi trạng thái mỗi khi mình trả lời / bấm tiếp, và gửi lại định kỳ
  unsubBattle = useBattle.subscribe((st, prev) => {
    if (st.duel?.remote && (st.duel.myAnswers !== prev.duel?.myAnswers || st.duel.myReady !== prev.duel?.myReady)) sendState();
  });
  heartbeat = window.setInterval(sendState, 1500);
}

export const useRoom = create<RoomState>()((set, get) => ({
  status: 'idle',
  kind: onlineConfigured ? 'online' : 'local',
  code: '',
  role: 'host',
  me: null,
  opponent: null,
  full: false,
  unitId: '',
  matchId: null,
  countdownEnd: null,
  opponentLeft: false,
  error: null,

  create: (unitId, kind) => {
    const code = newRoomCode();
    connect(code, 'host', kind, unitId);
    return code;
  },

  join: (code, kind) => connect(code, 'guest', kind, ''),

  recreate: () => {
    const { code, kind, unitId } = get();
    connect(code, 'host', kind, unitId);
  },

  leave: () => {
    get().backToLobby();
    stopTimers();
    unsubBattle?.();
    unsubBattle = null;
    transport?.close();
    transport = null;
    lastStart = null;
    useBattle.getState().abortRemote();
    set({ status: 'idle', me: null, opponent: null, matchId: null, countdownEnd: null, opponentLeft: false, full: false, error: null });
  },

  setUnit: (unitId) => {
    const { me, role } = get();
    if (role !== 'host' || !me || !getUnit(unitId)) return;
    const next = { ...me, unitId };
    set({ unitId, me: next });
    transport?.update(next);
  },

  startMatch: () => {
    const { role, opponent, unitId } = get();
    const unit = getUnit(unitId);
    if (role !== 'host' || !opponent || !unit) return false;
    const settings = useSettings.getState();
    const deck = new QuestionDeck(unit, enabledTypeList(settings.enabledTypes), 'elite', speechSupported());
    const questions = Array.from({ length: 10 }, () => deck.next());
    const payload = { matchId: uid(), unitId, questions, limitMs: settings.timerSec * 1000 };
    if (!enterMatch(payload, opponent)) return false;
    lastStart = { type: 'start', from: get().me!.id, ...payload };
    send(lastStart);
    // Gửi lại tới khi khách xác nhận
    clearInterval(resendStart);
    resendStart = window.setInterval(() => lastStart && send(lastStart), 1000);
    return true;
  },

  backToLobby: () => {
    clearTimeout(countdownTimer);
    const d = useBattle.getState().duel;
    // Đang đánh dở → báo cho bạn biết trận đã dừng
    if (d?.remote && d.matchId === get().matchId && !d.outcome && !d.aborted) send({ type: 'quit', matchId: d.matchId });
    useBattle.getState().abortRemote();
    set({ matchId: null, countdownEnd: null });
  },
}));

// Chỉ khi phát triển: cho script kiểm thử truy cập
if (import.meta.env.DEV) (window as unknown as { __bqeRoom: typeof useRoom }).__bqeRoom = useRoom;
