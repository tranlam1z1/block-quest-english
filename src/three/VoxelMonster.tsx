// ============================================================
// Quái vật dạng khối dễ thương: Slime Khối, Ma Bí Ngô, Nấm Nhún Nhảy, Robot Đá, Rồng Gỗ
// ============================================================
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MonsterDef } from '../game/monsters';
import type { FxEvent } from '../stores/battle';
import { CuteEyes, Vox, applyFlash, ease } from './Voxel';
import { emitBurst } from './effects/Particles';

const WHITE = new THREE.Color('#ffffff');

interface Props {
  monster: MonsterDef;
  position?: [number, number, number];
  facing?: number;
  getFx?: () => FxEvent;
}

export function VoxelMonster({ monster, position = [0, 0, 0], facing = 0, getFx }: Props) {
  const root = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Group>(null);
  const wingR = useRef<THREE.Group>(null);
  const handled = useRef({ hit: 0, die: 0 });
  const scale = monster.tier === 'boss' ? 1.35 : monster.tier === 'elite' ? 1.15 : 1;

  useFrame(({ clock }) => {
    const g = root.current;
    const inn = inner.current;
    if (!g || !inn) return;
    const t = clock.getElapsedTime();
    const fx = getFx?.();
    const dt = fx ? (performance.now() - fx.at) / 1000 : 99;

    let x = 0;
    let y = 0;
    let s = 1;
    let spin = 0;
    let flash = 0;
    // Chuyển động "đứng chờ" theo loại quái
    let sy = 1;
    switch (monster.kind) {
      case 'slime':
        sy = 1 + Math.sin(t * 4) * 0.07;
        break;
      case 'pumpkin':
        y = 0.25 + Math.sin(t * 2) * 0.15;
        break;
      case 'mushroom':
        y = Math.abs(Math.sin(t * 3.5)) * 0.18;
        break;
      case 'robot':
        y = Math.sin(t * 2) * 0.03;
        break;
      case 'dragon':
        y = 0.2 + Math.sin(t * 2.5) * 0.12;
        break;
    }
    if (wingL.current && wingR.current) {
      const flap = Math.sin(t * 6) * 0.35;
      wingL.current.rotation.z = 0.3 + flap;
      wingR.current.rotation.z = -0.3 - flap;
    }

    if (fx?.kind === 'playerAttack' && dt > 0.45 && dt < 1.0) {
      // Trúng đòn: rung lắc + nháy trắng + tia sáng
      const k = 1 - (dt - 0.45) / 0.55;
      x = Math.sin(dt * 80) * (fx.crit ? 0.2 : 0.12) * k + 0.25 * k;
      flash = k;
      if (handled.current.hit !== fx.id) {
        handled.current.hit = fx.id;
        emitBurst({
          position: [position[0], 1.1 * scale, position[2] + 0.4],
          colors: fx.crit ? ['#fde047', '#fb923c', '#ef4444', '#ffffff'] : ['#fde047', '#ffffff', '#a5f3fc'],
          count: fx.crit ? 50 : 26,
          speed: fx.crit ? 5 : 3.5,
          life: 0.6,
        });
      }
    } else if (fx?.kind === 'monsterAttack' && dt < 0.7) {
      // Lao sang trái tấn công người chơi
      x = -Math.sin(ease(dt / 0.55) * Math.PI) * 2.2;
      y += Math.sin(ease(dt / 0.55) * Math.PI) * 0.5;
    } else if (fx?.kind === 'win') {
      // Quái bị hạ: xoay tròn rồi biến mất thành hạt
      s = 1 - ease(dt / 0.7);
      spin = dt * 12;
      if (dt > 0.55 && handled.current.die !== fx.id) {
        handled.current.die = fx.id;
        emitBurst({ position: [position[0], 1, position[2]], colors: [monster.colors.main, monster.colors.accent, '#ffffff'], count: 60, speed: 4, gravity: 4, life: 1 });
      }
    } else if (fx?.kind === 'lose') {
      // Quái nhảy vui
      y += Math.abs(Math.sin(dt * 5)) * 0.4;
    }

    g.position.set(position[0] + x, position[1] + y, position[2]);
    g.rotation.set(0, facing + spin, 0);
    g.scale.setScalar(Math.max(s, 0.0001) * scale);
    inn.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    applyFlash(g, WHITE, flash);
  });

  const { main, accent } = monster.colors;
  return (
    <group ref={root} position={position}>
      <group ref={inner}>
        {monster.kind === 'slime' && <Slime main={main} accent={accent} />}
        {monster.kind === 'pumpkin' && <Pumpkin main={main} accent={accent} />}
        {monster.kind === 'mushroom' && <Mushroom main={main} accent={accent} />}
        {monster.kind === 'robot' && <Robot main={main} accent={accent} />}
        {monster.kind === 'dragon' && <Dragon main={main} accent={accent} wingL={wingL} wingR={wingR} />}
      </group>
    </group>
  );
}

