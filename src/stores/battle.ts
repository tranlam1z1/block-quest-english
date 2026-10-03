// ============================================================
// Trạng thái 1 trận chiến đấu theo lượt
// Luồng: ready → question → feedback → question … → won / lost (/ draw khi solo)
//
// Hai chế độ dùng chung bộ câu hỏi & khung trả lời:
//  - 'adventure': đánh quái theo HP (phiêu lưu)
//  - 'duel': solo 10 câu, ai nhiều điểm hơn thì thắng. Đối thủ là máy (bot)
//    hoặc bạn bè qua mạng (remote — nhận câu trả lời qua stores/room.ts).
//
// Mỗi câu solo: cả 2 trả lời → chốt câu (tính điểm đối thủ, tung đòn)
//               → cả 2 bấm tiếp → sang câu mới.
// ============================================================
import { create } from 'zustand';
import { getUnit } from '../content';
import { computeHit, PLAYER_MAX_HP, starsFor, COMBO_MILESTONES } from '../game/battle/rules';
import { getStages, type MonsterDef } from '../game/monsters';
import { QuestionDeck } from '../game/questions/buildQuiz';
import { getTypeInfo, type Question } from '../game/questions/types';
import { rollRewards, type BattleRewards } from '../game/rewards';
import { botOpponent, DUEL_ROUNDS, getBot, planBotAnswer, type BotAnswer, type DuelOutcome, type Opponent } from '../game/duel';
import { playSfx } from '../services/audio';
import { speechSupported } from '../services/speech';
import { reportResult } from '../services/results';
import { enabledTypeList, useSettings } from './settings';
import { useProgress, type DuelRecord } from './progress';

export type BattlePhase = 'ready' | 'question' | 'feedback' | 'won' | 'lost' | 'draw';
export type BattleMode = 'adventure' | 'duel';

/** Sự kiện hiệu ứng cho cảnh 3D (đòn đánh, trúng đòn, thắng, thua) */
export interface FxEvent {
  id: number;
  /** playerAttack = người chơi đánh; monsterAttack = đối thủ (quái / bot / bạn) đánh */
  kind: 'playerAttack' | 'monsterAttack' | 'win' | 'lose' | 'none';
  crit?: boolean;
  /** Thời điểm bắt đầu (performance.now) */
  at: number;
}

export interface AnswerResult {
  correct: boolean;
  /** Đáp án đã chọn (mode 'choice'); null = hết giờ hoặc câu sắp xếp */
  chosenIndex: number | null;
  /** Câu học sinh đã ghép (mode 'order') */
  chosenText: string | null;
  timedOut: boolean;
  damage: number;
  crit: boolean;
  points: number;
}

/** Kết quả 1 câu của một bên trong trận solo (gửi qua mạng được) */
export interface RoundAnswer {
  correct: boolean;
  /** Thời gian trả lời (ms); bằng thời gian tối đa nếu hết giờ */
  timeMs: number;
  points: number;
  crit: boolean;
}

/** Bộ câu hỏi: sinh ngẫu nhiên (QuestionDeck) hoặc danh sách cố định (solo với bạn) */
export interface Deck {
  next: () => Question;
}

/** Trạng thái riêng của trận solo */
export interface DuelState {
  opp: Opponent;
  /** Đối thủ là người chơi qua mạng */
  remote: boolean;
  /** Mã trận (solo với bạn: để bỏ qua tin nhắn của trận cũ) */
  matchId: string;
  rounds: number;
  /** Câu hiện tại (bắt đầu từ 1) */
  round: number;
  oppScore: number;
  oppCorrect: number;
  /** Chuỗi đúng liên tiếp của bot */
  botCombo: number;
  /** Câu trả lời đã định sẵn của bot cho câu hiện tại */
  plan: BotAnswer | null;
  myAnswers: Record<number, RoundAnswer>;
  oppAnswers: Record<number, RoundAnswer>;
  /** Câu gần nhất mỗi bên đã bấm "tiếp" */
  myReady: number;
  oppReady: number;
  /** Câu gần nhất đã chốt kết quả */
  finalized: number;
  /** Kết quả của đối thủ ở câu vừa chốt */
  oppResult: RoundAnswer | null;
  /** Ai thắng từng câu: 'p' người chơi, 'b' đối thủ, '-' không ai */
  history: ('p' | 'b' | '-')[];
  outcome: DuelOutcome | null;
  record: DuelRecord | null;
  /** Trận bị hủy (bạn rời phòng) */
  aborted: boolean;
}

