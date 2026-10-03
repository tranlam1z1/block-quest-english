// ============================================================
// Hệ thống hạt (khối nhỏ bay tung tóe): tia lửa khi trúng đòn, pháo hoa khi thắng
// Gọi emitBurst(...) từ bất cứ đâu, component <Particles/> sẽ vẽ.
// ============================================================
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const MAX = 700;

export interface BurstOptions {
  position: [number, number, number];
  colors: string[];
  count?: number;
  speed?: number;
  gravity?: number;
  life?: number;
  size?: number;
}

const queue: BurstOptions[] = [];

/** Phát một chùm hạt */
export function emitBurst(opts: BurstOptions) {
  queue.push(opts);
}

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  size: number;
  rot: number;
}

export function Particles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const parts = useMemo<P[]>(
    () =>
      Array.from({ length: MAX }, () => ({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        gravity: 0,
        size: 0.1,
        rot: 0,
      })),
    [],
  );
  const cursor = useRef(0);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < MAX; i++) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set('#ffffff'));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return () => {
      queue.length = 0;
    };
  }, [dummy, color]);

  useFrame((_, rawDelta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const delta = Math.min(rawDelta, 0.05);

    // Tạo hạt mới từ hàng đợi
    while (queue.length) {
      const b = queue.shift()!;
      const n = b.count ?? 24;
      for (let k = 0; k < n; k++) {
        const i = cursor.current;
        cursor.current = (cursor.current + 1) % MAX;
        const p = parts[i];
        p.alive = true;
        p.pos.set(...b.position);
        // Hướng ngẫu nhiên trên mặt cầu
        const u = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        const sp = (b.speed ?? 3) * (0.5 + Math.random() * 0.7);
        p.vel.set(r * Math.cos(th) * sp, u * sp + (b.gravity ? 1 : 0), r * Math.sin(th) * sp);
        p.maxLife = p.life = (b.life ?? 0.8) * (0.7 + Math.random() * 0.6);
        p.gravity = b.gravity ?? 0;
        p.size = (b.size ?? 0.12) * (0.6 + Math.random() * 0.8);
        p.rot = Math.random() * Math.PI;
        mesh.setColorAt(i, color.set(b.colors[k % b.colors.length]));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Cập nhật vị trí
    for (let i = 0; i < MAX; i++) {
      const p = parts[i];
      if (!p.alive) continue;
      p.life -= delta;
      if (p.life <= 0) {
        p.alive = false;
        dummy.scale.setScalar(0);
      } else {
        p.vel.y -= p.gravity * delta;
        p.vel.multiplyScalar(1 - 1.2 * delta);
        p.pos.addScaledVector(p.vel, delta);
        p.rot += delta * 4;
        dummy.position.copy(p.pos);
        dummy.rotation.set(p.rot, p.rot * 0.7, 0);
        dummy.scale.setScalar(p.size * Math.min(1, (p.life / p.maxLife) * 1.5));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Pháo hoa: bắn chùm hạt nhiều màu liên tục khi đang hiển thị */
export function Fireworks({ active }: { active: boolean }) {
  const timer = useRef(0);
  useFrame((_, delta) => {
    if (!active) return;
    timer.current -= delta;
    if (timer.current <= 0) {
      timer.current = 0.35 + Math.random() * 0.3;
      const palettes = [
        ['#facc15', '#fde047', '#ffffff'],
        ['#f472b6', '#ec4899', '#ffffff'],
        ['#60a5fa', '#38bdf8', '#ffffff'],
        ['#4ade80', '#a3e635', '#ffffff'],
        ['#fb923c', '#f87171', '#ffffff'],
      ];
      emitBurst({
        position: [(Math.random() - 0.5) * 8, 3 + Math.random() * 2, -1 - Math.random() * 2],
        colors: palettes[Math.floor(Math.random() * palettes.length)],
        count: 40,
        speed: 4,
        gravity: 3,
        life: 1.3,
        size: 0.13,
      });
    }
  });
  return null;
}
