// ============================================================
// Viên Ngọc Rồng 3D: khối pha lê lập phương xoay, phát sáng
// ============================================================
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getGem, type GemId } from '../game/gems';
import { useBattle } from '../stores/battle';
import { emitBurst } from './effects/Particles';

export function Gem3D({ gem, scale = 1 }: { gem: GemId; scale?: number }) {
  const g = getGem(gem);
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (ref.current) {
      ref.current.rotation.y += d * 1.6;
      ref.current.rotation.x += d * 0.7;
    }
  });
  return (
    <group scale={scale}>
      <group ref={ref}>
        {/* Lõi phát sáng */}
        <mesh rotation={[Math.PI / 4, 0, Math.PI / 4]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={g.color} emissive={g.color} emissiveIntensity={0.9} flatShading />
        </mesh>
        {/* Vỏ pha lê trong suốt */}
        <mesh rotation={[Math.PI / 4, 0, Math.PI / 4]}>
          <boxGeometry args={[0.72, 0.72, 0.72]} />
          <meshStandardMaterial color={g.light} transparent opacity={0.35} depthWrite={false} roughness={0.1} />
        </mesh>
      </group>
      {/* Hào quang */}
      <mesh>
        <boxGeometry args={[1.1, 1.1, 0.02]} />
        <meshBasicMaterial color={g.light} transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Ngọc rơi xuống chỗ quái vừa bị hạ (chỉ khi trận thắng có rơi ngọc) */
export function GemDrop({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const burstDone = useRef(0);
  const phase = useBattle((s) => s.phase);
  const gem = useBattle((s) => s.rewards?.gem ?? null);

  useFrame(() => {
    const grp = ref.current;
    if (!grp) return;
    const fx = useBattle.getState().fx;
    const dt = (performance.now() - fx.at) / 1000 - 0.8;
    if (fx.kind !== 'win' || dt < 0) {
      grp.visible = false;
      return;
    }
    grp.visible = true;
    // Rơi từ trên cao xuống rồi nảy nhẹ, sau đó lơ lửng
    const fall = Math.min(dt / 0.6, 1);
    const bounce = dt > 0.6 ? Math.abs(Math.sin((dt - 0.6) * 5)) * 0.4 * Math.max(0, 1 - (dt - 0.6)) : 0;
    const hover = dt > 1.6 ? Math.sin(dt * 2) * 0.1 : 0;
    grp.position.set(position[0], 3.5 - fall * fall * 2.6 + bounce + hover, position[2] + 0.3);
    if (dt > 0.6 && burstDone.current !== fx.id && gem) {
      burstDone.current = fx.id;
      const g = getGem(gem);
      emitBurst({ position: [position[0], 0.9, position[2] + 0.3], colors: [g.color, g.light, '#ffffff'], count: 40, speed: 3, life: 0.9 });
    }
  });

  if (phase !== 'won' || !gem) return null;
  return (
    <group ref={ref} visible={false}>
      <Gem3D gem={gem} scale={1.1} />
    </group>
  );
}