interface BattleState {
  mode: BattleMode;
  phase: BattlePhase;
  unitId: string;
  stageIndex: number;
  monster: MonsterDef | null;
  duel: DuelState | null;
  question: Question | null;
  playerHp: number;
  monsterHp: number;
  combo: number;
  maxCombo: number;
  score: number;
  answered: number;
  correct: number;
  /** Danh sách câu sai để ôn lại cuối trận */
  wrong: { question: Question; chosen: string | null }[];
  lastResult: AnswerResult | null;
  /** Thời điểm câu hỏi hiện tại bắt đầu (performance.now) */
  questionStartedAt: number;
  /** Thời gian chuẩn mỗi câu (theo cài đặt) */
  limitMs: number;
  /** Thời gian của câu hiện tại (câu sắp xếp được lâu hơn) */
  qLimitMs: number;
  paused: boolean;
  pausedAt: number;
  fx: FxEvent;
  /** Thông báo combo mới đạt được (3/5/10), dùng để hiện banner */
  comboMilestone: number | null;
  /** true nếu dạng câu đã chọn không hợp với unit → đã dùng tất cả dạng */
  typesFallback: boolean;
  /** Phần thưởng khi thắng */
  rewards: BattleRewards | null;
  deck: Deck | null;

  setup: (unitId: string, stageIndex: number) => boolean;
  /** Chuẩn bị trận solo với máy. Trả về false nếu unit / bot không tồn tại. */
  setupDuel: (unitId: string, botLevel: string) => boolean;
  /** Chuẩn bị trận solo với bạn: bộ câu hỏi do chủ phòng gửi */
  setupRemoteDuel: (o: { unitId: string; opp: Opponent; questions: Question[]; limitMs: number; matchId: string }) => boolean;
  begin: () => void;
  /** Trả lời câu chọn đáp án */
  answer: (index: number) => void;
  /** Trả lời câu sắp xếp từ */
  answerOrder: (tokens: string[]) => void;
  timeout: () => void;
  next: () => void;
  pause: () => void;
  resume: () => void;
  /** Nhận câu trả lời / trạng thái "tiếp" của bạn qua mạng */
  receiveOpp: (matchId: string, answers: Record<number, RoundAnswer>, ready: number) => void;
  /** Bạn rời phòng giữa trận */
  abortRemote: () => void;
}

let fxCounter = 0;
const fx = (kind: FxEvent['kind'], crit = false): FxEvent => ({ id: ++fxCounter, kind, crit, at: performance.now() });

/** Trạng thái khi bắt đầu một câu hỏi mới */
function startQuestion(q: Question, limitMs: number, duel: DuelState | null) {
  const qLimitMs = Math.round(limitMs * getTypeInfo(q.type).timeFactor);
  return {
    phase: 'question' as const,
    question: q,
    questionStartedAt: performance.now(),
    qLimitMs,
    lastResult: null,
    comboMilestone: null,
    duel: duel && {
      ...duel,
      round: duel.round + 1,
      plan: duel.opp.bot ? planBotAnswer(duel.opp.bot, q.difficulty, qLimitMs) : null,
      oppResult: null,
    },
  };
}

/** Giá trị ban đầu chung cho mọi trận */
function freshBattle(limitMs: number) {
  return {
    phase: 'ready' as const,
    question: null,
    playerHp: PLAYER_MAX_HP,
    combo: 0,
    maxCombo: 0,
    score: 0,
    answered: 0,
    correct: 0,
    wrong: [],
    lastResult: null,
    limitMs,
    paused: false,
    fx: fx('none'),
    comboMilestone: null,
    rewards: null,
  };
}

function freshDuel(opp: Opponent, remote: boolean, matchId: string): DuelState {
  return {
    opp,
    remote,
    matchId,
    rounds: DUEL_ROUNDS,
    round: 0,
    oppScore: 0,
    oppCorrect: 0,
    botCombo: 0,
    plan: null,
    myAnswers: {},
    oppAnswers: {},
    myReady: 0,
    oppReady: 0,
    finalized: 0,
    oppResult: null,
    history: [],
    outcome: null,
    record: null,
    aborted: false,
  };
}

/** Bộ câu hỏi cố định (đã nhận từ chủ phòng) */
function fixedDeck(questions: Question[]): Deck {
  let i = 0;
  return { next: () => questions[i++ % questions.length] };
}

