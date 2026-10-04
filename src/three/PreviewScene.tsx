// ============================================================
// Cảnh nhỏ cho trang chủ / cửa hàng: nhân vật và (tùy chọn) quái vật đứng chơi.
// Nhân vật vẫy tay chào khi mở trang; bấm vào nhân vật để xem các hành động khác.
// ============================================================
import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Avatar } from '../game/cosmetics';
import type { MonsterDef } from '../game/monsters';
import { activeEmote, playEmote, useEmotes, type EmoteKind } from '../stores/emotes';
import { useProgress } from '../stores/progress';
import { previewMood } from './mood';
import { VoxelCharacter } from './VoxelCharacter';
import { VoxelMonster } from './VoxelMonster';
import { CameraRig, Scenery } from './World';

/** Thứ tự hành động khi bấm vào nhân vật */
const CLICK_EMOTES: EmoteKind[] = ['wave', 'dance', 'laugh', 'cheer'];

interface Props {
  monster?: MonsterDef;
  /** Avatar để xem thử (mặc định: avatar đang mặc) */
  avatar?: Avatar;
  /** Camera gần, nhân vật xoay qua lại (dùng ở cửa hàng) */
  closeUp?: boolean;
}

export function PreviewScene({ monster, avatar, closeUp }: Props) {
  const current = useProgress((s) => s.avatar);
  const a = avatar ?? current;
  const next = useRef(1);

  // Vẫy tay chào khi vừa mở trang
  useEffect(() => {
    const id = setTimeout(() => playEmote('me', 'wave'), 600);
    return () => clearTimeout(id);
  }, []);

  const onClick = () => {
    // Đang làm dở thì không đổi, tránh bấm liên tục làm giật
    if (activeEmote(useEmotes.getState().me)) return;
    playEmote('me', CLICK_EMOTES[next.current++ % CLICK_EMOTES.length]);
  };

  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 45, position: [0, 2.6, 7.2] }}>
      <Scenery />
      {closeUp ? <CameraRig target={[0, 1.3, 0]} baseDist={4.6} /> : <CameraRig />}
      <VoxelCharacter
        avatar={a}
        position={monster ? [-1.6, 0, 0.5] : [0, 0, closeUp ? 0 : 1]}
        facing={monster ? 0.6 : 0.25}
        autoRotate={closeUp}
        getMood={previewMood}
        onClick={onClick}
      />
      {monster && <VoxelMonster monster={monster} position={[1.8, 0, 0]} facing={-0.5} />}
    </Canvas>
  );
}
