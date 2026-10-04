// ============================================================
// Cảnh chiến đấu 3D: người chơi (trái) vs quái vật (phải)
// ============================================================
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBattle, type FxEvent } from '../stores/battle';
import { useProgress } from '../stores/progress';
import { VoxelCharacter } from './VoxelCharacter';
import { VoxelMonster } from './VoxelMonster';
import { CameraRig, Scenery } from './World';
import { Fireworks, Particles } from './effects/Particles';
import { ease } from './Voxel';
import { GemDrop } from './Gem3D';
import { playerMood } from './mood';

const PLAYER_POS: [number, number, number] = [-2.2, 0, 0];
const MONSTER_POS: [number, number, number] = [2.2, 0, 0];

// Đọc sự kiện hiệu ứng trực tiếp từ store (không làm React render lại mỗi khung hình)
const getFx = () => useBattle.getState().fx;

/**
 * Viên năng lượng phát sáng bay từ đũa phép tới mục tiêu khi sự kiện `kind` xảy ra
 * (mặc định: người chơi trả lời đúng → bay tới quái).
 */
export function Projectile({
  getFx: read = getFx,
  kind = 'playerAttack',
  from = PLAYER_POS[0] + 0.9,
  to = MONSTER_POS[0],
  colors = ['#fff7ae', '#facc15'],
}: {
  getFx?: () => FxEvent;
  kind?: FxEvent['kind'];
  from?: number;
  to?: number;
  colors?: [string, string];
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const fx = read();
    const dt = (performance.now() - fx.at) / 1000;
    if (fx.kind !== kind || dt < 0.15 || dt > 0.45) {
      g.visible = false;
      return;
    }
    const p = ease((dt - 0.15) / 0.3);
    g.visible = true;
    g.position.set(THREE.MathUtils.lerp(from, to, p), 1.25 + Math.sin(p * Math.PI) * 0.7, 0.4);
    g.rotation.set(dt * 15, dt * 12, 0);
    g.scale.setScalar(fx.crit ? 1.6 : 1);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshBasicMaterial color={colors[0]} toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshBasicMaterial color={colors[1]} transparent opacity={0.35} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function BattleScene() {
  const monster = useBattle((s) => s.monster);
  const phase = useBattle((s) => s.phase);
  const avatar = useProgress((s) => s.avatar);
  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 45, position: [0, 2.6, 7.2] }} gl={{ antialias: true }}>
      <Scenery />
      <CameraRig getFx={getFx} />
      <VoxelCharacter avatar={avatar} position={PLAYER_POS} facing={0.7} getFx={getFx} getMood={playerMood} />
      {monster && <VoxelMonster key={monster.name + monster.tier} monster={monster} position={MONSTER_POS} facing={-0.6} getFx={getFx} />}
      <Projectile />
      <GemDrop position={MONSTER_POS} />
      <Particles />
      <Fireworks active={phase === 'won'} />
    </Canvas>
  );
}