export const useBattle = create<BattleState>()((set, get) => ({
  mode: 'adventure',
  phase: 'ready',
  unitId: '',
  stageIndex: 0,
  monster: null,
  duel: null,
  question: null,
  playerHp: PLAYER_MAX_HP,
  monsterHp: 0,
  combo: 0,
  maxCombo: 0,
  score: 0,
  answered: 0,
  correct: 0,
  wrong: [],
  lastResult: null,
  questionStartedAt: 0,
  limitMs: 15000,
  qLimitMs: 15000,
  paused: false,
  pausedAt: 0,
  fx: { id: 0, kind: 'none', at: 0 },
  comboMilestone: null,
  typesFallback: false,
  rewards: null,
  deck: null,

  /** Chuẩn bị trận mới. Trả về false nếu unit/màn không tồn tại. */
  setup: (unitId, stageIndex) => {
    const unit = getUnit(unitId);
    const stage = getStages(unitId)[stageIndex];
    if (!unit || !stage) return false;
    const settings = useSettings.getState();
    const deck = new QuestionDeck(unit, enabledTypeList(settings.enabledTypes), stage.monster.tier, speechSupported());
    set({
      ...freshBattle(settings.timerSec * 1000),
      mode: 'adventure',
      unitId,
      stageIndex,
      monster: stage.monster,
      duel: null,
      monsterHp: stage.monster.maxHp,
      typesFallback: deck.usedFallbackTypes,
      deck,
    });
    return true;
  },

  setupDuel: (unitId, botLevel) => {
    const unit = getUnit(unitId);
    const bot = getBot(botLevel);
    if (!unit || !bot) return false;
    const settings = useSettings.getState();
    const deck = new QuestionDeck(unit, enabledTypeList(settings.enabledTypes), bot.tier, speechSupported());
    set({
      ...freshBattle(settings.timerSec * 1000),
      mode: 'duel',
      unitId,
      stageIndex: 0,
      monster: null,
      monsterHp: 0,
      duel: freshDuel(botOpponent(bot), false, ''),
      typesFallback: deck.usedFallbackTypes,
      deck,
    });
    return true;
  },

  setupRemoteDuel: ({ unitId, opp, questions, limitMs, matchId }) => {
    if (!getUnit(unitId) || questions.length === 0) return false;
    set({
      ...freshBattle(limitMs),
      mode: 'duel',
      unitId,
      stageIndex: 0,
      monster: null,
      monsterHp: 0,
      duel: { ...freshDuel(opp, true, matchId), rounds: questions.length },
      typesFallback: false,
      deck: fixedDeck(questions),
    });
    return true;
  },

  begin: () => {
    const { deck, limitMs, duel } = get();
    if (!deck) return;
    playSfx('start');
    set(startQuestion(deck.next(), limitMs, duel));
  },

  answer: (index) => {
    const q = get().question;
    if (!q || q.mode !== 'choice') return;
    resolve(index === q.answerIndex, { chosenIndex: index, chosenText: q.choices[index] ?? null, timedOut: false });
  },

  answerOrder: (tokens) => {
    const q = get().question;
    if (!q || q.mode !== 'order' || !q.answerTokens) return;
    const norm = (t: string[]) => t.join(' ').toLowerCase();
    resolve(norm(tokens) === norm(q.answerTokens), { chosenIndex: null, chosenText: tokens.join(' '), timedOut: false });
  },

  timeout: () => {
    resolve(false, { chosenIndex: null, chosenText: null, timedOut: true });
  },

  /** Sang câu tiếp, hoặc kết thúc trận */
  next: () => {
    const s = get();
    if (s.phase !== 'feedback' || !s.deck) return;
    if (s.mode === 'duel' && s.duel) {
      if (s.duel.myReady >= s.duel.round) return;
      set({ duel: { ...s.duel, myReady: s.duel.round } });
      tryAdvance();
      return;
    }
    if (!s.monster) return;
    if (s.monsterHp <= 0 || s.playerHp <= 0) {
      const won = s.monsterHp <= 0;
      const stars = won ? starsFor(s.playerHp) : 0;
      const progress = useProgress.getState();
      let rewards: BattleRewards | null = null;
      if (won) {
        rewards = rollRewards(s.monster.tier, stars, progress.gems, progress.dropBonus);
        progress.applyRewards(rewards);
      }
      playSfx(won ? 'win' : 'lose');
      set({ phase: won ? 'won' : 'lost', fx: fx(won ? 'win' : 'lose'), rewards });
      progress.recordBattle({
        unitId: s.unitId,
        stageIndex: s.stageIndex,
        won,
        stars,
        answered: s.answered,
        correct: s.correct,
        maxCombo: s.maxCombo,
        wrongItemIds: s.wrong.map((w) => w.question.item.id),
      });
      reportResult({
        mode: 'adventure',
        unitId: s.unitId,
        opponent: `Màn ${s.stageIndex + 1}: ${s.monster.name}`,
        outcome: won ? 'win' : 'loss',
        score: s.score,
        answered: s.answered,
        correct: s.correct,
        maxCombo: s.maxCombo,
        stars,
        wrong: s.wrong,
      });
      return;
    }
    set(startQuestion(s.deck.next(), s.limitMs, null));
  },

  pause: () => {
    // Solo với bạn: không dừng được đồng hồ (bạn vẫn đang chơi)
    if (get().paused || get().duel?.remote) return;
    set({ paused: true, pausedAt: performance.now() });
  },

  resume: () => {
    const s = get();
    if (!s.paused) return;
    // Dời mốc bắt đầu câu hỏi để không bị trừ thời gian lúc tạm dừng
    set({ paused: false, questionStartedAt: s.questionStartedAt + (performance.now() - s.pausedAt) });
  },

  receiveOpp: (matchId, answers, ready) => {
    const d = get().duel;
    if (!d || !d.remote || d.matchId !== matchId || d.outcome || d.aborted) return;
    const fresh = Object.keys(answers).some((k) => !d.oppAnswers[Number(k)]);
    if (!fresh && ready <= d.oppReady) return;
    set({ duel: { ...d, oppAnswers: { ...d.oppAnswers, ...answers }, oppReady: Math.max(d.oppReady, ready) } });
    tryFinalize();
    tryAdvance();
  },

  abortRemote: () => {
    const d = get().duel;
    if (!d || !d.remote || d.outcome) return;
    set({ duel: { ...d, aborted: true } });
  },
}));

