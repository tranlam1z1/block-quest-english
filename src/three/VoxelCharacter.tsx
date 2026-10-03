// ============================================================
// Nhân vật người chơi dạng khối — tùy chỉnh da, tóc, kiểu tóc, áo, quần, phụ kiện, trang phục
// ============================================================
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { resolveAvatar, type Avatar } from '../game/cosmetics';
import type { FxEvent } from '../stores/battle';
import { Vox, applyFlash, ease } from './Voxel';
import { emitBurst } from './effects/Particles';

const RED = new THREE.Color('#ff3b3b');
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Props {
  avatar: Avatar;
  position?: [number, number, number];
  /** Góc quay quanh trục Y (hướng mặt) */
  facing?: number;
  /** Hàm đọc sự kiện hiệu ứng hiện tại (không gây render lại) */
  getFx?: () => FxEvent;
  /** Xoay chậm để ngắm (dùng ở cửa hàng) */
  autoRotate?: boolean;
  /** Hướng lao tới khi tấn công: 1 = sang phải (người chơi), -1 = sang trái (đối thủ bên phải) */
  dir?: 1 | -1;
}

export function VoxelCharacter({ avatar, position = [0, 0, 0], facing = 0, getFx, autoRotate, dir = 1 }: Props) {
  const root = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const handled = useRef(0);
  const look = useMemo(() => resolveAvatar(avatar), [avatar]);

  useFrame(({ clock }) => {
    const g = root.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    const fx = getFx?.();
    const dt = fx ? (performance.now() - fx.at) / 1000 : 99;

    // Mặc định: đứng thở nhẹ
    let x = 0;
    let y = Math.sin(t * 3) * 0.04;
    let rotZ = 0;
    let armSwing = Math.sin(t * 3) * 0.1;
    let flash = 0;

    if (fx?.kind === 'playerAttack' && dt < 0.7) {
      // Lao lên và vung đũa phép
      x = Math.sin(ease(dt / 0.5) * Math.PI) * 0.7;
      armSwing = -Math.sin(Math.min(dt / 0.35, 1) * Math.PI) * 2.2;
    } else if (fx?.kind === 'monsterAttack' && dt > 0.3 && dt < 0.9) {
      // Bị trúng đòn: rung + nháy đỏ
      const k = 1 - (dt - 0.3) / 0.6;
      x = Math.sin(dt * 70) * 0.1 * k - 0.2 * k;
      flash = k;
      if (handled.current !== fx.id) {
        handled.current = fx.id;
        emitBurst({ position: [position[0], 1.3, position[2] + 0.3], colors: ['#ffffff', '#fca5a5', '#ef4444'], count: 18, speed: 3, life: 0.5 });
      }
    } else if (fx?.kind === 'win') {
      // Nhảy mừng chiến thắng
      y = Math.abs(Math.sin(dt * 6)) * 0.45;
      armSwing = -2.6;
    } else if (fx?.kind === 'lose') {
      // Ngã ra sau
      rotZ = ease(dt / 0.6) * 1.35;
      y = -ease(dt / 0.6) * 0.15;
    }

    // Các chuyển động trên tính cho nhân vật đứng bên trái (lao sang phải); dir = -1 thì lật lại
    g.position.set(position[0] + x * dir, position[1] + y, position[2]);
    g.rotation.set(0, facing + (autoRotate ? Math.sin(t * 0.6) * 0.6 : 0), 0);
    g.rotateOnWorldAxis(Z_AXIS, rotZ * dir);
    if (armR.current) armR.current.rotation.x = armSwing;
    if (armL.current) armL.current.rotation.x = -armSwing * 0.5;
    applyFlash(g, RED, flash);
  });

  const { skin, crystal, hair, hairStyle, shirt, shirtAccent, shirtPattern, pants, accessory, outfit } = look;
  const armor = outfit === 'outfit-dragon';
  // Da pha lê: trong suốt nhẹ và phát sáng
  const S = (p: [number, number, number], s: [number, number, number]) =>
    crystal ? <Vox p={p} s={s} c={skin} glow="#3b82f6" opacity={0.92} /> : <Vox p={p} s={s} c={skin} />;
  const sleeve = armor ? '#b91c1c' : shirt;

  return (
    <group ref={root} position={position}>
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

      {/* Đầu + mặt */}
      {S([0, 1.88, 0], [0.76, 0.76, 0.76])}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Vox p={[side * 0.16, 1.92, 0.385]} s={[0.12, 0.17, 0.02]} c="#1f2937" castShadow={false} />
          <Vox p={[side * 0.16 - 0.025, 1.97, 0.4]} s={[0.04, 0.04, 0.01]} c="#ffffff" castShadow={false} />
          <Vox p={[side * 0.27, 1.76, 0.385]} s={[0.1, 0.05, 0.02]} c="#f9a8d4" castShadow={false} />
        </group>
      ))}
      <Vox p={[0, 1.72, 0.385]} s={[0.16, 0.05, 0.02]} c="#9a3412" castShadow={false} />

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
