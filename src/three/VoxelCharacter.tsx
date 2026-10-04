// ============================================================
// Nhân vật người chơi dạng khối — tùy chỉnh da, tóc, kiểu tóc, áo, quần, phụ kiện, trang phục
// Có biểu cảm khuôn mặt (vui, buồn, suy nghĩ, lo lắng…) và hành động (vẫy tay, nhảy, gãi đầu…)
// ============================================================
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { resolveAvatar, type Avatar } from '../game/cosmetics';
import type { FxEvent } from '../stores/battle';
import { activeEmote } from '../stores/emotes';
import type { Face, Mood } from './mood';
import { Vox, applyFlash, ease } from './Voxel';
import { emitBurst } from './effects/Particles';

const RED = new THREE.Color('#ff3b3b');
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const FACES: Face[] = ['neutral', 'happy', 'fierce', 'surprised', 'sad', 'cry', 'think', 'worried'];
/** Các biểu cảm mắt mở → thỉnh thoảng tự chớp mắt */
const BLINKS: Partial<Record<Face, true>> = { neutral: true, fierce: true, sad: true, think: true, worried: true };

/** Góc tay, đầu, nghiêng người — được làm mượt khi đổi từ hành động này sang hành động khác */
interface Pose {
  armRx: number;
  armRz: number;
  armLx: number;
  armLz: number;
  headX: number;
  headY: number;
  headZ: number;
  /** Nghiêng cả người (dương = ngả ra sau) */
  tilt: number;
}
const POSE_KEYS: (keyof Pose)[] = ['armRx', 'armRz', 'armLx', 'armLz', 'headX', 'headY', 'headZ', 'tilt'];
const restPose = (): Pose => ({ armRx: 0, armRz: 0, armLx: 0, armLz: 0, headX: 0, headY: 0, headZ: 0, tilt: 0 });

interface Props {
  avatar: Avatar;
  position?: [number, number, number];
  /** Góc quay quanh trục Y (hướng mặt) */
  facing?: number;
  /** Hàm đọc sự kiện hiệu ứng hiện tại (không gây render lại) */
  getFx?: () => FxEvent;
  /** Hàm đọc tâm trạng hiện tại: biểu cảm + hành động (không gây render lại) */
  getMood?: () => Mood;
  /** Xoay chậm để ngắm (dùng ở cửa hàng) */
  autoRotate?: boolean;
  /** Hướng lao tới khi tấn công: 1 = sang phải (người chơi), -1 = sang trái (đối thủ bên phải) */
  dir?: 1 | -1;
  /** Bấm vào nhân vật */
  onClick?: () => void;
}