type C = { main: string; accent: string };

/** Slime Khối: khối thạch trong suốt */
function Slime({ main, accent }: C) {
  return (
    <group>
      <Vox p={[0, 0.55, 0]} s={[1.3, 1.1, 1.2]} c={main} opacity={0.85} />
      <Vox p={[0, 0.4, 0]} s={[0.6, 0.5, 0.5]} c={accent} opacity={0.6} castShadow={false} />
      <Vox p={[-0.35, 1.0, 0.2]} s={[0.25, 0.12, 0.25]} c="#ffffff" opacity={0.5} castShadow={false} />
      <CuteEyes y={0.7} z={0.61} gap={0.27} size={0.17} />
      <Vox p={[0, 0.45, 0.61]} s={[0.2, 0.08, 0.03]} c="#7f1d1d" castShadow={false} />
    </group>
  );
}

/** Ma Bí Ngô: đầu bí ngô + thân "ma" trắng bay lơ lửng */
function Pumpkin({ main, accent }: C) {
  return (
    <group>
      <Vox p={[0, 0.35, 0]} s={[0.9, 0.4, 0.9]} c="#f8fafc" opacity={0.9} />
      <Vox p={[-0.25, 0.08, 0]} s={[0.3, 0.2, 0.7]} c="#f8fafc" opacity={0.9} />
      <Vox p={[0.25, 0.05, 0]} s={[0.3, 0.2, 0.7]} c="#f8fafc" opacity={0.9} />
      <Vox p={[0, 1.0, 0]} s={[1.25, 0.95, 1.2]} c={main} />
      {[-0.42, 0, 0.42].map((xx) => (
        <Vox key={xx} p={[xx, 1.0, 0.605]} s={[0.07, 0.85, 0.02]} c="#ea580c" castShadow={false} />
      ))}
      <Vox p={[0, 1.58, 0]} s={[0.16, 0.25, 0.16]} c="#78350f" />
      <Vox p={[0.2, 1.55, 0]} s={[0.3, 0.06, 0.2]} c={accent} />
      <CuteEyes y={1.1} z={0.62} gap={0.24} size={0.16} />
      <Vox p={[0, 0.8, 0.62]} s={[0.3, 0.08, 0.03]} c="#7c2d12" castShadow={false} />
    </group>
  );
}

/** Nấm Nhún Nhảy: mũ đỏ chấm trắng */
function Mushroom({ main, accent }: C) {
  return (
    <group>
      <Vox p={[-0.2, 0.08, 0.05]} s={[0.25, 0.16, 0.35]} c="#92400e" />
      <Vox p={[0.2, 0.08, 0.05]} s={[0.25, 0.16, 0.35]} c="#92400e" />
      <Vox p={[0, 0.5, 0]} s={[0.7, 0.75, 0.65]} c={accent} />
      <CuteEyes y={0.6} z={0.33} gap={0.17} size={0.12} />
      <Vox p={[0, 0.4, 0.33]} s={[0.12, 0.06, 0.02]} c="#9f1239" castShadow={false} />
      <Vox p={[0, 1.05, 0]} s={[1.4, 0.45, 1.4]} c={main} />
      <Vox p={[0, 1.35, 0]} s={[0.95, 0.2, 0.95]} c={main} />
      {[
        [-0.4, 1.12, 0.71],
        [0.35, 1.0, 0.71],
        [0.71, 1.1, 0.2],
        [-0.71, 1.0, -0.2],
        [0.1, 1.46, 0.2],
        [-0.25, 1.46, -0.25],
      ].map((p, i) => (
        <Vox key={i} p={p as [number, number, number]} s={[0.2, 0.16, 0.2]} c="#ffffff" castShadow={false} />
      ))}
    </group>
  );
}

