// ============================================================
// Khung cảnh: nền cỏ khối, cây, mây, đèn, camera tự canh theo màn hình
// ============================================================
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Vox } from './Voxel';
import type { FxEvent } from '../stores/battle';

/** Nền cỏ ghép từ nhiều khối (dùng InstancedMesh cho nhẹ) */
export function Ground({ w = 16, d = 8 }: { w?: number; d?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = w * d;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Object3D();
    const c = new THREE.Color();
    const greens = ['#4ade80', '#22c55e', '#86efac', '#4ade80'];
    let i = 0;
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        m.position.set(x - w / 2 + 0.5, -0.5 - ((x * 7 + z * 3) % 5 === 0 ? 0.08 : 0), z - d / 2 - 1);
        m.updateMatrix();
        mesh.setMatrixAt(i, m.matrix);
        mesh.setColorAt(i, c.set(greens[(x * 13 + z * 7) % greens.length]));
        i++;
      }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [w, d]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial flatShading roughness={1} />
    </instancedMesh>
  );
}

function Tree({ p, h = 1.2 }: { p: [number, number, number]; h?: number }) {
  return (
    <group position={p}>
      <Vox p={[0, h / 2, 0]} s={[0.35, h, 0.35]} c="#92400e" />
      <Vox p={[0, h + 0.4, 0]} s={[1.2, 0.8, 1.2]} c="#16a34a" />
      <Vox p={[0, h + 0.95, 0]} s={[0.7, 0.4, 0.7]} c="#22c55e" />
    </group>
  );
}

function Flower({ p, c }: { p: [number, number, number]; c: string }) {
  return (
    <group position={p}>
      <Vox p={[0, 0.12, 0]} s={[0.05, 0.24, 0.05]} c="#15803d" castShadow={false} />
      <Vox p={[0, 0.28, 0]} s={[0.16, 0.12, 0.16]} c={c} castShadow={false} />
    </group>
  );
}

function Clouds() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (!ref.current) return;
    ref.current.position.x += d * 0.15;
    if (ref.current.position.x > 6) ref.current.position.x = -6;
  });
  return (
    <group ref={ref}>
      {[
        [-4, 5, -6],
        [2, 5.6, -7],
        [6, 4.6, -6],
        [-9, 5.2, -7],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <Vox p={[0, 0, 0]} s={[1.8, 0.5, 0.8]} c="#ffffff" castShadow={false} />
          <Vox p={[0.3, 0.35, 0]} s={[0.9, 0.4, 0.7]} c="#ffffff" castShadow={false} />
        </group>
      ))}
    </group>
  );
}

/** Cảnh nền chung */
export function Scenery() {
  const flowers = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        p: [((i * 37) % 15) - 7.5, 0, -((i * 11) % 5) - 0.5 + (i % 2 ? 1.6 : 0)] as [number, number, number],
        c: ['#f472b6', '#facc15', '#ffffff', '#a78bfa'][i % 4],
      })),
    [],
  );
  return (
    <>
      <color attach="background" args={['#bae6fd']} />
      <fog attach="fog" args={['#bae6fd', 14, 30]} />
      <hemisphereLight args={['#ffffff', '#86efac', 0.9]} />
      <directionalLight
        position={[4, 8, 5]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <Ground />
      <Tree p={[-6, 0, -3.5]} h={1.4} />
      <Tree p={[5.8, 0, -4]} />
      <Tree p={[-3.5, 0, -5]} h={1.8} />
      <Tree p={[3, 0, -5.5]} h={1.5} />
      {flowers.map((f, i) => (
        <Flower key={i} p={f.p} c={f.c} />
      ))}
      <Clouds />
    </>
  );
}

/**
 * Camera tự lùi xa khi màn hình dọc (điện thoại) để thấy đủ 2 nhân vật,
 * và rung khi có đòn đánh mạnh.
 */
export function CameraRig({ getFx, target = [0, 1, 0], baseDist = 7.2 }: { getFx?: () => FxEvent; target?: [number, number, number]; baseDist?: number }) {
  const { camera, size } = useThree();
  const [tx, ty, tz] = target;
  const look = useMemo(() => new THREE.Vector3(tx, ty, tz), [tx, ty, tz]);
  useFrame(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const dist = Math.min(13, baseDist * Math.pow(Math.max(1.75 / aspect, 1), 0.85));
    let sx = 0;
    let sy = 0;
    const fx = getFx?.();
    if (fx) {
      const dt = (performance.now() - fx.at) / 1000;
      const strong = (fx.kind === 'monsterAttack' && dt > 0.3 && dt < 0.6) || (fx.kind === 'playerAttack' && fx.crit && dt > 0.45 && dt < 0.75);
      if (strong) {
        sx = (Math.random() - 0.5) * 0.15;
        sy = (Math.random() - 0.5) * 0.15;
      }
    }
    camera.position.set(sx, ty + 1.6 + sy + (dist - baseDist) * 0.12, dist);
    camera.lookAt(look);
  });
  return null;
}