export function VoxelCharacter({ avatar, position = [0, 0, 0], facing = 0, getFx, getMood, autoRotate, dir = 1, onClick }: Props) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const sweat = useRef<THREE.Group>(null);
  const drops = useRef<THREE.Group>(null);
  const faces = useRef<Partial<Record<Face, THREE.Group | null>>>({});
  const eyes = useRef<Partial<Record<Face, THREE.Group | null>>>({});
  const handled = useRef({ hit: 0, crit: 0 });
  const pose = useRef<Pose>(restPose());
  const target = useRef<Pose>(restPose());
  // Mỗi nhân vật chớp mắt lệch nhịp nhau
  const blinkSeed = useMemo(() => Math.random() * 4, []);
  const look = useMemo(() => resolveAvatar(avatar), [avatar]);

  useEffect(() => () => void (onClick && (document.body.style.cursor = '')), [onClick]);

  useFrame(({ clock }, delta) => {
    const g = root.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    const now = performance.now();
    const fx = getFx?.();
    const dt = fx ? (now - fx.at) / 1000 : 99;
    const mood = getMood?.();
    const emote = activeEmote(mood?.emote ?? null, now);
    // de < 0: hành động đã hẹn nhưng chưa tới lúc (chờ đòn đánh xong)
    const de = emote ? (now - emote.at) / 1000 : -1;

    // Mặc định: đứng thở nhẹ
    let x = 0;
    let y = Math.sin(t * 3) * 0.04;
    let spin = 0;
    let flash = 0;
    let face: Face = mood?.face ?? 'neutral';
    const p = target.current;
    Object.assign(p, restPose());
    p.armRx = Math.sin(t * 3) * 0.1;
    p.armLx = -p.armRx * 0.5;

    const attacking = fx?.kind === 'playerAttack' && dt < (fx.crit ? 0.9 : 0.7);
    const hurt = fx?.kind === 'monsterAttack' && dt < 0.9;
    // Thắng / thua giữ nguyên tư thế, trừ khi người chơi bấm biểu cảm sau đó
    const ended = (fx?.kind === 'win' || fx?.kind === 'lose') && !(emote && de >= 0 && emote.at > fx.at);

    if (attacking && fx) {
      // Lao lên và vung đũa phép
      face = 'fierce';
      x = Math.sin(ease(dt / 0.5) * Math.PI) * 0.7;
      p.armRx = -Math.sin(Math.min(dt / 0.35, 1) * Math.PI) * 2.2;
      p.armLx = -p.armRx * 0.5;
      if (fx.crit) {
        // Chí mạng: bật nhảy xoay một vòng, vung đũa thật mạnh, tay kia dang rộng
        const c = ease(dt / 0.6);
        spin = c * Math.PI * 2;
        y += Math.sin(c * Math.PI) * 0.6;
        p.armRx = -Math.sin(Math.min(dt / 0.45, 1) * Math.PI) * 2.8;
        p.armLx = 0;
        p.armLz = -Math.sin(c * Math.PI) * 1.6;
        if (handled.current.crit !== fx.id) {
          handled.current.crit = fx.id;
          emitBurst({ position: [position[0], 0.4, position[2] + 0.3], colors: ['#fde047', '#facc15', '#fb923c', '#ffffff'], count: 30, speed: 3, life: 0.7 });
        }
      }
    } else if (hurt && fx) {
      // Thấy đòn tới: giật mình; bị trúng đòn: rung + nháy đỏ + ngả người
      face = 'surprised';
      if (dt > 0.3) {
        const k = 1 - (dt - 0.3) / 0.6;
        x = Math.sin(dt * 70) * 0.1 * k - 0.2 * k;
        flash = k;
        p.headX = -0.25 * k;
        p.tilt = 0.15 * k;
        if (handled.current.hit !== fx.id) {
          handled.current.hit = fx.id;
          emitBurst({ position: [position[0], 1.3, position[2] + 0.3], colors: ['#ffffff', '#fca5a5', '#ef4444'], count: 18, speed: 3, life: 0.5 });
        }
      }
    } else if (ended && fx?.kind === 'win') {
      // Nhảy mừng chiến thắng, hai tay giơ cao
      face = 'happy';
      y = Math.abs(Math.sin(dt * 6)) * 0.45;
      p.armRx = -2.6;
      p.armLz = -2.5 + Math.sin(dt * 12) * 0.2;
    } else if (ended && fx?.kind === 'lose') {
      // Ngã ra sau và khóc
      face = 'cry';
      p.tilt = ease(dt / 0.6) * 1.35;
      y = -ease(dt / 0.6) * 0.15;
    } else if (emote && de >= 0) {
      switch (emote.kind) {
        case 'wave':
          // Vẫy tay trái
          face = 'happy';
          p.armLz = -2.7 + Math.sin(de * 14) * 0.4;
          p.headZ = Math.sin(de * 7) * 0.1;
          break;
        case 'cheer':
          // Giơ hai tay hoan hô, nhún nhảy
          face = 'happy';
          y = Math.abs(Math.sin(de * 8)) * 0.35;
          p.armRz = 2.7;
          p.armLz = -2.7;
          break;
        case 'laugh':
          // Ôm bụng cười, ngửa đầu, người rung rung
          face = 'happy';
          y = Math.abs(Math.sin(de * 16)) * 0.06;
          p.headX = -0.3;
          p.tilt = 0.08;
          p.armRx = p.armLx = -0.7;
          p.armRz = -0.35;
          p.armLz = 0.35;
          break;
        case 'cry':
          // Hai tay dụi mắt
          face = 'cry';
          y = Math.sin(de * 10) * 0.03;
          p.headX = 0.2;
          p.armRx = p.armLx = -2.5;
          p.armRz = -0.45;
          p.armLz = 0.45;
          break;
        case 'dance': {
          // Lắc lư qua lại, hai tay thay nhau giơ lên
          face = 'happy';
          const w = Math.sin(de * 6);
          x = w * 0.15;
          y = Math.abs(Math.sin(de * 12)) * 0.12;
          p.tilt = w * 0.15;
          p.headZ = w * 0.2;
          p.armRz = 0.4 + Math.max(0, w) * 2.2;
          p.armLz = -(0.4 + Math.max(0, -w) * 2.2);
          break;
        }
        case 'oops':
          // Trả lời sai: lắc đầu rồi gãi đầu
          face = 'sad';
          if (de < 0.6) p.headY = Math.sin(de * 18) * 0.35 * (1 - de / 0.6);
          else {
            p.armLx = -2.6;
            p.armLz = 0.1 + Math.sin(de * 20) * 0.08;
            p.headZ = 0.15;
          }
          break;
      }
    } else if (face === 'think') {
      // Tay chống cằm, nghiêng đầu
      p.armLx = -1.9;
      p.armLz = 0.5;
      p.headX = -0.08;
      p.headZ = 0.12 + Math.sin(t * 1.5) * 0.04;
    } else if (face === 'worried') {
      // Thở gấp, run run
      y = Math.sin(t * 7) * 0.03;
      p.headZ = Math.sin(t * 9) * 0.04;
      p.armRx = -0.3 + Math.sin(t * 14 + 1) * 0.05;
      p.armLx = -0.5 + Math.sin(t * 14) * 0.05;
    } else if (face === 'sad') {
      // Cúi đầu, tay buông thõng
      y *= 0.5;
      p.headX = 0.2;
      p.armRx = p.armLx = 0.05;
    } else if (face === 'happy') {
      // Nhún nhảy vui vẻ
      y = Math.abs(Math.sin(t * 5)) * 0.06;
    }

    // Làm mượt tư thế để không bị giật khi đổi hành động
    const cur = pose.current;
    const a = 1 - Math.exp(-delta * 20);
    for (const k of POSE_KEYS) cur[k] += (p[k] - cur[k]) * a;

    // Các chuyển động trên tính cho nhân vật đứng bên trái (lao sang phải); dir = -1 thì lật lại
    g.position.set(position[0] + x * dir, position[1] + y, position[2]);
    g.rotation.set(0, facing + spin * dir + (autoRotate ? Math.sin(t * 0.6) * 0.6 : 0), 0);
    g.rotateOnWorldAxis(Z_AXIS, cur.tilt * dir);
    armR.current?.rotation.set(cur.armRx, 0, cur.armRz);
    armL.current?.rotation.set(cur.armLx, 0, cur.armLz);
    head.current?.rotation.set(cur.headX, cur.headY, cur.headZ);

    // Khuôn mặt: chỉ hiện biểu cảm hiện tại, chớp mắt mỗi ~3,6 giây
    for (const f of FACES) {
      const el = faces.current[f];
      if (el) el.visible = f === face;
    }
    const eg = eyes.current[face];
    if (eg) eg.scale.y = BLINKS[face] && (t + blinkSeed) % 3.6 < 0.13 ? 0.12 : 1;
    if (sweat.current) sweat.current.position.y = -((t * 0.7) % 1) * 0.3;
    if (drops.current) drops.current.position.y = -((t * 2) % 1) * 0.25;

    applyFlash(g, RED, flash);
  });

  const { skin, crystal, hair, hairStyle, shirt, shirtAccent, shirtPattern, pants, accessory, outfit } = look;
  const armor = outfit === 'outfit-dragon';
  // Da pha lê: trong suốt nhẹ và phát sáng
  const S = (p: [number, number, number], s: [number, number, number]) =>
    crystal ? <Vox p={p} s={s} c={skin} glow="#3b82f6" opacity={0.92} /> : <Vox p={p} s={s} c={skin} />;
  const sleeve = armor ? '#b91c1c' : shirt;
  const click = onClick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        },
        onPointerOver: () => void (document.body.style.cursor = 'pointer'),
        onPointerOut: () => void (document.body.style.cursor = ''),
      }
    : {};

  return (
    <group ref={root} position={position} {...click}>
      {/* Chân + giày */}
      <Vox p={[-0.17, 0.4, 0]} s={[0.3, 0.6, 0.32]} c={armor ? '#78350f' : pants} />
      <Vox p={[0.17, 0.4, 0]} s={[0.3, 0.6, 0.32]} c={armor ? '#78350f' : pants} />
      <Vox p={[-0.17, 0.06, 0.03]} s={[0.32, 0.12, 0.38]} c={armor ? '#facc15' : '#374151'} />
      <Vox p={[0.17, 0.06, 0.03]} s={[0.32, 0.12, 0.38]} c={armor ? '#facc15' : '#374151'} />

      {/* Thân áo */}
      <Vox p={[0, 1.08, 0]} s={[0.8, 0.8, 0.45]} c={armor ? '#b91c1c' : shirt} />
      <Vox p={[0, 0.74, 0]} s={[0.82, 0.1, 0.47]} c={armor ? '#facc15' : '#78350f'} />
      {!armor && shirtPattern === 'stripes' && [0.88, 1.08, 1.28].map((yy) => <Vox key={yy} p={[0, yy, 0]} s={[0.82, 0.07, 0.47]} c={shirtAccent} castShadow={false} />)}
      {!armor && shirtPattern === 'star' && (
        <>
          <Vox p={[0, 1.12, 0.23]} s={[0.3, 0.1, 0.02]} c={shirtAccent} castShadow={false} />
          <Vox p={[0, 1.12, 0.23]} s={[0.1, 0.3, 0.02]} c={shirtAccent} castShadow={false} />
          <Vox p={[0, 1.12, 0.235]} s={[0.18, 0.18, 0.02]} c={shirtAccent} castShadow={false} />
        </>
      )}
      {!armor && shirtPattern === 'heart' && (
        <>
          <Vox p={[-0.06, 1.17, 0.23]} s={[0.12, 0.1, 0.02]} c={shirtAccent} castShadow={false} />
          <Vox p={[0.06, 1.17, 0.23]} s={[0.12, 0.1, 0.02]} c={shirtAccent} castShadow={false} />
          <Vox p={[0, 1.09, 0.23]} s={[0.18, 0.08, 0.02]} c={shirtAccent} castShadow={false} />
          <Vox p={[0, 1.03, 0.23]} s={[0.08, 0.06, 0.02]} c={shirtAccent} castShadow={false} />
        </>
      )}
      {/* Giáp Rồng Huyền Thoại: giáp ngực vàng + vai + áo choàng */}
      {armor && (
        <>
          <Vox p={[0, 1.12, 0.24]} s={[0.6, 0.55, 0.04]} c="#facc15" glow="#a16207" />
          <Vox p={[0, 1.15, 0.27]} s={[0.16, 0.16, 0.02]} c="#22d3ee" glow="#0891b2" />
          <Vox p={[-0.5, 1.48, 0]} s={[0.36, 0.14, 0.4]} c="#facc15" glow="#a16207" />
          <Vox p={[0.5, 1.48, 0]} s={[0.36, 0.14, 0.4]} c="#facc15" glow="#a16207" />
          <Vox p={[0, 0.95, -0.27]} s={[0.84, 1.05, 0.05]} c="#dc2626" />
          <Vox p={[0, 0.45, -0.3]} s={[0.9, 0.12, 0.05]} c="#facc15" />
        </>
      )}

      {/* Tay phải cầm đũa phép */}
      <group ref={armR} position={[0.53, 1.42, 0]}>
        <Vox p={[0, -0.3, 0]} s={[0.25, 0.6, 0.25]} c={sleeve} />
        {S([0, -0.68, 0], [0.24, 0.18, 0.24])}
        <Vox p={[0, -0.72, 0.3]} s={[0.08, 0.08, 0.6]} c="#92400e" />
        <Vox p={[0, -0.72, 0.65]} s={[0.16, 0.16, 0.16]} c="#fde047" glow="#facc15" />
      </group>
      <group ref={armL} position={[-0.53, 1.42, 0]}>
        <Vox p={[0, -0.3, 0]} s={[0.25, 0.6, 0.25]} c={sleeve} />
        {S([0, -0.68, 0], [0.24, 0.18, 0.24])}
      </group>

      {/* Đầu xoay quanh cổ (gật, lắc, nghiêng); bên trong giữ tọa độ như cũ */}
      <group ref={head} position={[0, 1.5, 0]}>
        <group position={[0, -1.5, 0]}>
          {S([0, 1.88, 0], [0.76, 0.76, 0.76])}
          {[-1, 1].map((side) => (
            <Vox key={side} p={[side * 0.27, 1.76, 0.385]} s={[0.1, 0.05, 0.02]} c="#f9a8d4" castShadow={false} />
          ))}
          <Faces faces={faces} eyes={eyes} sweat={sweat} drops={drops} side={-dir} />

          {/* Tóc */}
          <Vox p={[0, 2.3, 0]} s={[0.82, 0.14, 0.82]} c={hair} />
          <Vox p={[-0.36, 2.1, 0]} s={[0.1, 0.4, 0.8]} c={hair} />
          <Vox p={[0.36, 2.1, 0]} s={[0.1, 0.4, 0.8]} c={hair} />
          <Vox p={[0.15, 2.2, 0.36]} s={[0.4, 0.12, 0.1]} c={hair} />
          {hairStyle === 'style-long' ? (
            <>
              <Vox p={[0, 1.8, -0.35]} s={[0.84, 1.0, 0.14]} c={hair} />
              <Vox p={[-0.38, 1.78, -0.05]} s={[0.1, 0.7, 0.6]} c={hair} />
              <Vox p={[0.38, 1.78, -0.05]} s={[0.1, 0.7, 0.6]} c={hair} />
            </>
          ) : (
            <Vox p={[0, 2.0, -0.35]} s={[0.82, 0.6, 0.14]} c={hair} />
          )}
          {hairStyle === 'style-spiky' &&
            [
              [-0.25, 0.1],
              [0, -0.05],
              [0.25, 0.1],
              [-0.12, -0.25],
              [0.12, -0.25],
            ].map(([xx, zz], i) => <Vox key={i} p={[xx, 2.45, zz]} s={[0.18, 0.22, 0.18]} c={hair} rot={[0.2, 0.6, 0.2]} />)}
          {hairStyle === 'style-bun' && <Vox p={[0, 2.5, -0.15]} s={[0.32, 0.28, 0.32]} c={hair} />}

          {/* Mũ giáp rồng: hiện khi không đội phụ kiện nào khác (mũ lưỡi trai mặc định cũng được thay) */}
          {armor && (accessory === 'acc-none' || accessory === 'acc-cap') ? (
            <>
              <Vox p={[0, 2.38, 0]} s={[0.86, 0.18, 0.86]} c="#facc15" glow="#a16207" />
              <Vox p={[-0.3, 2.6, 0.1]} s={[0.1, 0.3, 0.1]} c="#fef3c7" rot={[0, 0, 0.4]} />
              <Vox p={[0.3, 2.6, 0.1]} s={[0.1, 0.3, 0.1]} c="#fef3c7" rot={[0, 0, -0.4]} />
              <Vox p={[0, 2.38, 0.44]} s={[0.14, 0.12, 0.02]} c="#22d3ee" glow="#0891b2" />
            </>
          ) : (
            <Accessory id={accessory} />
          )}
        </group>
      </group>
    </group>
  );
}

