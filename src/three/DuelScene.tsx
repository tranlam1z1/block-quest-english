// ============================================================
// Cảnh solo 3D: người chơi (trái) vs bot (phải). Ai thắng câu thì tung đòn.
// ============================================================
import { Canvas } from '@react-three/fiber';
import { useBattle, type FxEvent } from '../stores/battle';
import { useProgress } from '../stores/progress';
import { VoxelCharacter } from './VoxelCharacter';
import { CameraRig, Scenery } from './World';
import { Fireworks, Particles } from './effects/Particles';
import { Projectile } from './BattleScene';
import { oppMood, playerMood } from './mood';

const PLAYER_X = -2.2;
const BOT_X = 2.2;

const getFx = () => useBattle.getState().fx;

// Với bot, mọi sự kiện được nhìn "từ phía bên kia": người chơi đánh = bot trúng đòn…
const SWAP: Record<FxEvent['kind'], FxEvent['kind']> = {
  playerAttack: 'monsterAttack',
  monsterAttack: 'playerAttack',
  win: 'lose',
  lose: 'win',
  none: 'none',
};
let mapped: FxEvent = { id: -1, kind: 'none', at: 0 };
const getBotFx = () => {
  const fx = getFx();
  if (mapped.id !== fx.id) mapped = { ...fx, kind: SWAP[fx.kind] };
  return mapped;
};

export function DuelScene() {
  const avatar = useProgress((s) => s.avatar);
  const opp = useBattle((s) => s.duel?.opp);
  const phase = useBattle((s) => s.phase);
  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 45, position: [0, 2.6, 7.2] }} gl={{ antialias: true }}>
      <Scenery />
      <CameraRig getFx={getFx} />
      <VoxelCharacter avatar={avatar} position={[PLAYER_X, 0, 0]} facing={0.7} getFx={getFx} getMood={playerMood} />
      {opp && <VoxelCharacter key={opp.key} avatar={opp.avatar} position={[BOT_X, 0, 0]} facing={-0.7} getFx={getBotFx} getMood={oppMood} dir={-1} />}
      <Projectile kind="playerAttack" from={PLAYER_X + 0.9} to={BOT_X} />
      <Projectile kind="monsterAttack" from={BOT_X - 0.9} to={PLAYER_X} colors={['#fecaca', '#f43f5e']} />
      <Particles />
      <Fireworks active={phase === 'won'} />
    </Canvas>
  );
}
