import {
  applyAttack,
  autoBattle,
  battleLevel,
  commit,
  enemyOrder,
  newTheater,
  nextRound,
  resolveEnemyAttack,
  theaterRank,
  type BattleResult,
  type Order,
  type TheaterState,
} from '../sim/theater';

/**
 * The Theater prototype's state while you play (not saved): the front, this round's orders,
 * and the battles you chose to fight yourself, still to come.
 */
export interface TheaterRun {
  state: TheaterState;
  orders: Order[];
  /** Your own fights left this round (after GO). */
  queue: Order[];
  /** The fight you are in right now, if any. */
  fighting: Order | null;
}

let run: TheaterRun | null = null;

export function theaterRun(): TheaterRun {
  run ??= freshRun();
  return run;
}

export function newTheaterRun(): TheaterRun {
  run = freshRun();
  return run;
}

function freshRun(): TheaterRun {
  const seed = 1 + Math.floor(Math.random() * 999_999);
  return { state: newTheater(seed), orders: [], queue: [], fighting: null };
}

/** A battle seed for this round and order, so each fight differs. */
function fightSeed(r: TheaterRun, k: number): number {
  return r.state.seed * 31 + r.state.round * 7 + k;
}

/**
 * GO: send every ordered attack. Your generals fight theirs at once; the ones you'll fight
 * yourself wait in the queue. Returns the next fight to play, or null if the round is done.
 */
export function startRound(r: TheaterRun): Order | null {
  r.state.log = [];
  r.orders.forEach((o, k) => {
    commit(r.state, o);
    if (o.auto)
      resolveAttack(r, o, () => {
        const level = battleLevel(r.state, o.to, o.troops, r.state.zones[o.to]!.troops);
        return autoBattle(level, theaterRank(r.state, r.state.zones[o.to]!.owner), fightSeed(r, k));
      });
  });
  r.queue = r.orders.filter((o) => !o.auto);
  r.orders = [];
  return nextFight(r);
}

/** An attack on a zone you took earlier this round just reinforces it. */
function resolveAttack(r: TheaterRun, o: Order, fight: () => BattleResult): void {
  const target = r.state.zones[o.to]!;
  if (r.state.winner) return;
  if (target.owner === 'player') {
    target.troops += o.troops;
    r.state.log.push(`Reinforced ${target.name}.`);
    return;
  }
  applyAttack(r.state, o, fight());
}

/** The next fight you chose to play yourself, or null (then finish the round). */
export function nextFight(r: TheaterRun): Order | null {
  while (r.queue.length > 0) {
    const o = r.queue.shift()!;
    const target = r.state.zones[o.to]!;
    if (r.state.winner) break;
    if (target.owner === 'player') {
      resolveAttack(r, o, () => ({ won: true, survivors: 0, enemyLeft: 0 }));
      continue;
    }
    r.fighting = o;
    return o;
  }
  r.fighting = null;
  finishRound(r);
  return null;
}

/** The battle you played ended: apply it. */
export function fightDone(r: TheaterRun, result: BattleResult): void {
  const o = r.fighting;
  if (!o) return;
  r.fighting = null;
  applyAttack(r.state, o, result);
}

/** The enemy attacks, then every zone grows. */
function finishRound(r: TheaterRun): void {
  if (r.state.winner) return;
  const order = enemyOrder(r.state);
  if (order) resolveEnemyAttack(r.state, order, fightSeed(r, 99));
  if (!r.state.winner) nextRound(r.state);
}