// ---------------- Khuôn mặt ----------------

type V3 = [number, number, number];
type GroupMap = RefObject<Partial<Record<Face, THREE.Group | null>>>;

const DARK = '#1f2937';
const MOUTH = '#9a3412';
const MOUTH_IN = '#7c2d12';
const TONGUE = '#f87171';
const WATER = '#7dd3fc';
/** Mặt trước của đầu */
const FZ = 0.385;

/** Một khối nhỏ trên mặt (không đổ bóng) */
function F({ p, s, c, rot, glow }: { p: V3; s: V3; c: string; rot?: V3; glow?: string }) {
  return <Vox p={p} s={s} c={c} rot={rot} glow={glow} castShadow={false} />;
}

/** Hai mắt mở có chấm sáng. Nhóm đặt ở tâm mắt để chớp mắt bằng scale.y */
function OpenEyes({ eyesRef, dx = 0, dy = 0, size = 1 }: { eyesRef?: (g: THREE.Group | null) => void; dx?: number; dy?: number; size?: number }) {
  return (
    <group ref={eyesRef} position={[0, 1.92 + dy, 0]}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <F p={[side * 0.16 + dx, 0, FZ]} s={[0.12 * size, 0.17 * size, 0.02]} c={DARK} />
          <F p={[side * 0.16 + dx - 0.025 * size, 0.05 * size, FZ + 0.015]} s={[0.04 * size, 0.04 * size, 0.01]} c="#ffffff" />
        </group>
      ))}
    </group>
  );
}