/** Xử lý một câu trả lời (đúng → người chơi tấn công, sai/hết giờ → quái tấn công) */
function resolve(isCorrect: boolean, info: Pick<AnswerResult, 'chosenIndex' | 'chosenText' | 'timedOut'>) {
  const s = useBattle.getState();
  if (s.phase !== 'question' || !s.question || s.paused) return;
  if (s.mode === 'duel') return resolveDuel(isCorrect, info);
  if (!s.monster) return;

  if (isCorrect) {
    const timeMs = performance.now() - s.questionStartedAt;
    const combo = s.combo + 1;
    const hit = computeHit(timeMs, s.qLimitMs, combo);
    const milestone = COMBO_MILESTONES.includes(combo) ? combo : null;
    playSfx('correct');
    setTimeout(() => playSfx(hit.crit ? 'crit' : 'hit'), 400);
    if (milestone) setTimeout(() => playSfx('combo'), 150);
    useBattle.setState({
      phase: 'feedback',
      combo,
      maxCombo: Math.max(s.maxCombo, combo),
      score: s.score + hit.points.total,
      answered: s.answered + 1,
      correct: s.correct + 1,
      monsterHp: Math.max(0, s.monsterHp - hit.damage),
      lastResult: { correct: true, ...info, damage: hit.damage, crit: hit.crit, points: hit.points.total },
      fx: fx('playerAttack', hit.crit),
      comboMilestone: milestone,
    });
    return;
  }

  playSfx('wrong');
  setTimeout(() => playSfx('hurt'), 350);
  useBattle.setState({
    phase: 'feedback',
    combo: 0,
    answered: s.answered + 1,
    playerHp: Math.max(0, s.playerHp - s.monster.attack),
    wrong: [...s.wrong, { question: s.question, chosen: info.chosenText }],
    lastResult: { correct: false, ...info, damage: s.monster.attack, crit: false, points: 0 },
    fx: fx('monsterAttack'),
    comboMilestone: null,
  });
}

