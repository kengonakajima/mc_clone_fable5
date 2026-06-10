import { CHUNK_X, CHUNK_Z, BLOCK, getBlock, getWaterLevel, setWater, setAir, chunkKey, chunks } from './world.js';

// --- 水流シミュレーション ---
// 250ms ごとに pending のセルだけ水位を再計算する。
// ルール: 上が水なら 8 (落水)。それ以外は横の水の実効水位+1 の最小 (7 まで)。
// どちらも該当しなければ水は消える。この再計算1つで拡散も後退も起きる。
// 水源 (level 0) は再計算しない。

const HDIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let pending = new Set(); // "wx,wy,wz"
const fallingCells = new Set(); // 現在落水 (level 8) のセル。しぶき発生点の検出用

export function scheduleWater(wx, wy, wz) {
  pending.add(wx + ',' + wy + ',' + wz);
}

export function scheduleWaterNeighbors(wx, wy, wz) {
  scheduleWater(wx, wy + 1, wz);
  scheduleWater(wx, wy - 1, wz);
  for (const [dx, dz] of HDIRS) scheduleWater(wx + dx, wy, wz + dz);
}

// 落水 (8) と水源 (0) は横に広がるとき level 0 として扱う
function effLevel(L) {
  return L === 8 ? 0 : L;
}

// --- 穴探索 ---
// 水が流れ込める場所 (空気か水)
function canFlowInto(b) {
  return b === BLOCK.AIR || b === BLOCK.WATER;
}

// (wx,wy,wz) の水が方向 (dx,dz) に広がるとき、4ブロック以内で
// 下に落ちられる場所までの最短歩数 (1..4) を返す。なければ 5
function slopeDistance(wx, wy, wz, dx, dz) {
  const visited = new Set([wx + ',' + wz]);
  let frontier = [[wx + dx, wz + dz]];
  for (let dist = 1; dist <= 4; dist++) {
    const next = [];
    for (const [x, z] of frontier) {
      const key = x + ',' + z;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!canFlowInto(getBlock(x, wy, z))) continue;
      if (getBlock(x, wy - 1, z) === BLOCK.AIR) return dist;
      for (const [ex, ez] of HDIRS) next.push([x + ex, z + ez]);
    }
    frontier = next;
  }
  return 5;
}

// (wx,wy,wz) の水が方向 (dx,dz) へ広がるか。
// 穴への距離が最小の方向にだけ流れる。どの方向にも穴がなければ全方向に流れる
function flowsToward(wx, wy, wz, dx, dz) {
  const dists = HDIRS.map(([ex, ez]) => slopeDistance(wx, wy, wz, ex, ez));
  const min = Math.min(...dists);
  if (min === 5) return true;
  for (let i = 0; i < 4; i++) {
    if (HDIRS[i][0] === dx && HDIRS[i][1] === dz) return dists[i] === min;
  }
  return false;
}

// 変更セルのチャンクを再メッシュ対象にする。境界セルは隣チャンクも
// (コーナー高さが斜め隣のブロックまで読むため、角では斜めのチャンクも含む)
function markDirty(dirty, wx, wz) {
  const cx = Math.floor(wx / CHUNK_X);
  const cz = Math.floor(wz / CHUNK_Z);
  const lx = wx - cx * CHUNK_X;
  const lz = wz - cz * CHUNK_Z;
  const xs = [cx];
  const zs = [cz];
  if (lx === 0) xs.push(cx - 1);
  if (lx === CHUNK_X - 1) xs.push(cx + 1);
  if (lz === 0) zs.push(cz - 1);
  if (lz === CHUNK_Z - 1) zs.push(cz + 1);
  for (const x of xs) for (const z of zs) dirty.add(chunkKey(x, z));
}

