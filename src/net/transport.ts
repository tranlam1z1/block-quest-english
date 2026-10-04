// ============================================================
// Kết nối phòng chơi 2 người
//  - SupabaseTransport: qua Internet bằng Supabase Realtime (broadcast + presence),
//    không cần tạo bảng dữ liệu nào.
//  - LocalTransport: BroadcastChannel giữa các tab của CÙNG một trình duyệt
//    (để thử nghiệm khi chưa cấu hình Supabase).
// ============================================================
import type { Avatar } from '../game/cosmetics';
import { getSupabase, onlineConfigured } from '../services/supabase';

/** Thông tin công khai của 1 người trong phòng */
export interface PeerInfo {
  id: string;
  name: string;
  avatar: Avatar;
  rp: number;
  role: 'host' | 'guest';
  joinedAt: number;
  /** Chủ phòng: bài học đã chọn */
  unitId?: string;
}

export type NetMessage = { type: string; from: string } & Record<string, unknown>;

export interface TransportHandlers {
  /** Danh sách người đang trong phòng (gồm cả mình) */
  onPeers: (peers: PeerInfo[]) => void;
  onMessage: (m: NetMessage) => void;
  onStatus: (status: 'connected' | 'error', detail?: string) => void;
}

export interface Transport {
  readonly kind: 'online' | 'local';
  connect: (code: string, me: PeerInfo, h: TransportHandlers) => void;
  /** Cập nhật thông tin của mình (VD chủ phòng đổi bài) */
  update: (me: PeerInfo) => void;
  send: (m: NetMessage) => void;
  close: () => void;
}

/** Đã cấu hình máy chủ Supabase (file .env.local) chưa */
export { onlineConfigured };

const channelName = (code: string) => `bqe-room-${code}`;

// ---------------- Supabase ----------------

class SupabaseTransport implements Transport {
  readonly kind = 'online' as const;
  private channel: import('@supabase/supabase-js').RealtimeChannel | null = null;
  private client: import('@supabase/supabase-js').SupabaseClient | null = null;
  private closed = false;

  connect(code: string, me: PeerInfo, h: TransportHandlers) {
    // Dùng chung 1 client với cloudApi (services/supabase.ts), thư viện nạp khi cần
    getSupabase()
      .then((client) => {
        if (this.closed) return;
        this.client = client;
        const ch = this.client.channel(channelName(code), { config: { broadcast: { self: false }, presence: { key: me.id } } });
        this.channel = ch;
        ch.on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState<PeerInfo>();
          h.onPeers(Object.values(state).map((list) => list[list.length - 1]));
        });
        ch.on('broadcast', { event: 'msg' }, ({ payload }) => h.onMessage(payload as NetMessage));
        ch.subscribe(async (status, err) => {
          if (status === 'SUBSCRIBED') {
            await ch.track(me);
            h.onStatus('connected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            h.onStatus('error', err?.message ?? status);
          }
        });
      })
      .catch((e) => h.onStatus('error', String(e)));
  }

  update(me: PeerInfo) {
    void this.channel?.track(me);
  }

  send(m: NetMessage) {
    void this.channel?.send({ type: 'broadcast', event: 'msg', payload: m });
  }

  close() {
    this.closed = true;
    if (this.channel && this.client) {
      void this.channel.untrack();
      void this.client.removeChannel(this.channel);
    }
    this.channel = null;
  }
}

// ---------------- Thử nghiệm trên 1 trình duyệt ----------------

type LocalPacket = { kind: 'here' | 'hello' | 'bye'; peer: PeerInfo } | { kind: 'msg'; payload: NetMessage };

class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  private bc: BroadcastChannel | null = null;
  private me: PeerInfo | null = null;
  private peers = new Map<string, { info: PeerInfo; seen: number }>();
  private timer = 0;
  private h: TransportHandlers | null = null;

  connect(code: string, me: PeerInfo, h: TransportHandlers) {
    this.me = me;
    this.h = h;
    const bc = new BroadcastChannel(channelName(code));
    this.bc = bc;
    bc.onmessage = (ev: MessageEvent<LocalPacket>) => {
      const p = ev.data;
      if (p.kind === 'msg') return h.onMessage(p.payload);
      if (p.kind === 'bye') this.peers.delete(p.peer.id);
      else {
        const isNew = !this.peers.has(p.peer.id);
        this.peers.set(p.peer.id, { info: p.peer, seen: Date.now() });
        // Người mới vào → chào lại ngay để họ thấy mình
        if (p.kind === 'hello' && isNew) this.post({ kind: 'here', peer: this.me! });
      }
      this.emit();
    };
    this.post({ kind: 'hello', peer: me });
    // Nhịp tim: báo mình còn ở đây, xóa người đã im lặng quá 5 giây
    this.timer = window.setInterval(() => {
      this.post({ kind: 'here', peer: this.me! });
      const now = Date.now();
      let changed = false;
      for (const [id, p] of this.peers) if (now - p.seen > 5000) changed = this.peers.delete(id) || changed;
      if (changed) this.emit();
    }, 1500);
    window.addEventListener('pagehide', this.bye);
    setTimeout(() => {
      this.emit();
      h.onStatus('connected');
    }, 50);
  }

  private bye = () => this.me && this.post({ kind: 'bye', peer: this.me });

  private post(p: LocalPacket) {
    this.bc?.postMessage(p);
  }

  private emit() {
    if (!this.me || !this.h) return;
    this.h.onPeers([this.me, ...Array.from(this.peers.values(), (p) => p.info)]);
  }

  update(me: PeerInfo) {
    this.me = me;
    this.post({ kind: 'here', peer: me });
    this.emit();
  }

  send(m: NetMessage) {
    this.post({ kind: 'msg', payload: m });
  }

  close() {
    this.bye();
    clearInterval(this.timer);
    window.removeEventListener('pagehide', this.bye);
    this.bc?.close();
    this.bc = null;
    this.h = null;
  }
}

export function createTransport(kind: 'online' | 'local'): Transport {
  return kind === 'online' ? new SupabaseTransport() : new LocalTransport();
}