/** Lông mày: rot > 0 = cau có (đầu trong cụp xuống), rot < 0 = buồn (đầu trong nhướng lên) */
function Brows({ rot, y = 2.05 }: { rot: number; y?: number }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <F key={side} p={[side * 0.16, y, FZ]} s={[0.14, 0.035, 0.02]} c={DARK} rot={[0, 0, side * rot]} />
      ))}
    </>
  );
}

/** Tất cả biểu cảm; useFrame chỉ bật biểu cảm đang dùng. side: phía má hướng về camera (giọt mồ hôi) */
function Faces({ faces, eyes, sweat, drops, side }: { faces: GroupMap; eyes: GroupMap; sweat: RefObject<THREE.Group | null>; drops: RefObject<THREE.Group | null>; side: number }) {
  const face = (f: Face) => (g: THREE.Group | null) => void (faces.current[f] = g);
  const eye = (f: Face) => (g: THREE.Group | null) => void (eyes.current[f] = g);
  return (
    <>
      {/* Bình thường */}
      <group ref={face('neutral')}>
        <OpenEyes eyesRef={eye('neutral')} />
        <F p={[0, 1.72, FZ]} s={[0.16, 0.05, 0.02]} c={MOUTH} />
      </group>

      {/* Vui: mắt cười ^^ + miệng cười to */}
      <group ref={face('happy')} visible={false}>
        {[-1, 1].map((s) => (
          <group key={s}>
            <F p={[s * 0.16, 1.955, FZ]} s={[0.09, 0.04, 0.02]} c={DARK} />
            <F p={[s * 0.16 - 0.06, 1.92, FZ]} s={[0.04, 0.05, 0.02]} c={DARK} />
            <F p={[s * 0.16 + 0.06, 1.92, FZ]} s={[0.04, 0.05, 0.02]} c={DARK} />
          </group>
        ))}
        <F p={[0, 1.705, FZ]} s={[0.22, 0.09, 0.02]} c={MOUTH_IN} />
        <F p={[0, 1.68, FZ + 0.005]} s={[0.12, 0.035, 0.02]} c={TONGUE} />
        <F p={[-0.125, 1.745, FZ]} s={[0.04, 0.04, 0.02]} c={MOUTH_IN} />
        <F p={[0.125, 1.745, FZ]} s={[0.04, 0.04, 0.02]} c={MOUTH_IN} />
      </group>

      {/* Quyết tâm (khi tấn công): lông mày cau + nhe răng */}
      <group ref={face('fierce')} visible={false}>
        <OpenEyes eyesRef={eye('fierce')} size={0.9} dy={-0.01} />
        <Brows rot={0.4} y={2.04} />
        <F p={[0, 1.715, FZ]} s={[0.24, 0.09, 0.02]} c={MOUTH_IN} />
        <F p={[0, 1.715, FZ + 0.005]} s={[0.2, 0.045, 0.02]} c="#ffffff" />
      </group>

      {/* Giật mình: mắt to tròn, lông mày nhướng, miệng chữ O */}
      <group ref={face('surprised')} visible={false}>
        <OpenEyes size={1.3} dy={0.01} />
        <Brows rot={0} y={2.1} />
        <F p={[0, 1.69, FZ]} s={[0.1, 0.13, 0.02]} c={MOUTH_IN} />
      </group>

      {/* Buồn: lông mày xệ + miệng mếu */}
      <group ref={face('sad')} visible={false}>
        <OpenEyes eyesRef={eye('sad')} size={0.95} dy={-0.02} />
        <Brows rot={-0.4} y={2.04} />
        <F p={[0, 1.715, FZ]} s={[0.12, 0.04, 0.02]} c={MOUTH} />
        <F p={[-0.08, 1.695, FZ]} s={[0.05, 0.04, 0.02]} c={MOUTH} />
        <F p={[0.08, 1.695, FZ]} s={[0.05, 0.04, 0.02]} c={MOUTH} />
      </group>

      {/* Khóc: nhắm tịt mắt, miệng mếu to, nước mắt chảy */}
      <group ref={face('cry')} visible={false}>
        {[-1, 1].map((s) => (
          <group key={s}>
            <F p={[s * 0.16, 1.935, FZ]} s={[0.1, 0.035, 0.02]} c={DARK} />
            <F p={[s * 0.16 - 0.065, 1.91, FZ]} s={[0.035, 0.04, 0.02]} c={DARK} />
            <F p={[s * 0.16 + 0.065, 1.91, FZ]} s={[0.035, 0.04, 0.02]} c={DARK} />
            <F p={[s * 0.16, 1.8, FZ + 0.005]} s={[0.06, 0.18, 0.02]} c={WATER} glow="#0369a1" />
          </group>
        ))}
        <Brows rot={-0.4} y={2.04} />
        <F p={[0, 1.69, FZ]} s={[0.18, 0.11, 0.02]} c={MOUTH_IN} />
        <F p={[0, 1.66, FZ + 0.005]} s={[0.1, 0.04, 0.02]} c={TONGUE} />
        <group ref={drops}>
          {[-1, 1].map((s) => (
            <F key={s} p={[s * 0.16, 1.7, FZ + 0.01]} s={[0.05, 0.06, 0.03]} c={WATER} glow="#0369a1" />
          ))}
        </group>
      </group>

      {/* Suy nghĩ: mắt liếc lên, một bên lông mày nhướng, miệng lệch */}
      <group ref={face('think')} visible={false}>
        <OpenEyes eyesRef={eye('think')} dx={0.035} dy={0.035} />
        <F p={[-0.16, 2.06, FZ]} s={[0.13, 0.035, 0.02]} c={DARK} />
        <F p={[0.16, 2.1, FZ]} s={[0.13, 0.035, 0.02]} c={DARK} rot={[0, 0, 0.2]} />
        <F p={[0.05, 1.715, FZ]} s={[0.09, 0.04, 0.02]} c={MOUTH} />
      </group>

      {/* Lo lắng: lông mày xệ, miệng run, giọt mồ hôi */}
      <group ref={face('worried')} visible={false}>
        <OpenEyes eyesRef={eye('worried')} />
        <Brows rot={-0.35} y={2.05} />
        <F p={[-0.07, 1.715, FZ]} s={[0.06, 0.035, 0.02]} c={MOUTH} />
        <F p={[0, 1.73, FZ]} s={[0.06, 0.035, 0.02]} c={MOUTH} />
        <F p={[0.07, 1.715, FZ]} s={[0.06, 0.035, 0.02]} c={MOUTH} />
        <group ref={sweat}>
          <F p={[side * 0.42, 2.1, 0.2]} s={[0.07, 0.1, 0.07]} c={WATER} glow="#0369a1" />
          <F p={[side * 0.42, 2.17, 0.2]} s={[0.04, 0.04, 0.04]} c={WATER} glow="#0369a1" />
        </group>
      </group>
    </>
  );
}