/** Robot Đá: thân đá xám, mắt phát sáng */
function Robot({ main, accent }: C) {
  return (
    <group>
      <Vox p={[-0.25, 0.32, 0]} s={[0.32, 0.64, 0.38]} c="#64748b" />
      <Vox p={[0.25, 0.32, 0]} s={[0.32, 0.64, 0.38]} c="#64748b" />
      <Vox p={[0, 1.05, 0]} s={[1.0, 0.9, 0.7]} c={main} />
      <Vox p={[-0.2, 1.25, 0.36]} s={[0.25, 0.2, 0.02]} c="#cbd5e1" castShadow={false} />
      <Vox p={[0, 1.0, 0.36]} s={[0.3, 0.3, 0.02]} c={accent} glow={accent} castShadow={false} />
      <Vox p={[-0.68, 1.0, 0]} s={[0.32, 0.85, 0.36]} c="#64748b" />
      <Vox p={[0.68, 1.0, 0]} s={[0.32, 0.85, 0.36]} c="#64748b" />
      <Vox p={[-0.68, 0.5, 0.05]} s={[0.4, 0.3, 0.42]} c={main} />
      <Vox p={[0.68, 0.5, 0.05]} s={[0.4, 0.3, 0.42]} c={main} />
      <Vox p={[0, 1.85, 0]} s={[0.85, 0.65, 0.7]} c={main} />
      {[-0.2, 0.2].map((xx) => (
        <Vox key={xx} p={[xx, 1.9, 0.36]} s={[0.2, 0.14, 0.02]} c={accent} glow={accent} castShadow={false} />
      ))}
      <Vox p={[0, 1.7, 0.36]} s={[0.3, 0.06, 0.02]} c="#334155" castShadow={false} />
      <Vox p={[0, 2.3, 0]} s={[0.06, 0.25, 0.06]} c="#475569" />
      <Vox p={[0, 2.48, 0]} s={[0.16, 0.16, 0.16]} c="#f472b6" glow="#ec4899" />
      {/* Vết rêu cho cảm giác "đá" */}
      <Vox p={[0.35, 1.45, 0.3]} s={[0.25, 0.12, 0.12]} c="#84cc16" castShadow={false} />
      <Vox p={[-0.38, 2.12, 0.2]} s={[0.15, 0.06, 0.25]} c="#84cc16" castShadow={false} />
    </group>
  );
}

/** Rồng Gỗ (Boss): thân gỗ, cánh lá */
function Dragon({ main, accent, wingL, wingR }: C & { wingL: RefObject<THREE.Group | null>; wingR: RefObject<THREE.Group | null> }) {
  return (
    <group>
      {/* Chân */}
      {[
        [-0.35, 0.2, 0.35],
        [0.35, 0.2, 0.35],
        [-0.35, 0.2, -0.4],
        [0.35, 0.2, -0.4],
      ].map((p, i) => (
        <Vox key={i} p={p as [number, number, number]} s={[0.28, 0.4, 0.28]} c="#78350f" />
      ))}
      {/* Thân + bụng */}
      <Vox p={[0, 0.85, 0]} s={[1.05, 0.9, 1.3]} c={main} />
      <Vox p={[0, 0.75, 0.66]} s={[0.7, 0.6, 0.02]} c="#fde68a" castShadow={false} />
      {/* Vân gỗ */}
      <Vox p={[0.53, 0.95, 0]} s={[0.02, 0.08, 1.0]} c="#713f12" castShadow={false} />
      <Vox p={[-0.53, 0.7, 0]} s={[0.02, 0.08, 1.0]} c="#713f12" castShadow={false} />
      {/* Đuôi */}
      <Vox p={[0, 0.7, -0.85]} s={[0.5, 0.45, 0.5]} c={main} />
      <Vox p={[0, 0.65, -1.2]} s={[0.35, 0.32, 0.4]} c={main} />
      <Vox p={[0, 0.75, -1.45]} s={[0.4, 0.3, 0.2]} c={accent} />
      {/* Đầu */}
      <Vox p={[0, 1.6, 0.45]} s={[0.9, 0.8, 0.8]} c={main} />
      <Vox p={[0, 1.42, 0.95]} s={[0.6, 0.38, 0.35]} c="#ca8a04" />
      <Vox p={[-0.14, 1.5, 1.13]} s={[0.07, 0.07, 0.02]} c="#422006" castShadow={false} />
      <Vox p={[0.14, 1.5, 1.13]} s={[0.07, 0.07, 0.02]} c="#422006" castShadow={false} />
      <CuteEyes y={1.72} z={0.86} gap={0.25} size={0.15} />
      {/* Sừng lá */}
      <Vox p={[-0.28, 2.1, 0.35]} s={[0.12, 0.3, 0.12]} c={accent} />
      <Vox p={[0.28, 2.1, 0.35]} s={[0.12, 0.3, 0.12]} c={accent} />
      {/* Gai lưng lá */}
      {[0.1, -0.3, -0.7].map((z) => (
        <Vox key={z} p={[0, 1.38, z]} s={[0.1, 0.22, 0.25]} c={accent} />
      ))}
      {/* Cánh lá */}
      <group ref={wingL} position={[-0.5, 1.25, -0.1]}>
        <Vox p={[-0.55, 0.15, 0]} s={[1.0, 0.08, 0.7]} c={accent} />
        <Vox p={[-0.9, 0.2, 0]} s={[0.4, 0.06, 0.4]} c="#65a30d" />
      </group>
      <group ref={wingR} position={[0.5, 1.25, -0.1]}>
        <Vox p={[0.55, 0.15, 0]} s={[1.0, 0.08, 0.7]} c={accent} />
        <Vox p={[0.9, 0.2, 0]} s={[0.4, 0.06, 0.4]} c="#65a30d" />
      </group>
    </group>
  );
}