/** Solo: ghi nhận câu trả lời của người chơi (và của bot, nếu đối thủ là máy) */
function resolveDuel(isCorrect: boolean, info: Pick<AnswerResult, 'chosenIndex' | 'chosenText' | 'timedOut'>) {
  const s = useBattle.getState();
  const d = s.duel;
  if (!d || !s.question || d.myAnswers[d.round]) return;
  const timeMs = info.timedOut ? s.qLimitMs : Math.round(performance.now() - s.questionStartedAt);

  const combo = isCorrect ? s.combo + 1 : 0;
  const hit = isCorrect ? computeHit(timeMs, s.qLimitMs, combo) : null;
  const milestone = isCorrect && COMBO_MILESTONES.includes(combo) ? combo : null;
  const mine: RoundAnswer = { correct: isCorrect, timeMs, points: hit?.points.total ?? 0, crit: hit?.crit ?? false };
  playSfx(isCorrect ? 'correct' : 'wrong');
  if (milestone) setTimeout(() => playSfx('combo'), 150);

  // Bot trả lời theo kế hoạch đã định sẵn từ đầu câu
  let botPart: Partial<DuelState> = {};
  if (d.opp.bot && d.plan) {
    const botCombo = d.plan.correct ? d.botCombo + 1 : 0;
    const botHit = d.plan.correct ? computeHit(d.plan.timeMs, s.qLimitMs, botCombo) : null;
    botPart = {
      botCombo,
      oppAnswers: { ...d.oppAnswers, [d.round]: { correct: d.plan.correct, timeMs: d.plan.timeMs, points: botHit?.points.total ?? 0, crit: botHit?.crit ?? false } },
      oppReady: d.round,
    };
  }

  useBattle.setState({
    phase: 'feedback',
    combo,
    maxCombo: Math.max(s.maxCombo, combo),
    score: s.score + mine.points,
    answered: s.answered + 1,
    correct: s.correct + (isCorrect ? 1 : 0),
    wrong: isCorrect ? s.wrong : [...s.wrong, { question: s.question, chosen: info.chosenText }],
    lastResult: { correct: isCorrect, ...info, damage: 0, crit: mine.crit, points: mine.points },
    comboMilestone: milestone,
    fx: fx('none'),
    duel: { ...d, ...botPart, myAnswers: { ...d.myAnswers, [d.round]: mine } },
  });
  tryFinalize();
}

/** Khi đã có câu trả lời của cả 2 bên: cộng điểm đối thủ, ai đúng nhanh hơn thì tung đòn */
function tryFinalize() {
  const s = useBattle.getState();
  const d = s.duel;
  if (!d || s.phase !== 'feedback' || d.finalized >= d.round) return;
  const me = d.myAnswers[d.round];
  const op = d.oppAnswers[d.round];
  if (!me || !op) return;

  const winner: 'p' | 'b' | '-' = me.correct && (!op.correct || me.timeMs <= op.timeMs) ? 'p' : op.correct ? 'b' : '-';
  if (winner === 'p') setTimeout(() => playSfx(me.crit ? 'crit' : 'hit'), 400);
  if (winner === 'b') setTimeout(() => playSfx('hurt'), 350);
  useBattle.setState({
    fx: winner === 'p' ? fx('playerAttack', me.crit) : winner === 'b' ? fx('monsterAttack', op.crit) : fx('none'),
    duel: {
      ...d,
      finalized: d.round,
      oppScore: d.oppScore + op.points,
      oppCorrect: d.oppCorrect + (op.correct ? 1 : 0),
      oppResult: op,
      history: [...d.history, winner],
    },
  });
}

/** Cả 2 bên đã xem xong kết quả câu → sang câu tiếp hoặc kết thúc */
function tryAdvance() {
  const s = useBattle.getState();
  const d = s.duel;
  if (!d || !s.deck || s.phase !== 'feedback' || d.aborted) return;
  if (d.finalized < d.round || d.myReady < d.round || d.oppReady < d.round) return;
  if (d.round >= d.rounds) finishDuel();
  else useBattle.setState(startQuestion(s.deck.next(), s.limitMs, d));
}

/** Hết 10 câu: so điểm, ghi nhận rank / vàng / kỷ lục */
function finishDuel() {
  const s = useBattle.getState();
  const d = s.duel;
  if (!d) return;
  const outcome: DuelOutcome = s.score > d.oppScore ? 'win' : s.score < d.oppScore ? 'loss' : 'draw';
  const record = useProgress.getState().recordDuel({
    unitId: s.unitId,
    stakes: d.opp.stakes,
    pvp: d.remote,
    outcome,
    score: s.score,
    answered: s.answered,
    correct: s.correct,
    maxCombo: s.maxCombo,
    wrongItemIds: s.wrong.map((w) => w.question.item.id),
  });
  reportResult({
    mode: d.remote ? 'duel-pvp' : 'duel-bot',
    unitId: s.unitId,
    opponent: d.opp.name,
    outcome,
    score: s.score,
    answered: s.answered,
    correct: s.correct,
    maxCombo: s.maxCombo,
    wrong: s.wrong,
  });
  playSfx(outcome === 'loss' ? 'lose' : 'win');
  useBattle.setState({
    phase: outcome === 'win' ? 'won' : outcome === 'loss' ? 'lost' : 'draw',
    fx: fx(outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'none'),
    duel: { ...d, outcome, record, plan: null },
  });
}

export { PLAYER_MAX_HP, starsFor };

// Chỉ khi phát triển: cho phép script kiểm thử tự động truy cập trạng thái trận
if (import.meta.env.DEV) (window as unknown as { __bqe: typeof useBattle }).__bqe = useBattle;