/** Các phụ kiện đội đầu / đeo mặt */
function Accessory({ id }: { id: string }) {
  switch (id) {
    case 'acc-cap':
      return (
        <>
          <Vox p={[0, 2.4, 0]} s={[0.86, 0.18, 0.86]} c="#ef4444" />
          <Vox p={[0, 2.34, 0.55]} s={[0.6, 0.06, 0.36]} c="#dc2626" />
        </>
      );
    case 'acc-headband':
      return (
        <>
          <Vox p={[0, 2.15, 0]} s={[0.84, 0.1, 0.84]} c="#ec4899" />
          <Vox p={[0.3, 2.3, 0.3]} s={[0.2, 0.14, 0.08]} c="#f472b6" />
        </>
      );
    case 'acc-glasses':
      return (
        <>
          {[-1, 1].map((side) => (
            <group key={side}>
              <Vox p={[side * 0.16, 2.02, 0.4]} s={[0.24, 0.04, 0.03]} c="#111827" castShadow={false} />
              <Vox p={[side * 0.16, 1.82, 0.4]} s={[0.24, 0.04, 0.03]} c="#111827" castShadow={false} />
              <Vox p={[side * 0.27, 1.92, 0.4]} s={[0.04, 0.24, 0.03]} c="#111827" castShadow={false} />
              <Vox p={[side * 0.05, 1.92, 0.4]} s={[0.04, 0.24, 0.03]} c="#111827" castShadow={false} />
            </group>
          ))}
          <Vox p={[0, 1.95, 0.4]} s={[0.08, 0.04, 0.03]} c="#111827" castShadow={false} />
        </>
      );
    case 'acc-headphones':
      return (
        <>
          <Vox p={[0, 2.42, 0]} s={[0.9, 0.1, 0.2]} c="#334155" />
          <Vox p={[-0.43, 2.2, 0]} s={[0.1, 0.36, 0.2]} c="#334155" />
          <Vox p={[0.43, 2.2, 0]} s={[0.1, 0.36, 0.2]} c="#334155" />
          <Vox p={[-0.46, 1.92, 0]} s={[0.14, 0.3, 0.3]} c="#22d3ee" glow="#0e7490" />
          <Vox p={[0.46, 1.92, 0]} s={[0.14, 0.3, 0.3]} c="#22d3ee" glow="#0e7490" />
        </>
      );
    case 'acc-bunny':
      return (
        <>
          {[-0.2, 0.2].map((xx) => (
            <group key={xx}>
              <Vox p={[xx, 2.68, 0]} s={[0.16, 0.6, 0.1]} c="#ffffff" />
              <Vox p={[xx, 2.68, 0.055]} s={[0.08, 0.45, 0.02]} c="#f9a8d4" castShadow={false} />
            </group>
          ))}
        </>
      );
    case 'acc-wizard':
      return (
        <>
          <Vox p={[0, 2.38, 0]} s={[1.1, 0.08, 1.1]} c="#6d28d9" />
          <Vox p={[0, 2.55, 0]} s={[0.7, 0.3, 0.7]} c="#7c3aed" />
          <Vox p={[0, 2.8, -0.05]} s={[0.46, 0.25, 0.46]} c="#7c3aed" />
          <Vox p={[0, 3.0, -0.12]} s={[0.24, 0.2, 0.24]} c="#7c3aed" />
          <Vox p={[0, 2.6, 0.36]} s={[0.14, 0.14, 0.02]} c="#fde047" glow="#facc15" />
        </>
      );
    case 'acc-crown':
      return (
        <>
          <Vox p={[0, 2.42, 0]} s={[0.7, 0.12, 0.7]} c="#facc15" glow="#a16207" />
          {[-0.27, 0, 0.27].map((xx) => (
            <Vox key={xx} p={[xx, 2.56, 0.3]} s={[0.12, 0.18, 0.08]} c="#facc15" glow="#a16207" />
          ))}
          <Vox p={[0, 2.42, 0.36]} s={[0.1, 0.1, 0.02]} c="#ef4444" glow="#ef4444" />
        </>
      );
    default:
      return null;
  }
}