// 滝のしぶき発生点のリストを返す。
// 落水柱の足元セルの四辺のうち、隣が静水・地面に接している辺の中央
// (隣の水面または地面の高さ) に置き、外向き (dx,dz) を添える
export function getSplashPoints() {
  const points = [];
  for (const key of fallingCells) {
    const [wx, wy, wz] = key.split(',').map(Number);
    // チャンク破棄などで実体がなくなった登録は掃除する
    if (getBlock(wx, wy, wz) !== BLOCK.WATER || getWaterLevel(wx, wy, wz) !== 8) {
      fallingCells.delete(key);
      continue;
    }
    const below = getBlock(wx, wy - 1, wz);
    if (below === BLOCK.AIR) continue; // まだ落ちる途中
    if (below === BLOCK.WATER && getWaterLevel(wx, wy - 1, wz) === 8) continue; // 下も落水
    for (const [dx, dz] of HDIRS) {
      const nb = getBlock(wx + dx, wy, wz + dz);
      let ys;
      if (nb === BLOCK.WATER) {
        const L = getWaterLevel(wx + dx, wy, wz + dz);
        if (L === 8) continue; // 同じ滝の一部
        ys = wy + (8 - L) / 9; // 隣の水面の高さ
      } else if (nb === BLOCK.AIR) {
        const b2 = getBlock(wx + dx, wy - 1, wz + dz);
        if (b2 === BLOCK.WATER) {
          const L2 = getWaterLevel(wx + dx, wy - 1, wz + dz);
          ys = wy - 1 + (L2 === 8 ? 1 : (8 - L2) / 9); // 1段下の水面
        } else if (b2 !== BLOCK.AIR) {
          ys = wy; // 地面の上
        } else {
          continue;
        }
      } else {
        continue; // 壁
      }
      points.push({ x: wx + 0.5 + dx * 0.5, y: ys, z: wz + 0.5 + dz * 0.5, dx, dz });
    }
  }
  return points;
}

// 1 tick 分更新し、再メッシュが必要なチャンクキーの Set を返す
export function tickWater() {
  const cells = pending;
  pending = new Set();
  const dirty = new Set();
  for (const key of cells) {
    const [wx, wy, wz] = key.split(',').map(Number);
    // 未ロードチャンクには流さない (書き込めず毎 tick 再計算し続けてしまう)
    if (!chunks.has(chunkKey(Math.floor(wx / CHUNK_X), Math.floor(wz / CHUNK_Z)))) continue;
    const b = getBlock(wx, wy, wz);
    if (b !== BLOCK.AIR && b !== BLOCK.WATER) continue;
    const cur = b === BLOCK.WATER ? getWaterLevel(wx, wy, wz) : -1; // -1 = 水なし
    if (cur === 0) continue;
    let d = -1;
    if (getBlock(wx, wy + 1, wz) === BLOCK.WATER) {
      d = 8;
    } else {
      for (const [dx, dz] of HDIRS) {
        if (getBlock(wx + dx, wy, wz + dz) !== BLOCK.WATER) continue;
        // 下に流れられる水 (下が空気 or 落水) は横に広がらず落ち続ける
        const belowB = getBlock(wx + dx, wy - 1, wz + dz);
        if (belowB === BLOCK.AIR) continue;
        if (belowB === BLOCK.WATER && getWaterLevel(wx + dx, wy - 1, wz + dz) === 8) continue;
        // 隣の水がこちら向きに流れない方向なら受け取らない (穴探索)
        if (!flowsToward(wx + dx, wy, wz + dz, -dx, -dz)) continue;
        const e = effLevel(getWaterLevel(wx + dx, wy, wz + dz)) + 1;
        if (e <= 7 && (d === -1 || e < d)) d = e;
      }
    }
    if (d === cur) continue;
    if (d === -1) setAir(wx, wy, wz);
    else setWater(wx, wy, wz, d);
    if (d === 8) fallingCells.add(key);
    else fallingCells.delete(key);
    markDirty(dirty, wx, wz);
    scheduleWaterNeighbors(wx, wy, wz);
  }
  return dirty;
}
