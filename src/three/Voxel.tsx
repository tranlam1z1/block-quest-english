// ============================================================
// Khối vuông cơ bản để ghép nhân vật / quái vật + tiện ích hiệu ứng nháy sáng
// ============================================================
import * as THREE from 'three';

type V3 = [number, number, number];

interface VoxProps {
  /** Vị trí tâm khối */
  p: V3;
  /** Kích thước [rộng, cao, sâu] */
  s: V3;
  /** Màu */
  c: string;
  /** Màu phát sáng (mắt robot, viên ngọc…) */
  glow?: string;
  opacity?: number;
  rot?: V3;
  castShadow?: boolean;
}

/** Một khối hộp màu, bóng phẳng kiểu voxel */
export function Vox({ p, s, c, glow, opacity, rot, castShadow = true }: VoxProps) {
  return (
    <mesh position={p} rotation={rot} castShadow={castShadow}>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={c}
        emissive={glow ?? '#000000'}
        emissiveIntensity={glow ? 1.2 : 1}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        flatShading
        roughness={0.85}
      />
    </mesh>
  );
}

/** Đôi mắt dễ thương: đen + chấm sáng, kèm má hồng */
export function CuteEyes({ y, z, gap = 0.25, size = 0.16, blush = true }: { y: number; z: number; gap?: number; size?: number; blush?: boolean }) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Vox p={[side * gap, y, z]} s={[size, size * 1.4, 0.04]} c="#1f2937" castShadow={false} />
          <Vox p={[side * gap - size * 0.2, y + size * 0.3, z + 0.025]} s={[size * 0.35, size * 0.35, 0.02]} c="#ffffff" castShadow={false} />
          {blush && <Vox p={[side * (gap + size * 0.9), y - size * 0.9, z]} s={[size * 0.9, size * 0.4, 0.03]} c="#f9a8d4" castShadow={false} />}
        </group>
      ))}
    </group>
  );
}

/**
 * Làm cả nhóm khối nháy màu (trúng đòn: trắng / đỏ). amount = 0 → trở về bình thường.
 */
export function applyFlash(root: THREE.Object3D | null, color: THREE.Color, amount: number) {
  if (!root) return;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const m = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    if (!m.userData.baseEmissive) {
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseIntensity = m.emissiveIntensity;
    }
    const base = m.userData.baseEmissive as THREE.Color;
    if (amount > 0.001) {
      m.emissive.copy(base).lerp(color, amount);
      m.emissiveIntensity = Math.max(m.userData.baseIntensity as number, 1);
    } else {
      m.emissive.copy(base);
      m.emissiveIntensity = m.userData.baseIntensity as number;
    }
  });
}

/** Hàm làm mượt 0→1 */
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
