import { CHUNK_X, CHUNK_Y, CHUNK_Z, BLOCK, getBlock, getWaterLevel } from './world.js';

// テクスチャレイヤ (textures/ の読み込み順): 0=草上面 1=草側面 2=土 3=石 4=砂 5=水
const BLOCK_TEX = {
  [BLOCK.GRASS]: { top: 0, side: 1, bottom: 2 },
  [BLOCK.DIRT]: { top: 2, side: 2, bottom: 2 },
  [BLOCK.STONE]: { top: 3, side: 3, bottom: 3 },
  [BLOCK.SAND]: { top: 4, side: 4, bottom: 4 },
  [BLOCK.WATER]: { top: 5, side: 5, bottom: 5 },
};

function faceTexLayer(b, f) {
  const t = BLOCK_TEX[b];
  if (f.dir[1] === 1) return t.top;
  if (f.dir[1] === -1) return t.bottom;
  return t.side;
}

// --- ライトマップ ---
// メッシュ化するチャンクの周囲 RPAD ブロック(=隣チャンク)を含む領域で計算する。
// サンライト: 空気の列に上から 15。flood fill: 透明ブロックへ 1 ずつ減衰して伝播。
const RPAD = 16;
const RX = CHUNK_X + RPAD * 2;
const RZ = CHUNK_Z + RPAD * 2;
const RY = CHUNK_Y;
const lightBuf = new Uint8Array(RX * RY * RZ);
const colTop = new Int16Array(RX * RZ); // 各列の最上段の非空気ブロックの y

function lightIndex(rx, y, rz) {
  return (rx * RZ + rz) * RY + y;
}

function isTransparent(b) {
  return b === BLOCK.AIR || b === BLOCK.WATER;
}

function computeRegionLight(x0, z0) {
  lightBuf.fill(0);
  // 1) サンライト: 上から空気の間レベル 15
  for (let rx = 0; rx < RX; rx++) {
    for (let rz = 0; rz < RZ; rz++) {
      let y = RY - 1;
      while (y >= 0 && getBlock(x0 - RPAD + rx, y, z0 - RPAD + rz) === BLOCK.AIR) {
        lightBuf[lightIndex(rx, y, rz)] = 15;
        y--;
      }
      colTop[rx * RZ + rz] = y;
    }
  }
  // 2) 横や下に暗い透明ブロックが接しうるサンライト面を seed にして flood fill
  const queue = [];
  for (let rx = 1; rx < RX - 1; rx++) {
    for (let rz = 1; rz < RZ - 1; rz++) {
      const top = colTop[rx * RZ + rz];
      const maxN = Math.max(
        colTop[(rx - 1) * RZ + rz], colTop[(rx + 1) * RZ + rz],
        colTop[rx * RZ + rz - 1], colTop[rx * RZ + rz + 1], top + 1);
      for (let y = top + 1; y <= Math.min(maxN, RY - 1); y++) {
        queue.push(lightIndex(rx, y, rz));
      }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const level = lightBuf[idx];
    if (level <= 1) continue;
    const y = idx % RY;
    const t = (idx - y) / RY;
    const rz = t % RZ;
    const rx = (t - rz) / RZ;
    for (const f of FACES) {
      const nx = rx + f.dir[0], ny = y + f.dir[1], nz = rz + f.dir[2];
      if (nx < 0 || nx >= RX || ny < 0 || ny >= RY || nz < 0 || nz >= RZ) continue;
      const nidx = lightIndex(nx, ny, nz);
      if (lightBuf[nidx] >= level - 1) continue;
      if (!isTransparent(getBlock(x0 - RPAD + nx, ny, z0 - RPAD + nz))) continue;
      lightBuf[nidx] = level - 1;
      queue.push(nidx);
    }
  }
}

// 面が接する透明ブロックの光量 (0..15) → 明度係数
function faceLight(x, y, z, f) {
  const ny = y + f.dir[1];
  if (ny < 0 || ny >= RY) return 1.0;
  const L = lightBuf[lightIndex(x + RPAD + f.dir[0], ny, z + RPAD + f.dir[2])];
  return 0.2 + 0.8 * (L / 15);
}

// p: 面の原点, u/v: 辺ベクトル (cross(u,v) = 外向き法線), shade: 面の向きによる明度
const FACES = [
  { dir: [1, 0, 0], p: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0], shade: 0.8 },
  { dir: [-1, 0, 0], p: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.8 },
  { dir: [0, 1, 0], p: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1], shade: 1.0 },
  { dir: [0, -1, 0], p: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.45 },
  { dir: [0, 0, 1], p: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.65 },
  { dir: [0, 0, -1], p: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.65 },
];

// --- AO ---
function isSolid(wx, wy, wz) {
  const b = getBlock(wx, wy, wz);
  return (b !== BLOCK.AIR && b !== BLOCK.WATER) ? 1 : 0;
}

function vertexAO(side1, side2, corner) {
  return side1 && side2 ? 3 : side1 + side2 + corner;
}

// 面の外側レイヤ (nx,ny,nz) で 4 頂点 [p, p+u, p+u+v, p+v] の遮蔽度 (0..3) を返す
function faceAO(nx, ny, nz, f) {
  const um = isSolid(nx - f.u[0], ny - f.u[1], nz - f.u[2]);
  const up = isSolid(nx + f.u[0], ny + f.u[1], nz + f.u[2]);
  const vm = isSolid(nx - f.v[0], ny - f.v[1], nz - f.v[2]);
  const vp = isSolid(nx + f.v[0], ny + f.v[1], nz + f.v[2]);
  const cmm = isSolid(nx - f.u[0] - f.v[0], ny - f.u[1] - f.v[1], nz - f.u[2] - f.v[2]);
  const cpm = isSolid(nx + f.u[0] - f.v[0], ny + f.u[1] - f.v[1], nz + f.u[2] - f.v[2]);
  const cpp = isSolid(nx + f.u[0] + f.v[0], ny + f.u[1] + f.v[1], nz + f.u[2] + f.v[2]);
  const cmp = isSolid(nx - f.u[0] + f.v[0], ny - f.u[1] + f.v[1], nz - f.u[2] + f.v[2]);
  return [
    vertexAO(um, vm, cmm),
    vertexAO(up, vm, cpm),
    vertexAO(up, vp, cpp),
    vertexAO(um, vp, cmp),
  ];
}

const AO_FACTOR = [1.0, 0.85, 0.7, 0.55];

// --- 水面の高さ ---
// 水位 (0=水源 .. 7=末端, 8=落水) → ブロック内の水面の高さ
function levelToHeight(L) {
  if (L === 8) return 1; // 落水は満杯
  return (8 - L) / 9;
}

// 水ブロック (wx,y,wz) の上面コーナー (dx,dz ∈ {0,1}) の高さ。
// コーナーを共有する最大4セルのうち水であるものの高さを平均する。
// セルの上も水なら満杯 (1.0)。隣り合う水ブロック同士は同じ4セルから
// 計算するので必ず同じ高さになり、面が連続する。
function cornerHeight(wx, y, wz, dx, dz) {
  let sum = 0, count = 0;
  for (const ox of [dx - 1, dx]) {
    for (const oz of [dz - 1, dz]) {
      if (getBlock(wx + ox, y, wz + oz) !== BLOCK.WATER) continue;
      if (getBlock(wx + ox, y + 1, wz + oz) === BLOCK.WATER) return 1;
      sum += levelToHeight(getWaterLevel(wx + ox, y, wz + oz));
      count++;
    }
  }
  return sum / count; // 自セルが水なので count >= 1
}

// light: 面の明度 (shade×ライト)、layer: テクスチャレイヤ
// topH: 水面用。上端 (y+1) の頂点をコーナー高さ [dx*2+dz] に下げる (null なら立方体のまま)
// ao: 4 頂点の遮蔽度 (null なら AO なし)。遮蔽度に応じて対角線を切り替える
// flow: テクスチャスクロール速度 [fu, fv] (uv/秒)。null なら静止 (水は揺らぎ)
function pushFace(verts, x, y, z, f, light, layer, topH, ao, flow) {
  const px = x + f.p[0], py = y + f.p[1], pz = z + f.p[2];
  const a = [px, py, pz];
  const q = [px + f.u[0], py + f.u[1], pz + f.u[2]];
  const c = [q[0] + f.v[0], q[1] + f.v[1], q[2] + f.v[2]];
  const d = [px + f.v[0], py + f.v[1], pz + f.v[2]];
  const corners = [a, q, c, d];
  let order = [0, 1, 2, 0, 2, 3];
  if (ao && ao[0] + ao[2] > ao[1] + ao[3]) order = [1, 2, 3, 1, 3, 0];
  for (const i of order) {
    const v = corners[i];
    let vy = v[1];
    if (topH && vy === y + 1) vy = y + topH[(v[0] - x) * 2 + (v[2] - z)];
    const k = ao ? AO_FACTOR[ao[i]] * light : light;
    // UV はブロックローカル座標から決める (上下面: xz, 側面: 水平方向と高さ)
    let u, tv;
    if (f.dir[1] !== 0) { u = v[0] - x; tv = v[2] - z; }
    else if (f.dir[0] !== 0) { u = v[2] - z; tv = vy - y; }
    else { u = v[0] - x; tv = vy - y; }
    verts.push(v[0], vy, v[2], k, k, k, u, tv, layer,
      flow ? flow[0] : 0, flow ? flow[1] : 0);
  }
}

const FLOW_SPEED = 0.5; // 流水上面のスクロール速度 (uv/秒)
const FALL_SPEED = 1.5; // 落水側面のスクロール速度

// チャンクの不透明/水メッシュを作る。頂点はチャンクローカル座標(描画時に uOffset で移動)
export function buildChunkMesh(cx, cz) {
  const verts = [];
  const waterVerts = [];
  const x0 = cx * CHUNK_X;
  const z0 = cz * CHUNK_Z;
  computeRegionLight(x0, z0);
  for (let x = 0; x < CHUNK_X; x++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      for (let y = 0; y < CHUNK_Y; y++) {
        const b = getBlock(x0 + x, y, z0 + z);
        if (b === BLOCK.AIR) continue;
        if (b === BLOCK.WATER) {
          // 水は空気に接する面だけ描く。最上段の水は上端をコーナー高さに下げる
          let topH = null;
          if (getBlock(x0 + x, y + 1, z0 + z) !== BLOCK.WATER) {
            topH = [
              cornerHeight(x0 + x, y, z0 + z, 0, 0),
              cornerHeight(x0 + x, y, z0 + z, 0, 1),
              cornerHeight(x0 + x, y, z0 + z, 1, 0),
              cornerHeight(x0 + x, y, z0 + z, 1, 1),
            ];
          }
          // 上面の流れ: コーナー高さの勾配の下り方向 (uv+flow*t で模様が下りへ動く)
          let flow = null;
          if (topH) {
            const gx = (topH[2] + topH[3] - topH[0] - topH[1]) / 2;
            const gz = (topH[1] + topH[3] - topH[0] - topH[2]) / 2;
            const m = Math.hypot(gx, gz);
            if (m > 0.01) flow = [gx / m * FLOW_SPEED, gz / m * FLOW_SPEED];
          }
          const falling = getWaterLevel(x0 + x, y, z0 + z) === 8;
          for (const f of FACES) {
            const nb = getBlock(x0 + x + f.dir[0], y + f.dir[1], z0 + z + f.dir[2]);
            if (nb !== BLOCK.AIR) continue;
            const s = f.shade * faceLight(x, y, z, f);
            let fl = null;
            if (f.dir[1] === 1) fl = flow;
            else if (f.dir[1] === 0) {
              // 側面: 落水は速く、流れている水もゆっくり下向きに流す
              if (falling) fl = [0, FALL_SPEED];
              else if (flow) fl = [0, FLOW_SPEED];
            }
            pushFace(waterVerts, x, y, z, f, s, faceTexLayer(b, f), topH, null, fl);
          }
          continue;
        }
        for (const f of FACES) {
          const nb = getBlock(x0 + x + f.dir[0], y + f.dir[1], z0 + z + f.dir[2]);
          if (nb !== BLOCK.AIR && nb !== BLOCK.WATER) continue;
          const s = f.shade * faceLight(x, y, z, f);
          const ao = faceAO(x0 + x + f.dir[0], y + f.dir[1], z0 + z + f.dir[2], f);
          pushFace(verts, x, y, z, f, s, faceTexLayer(b, f), null, ao, null);
        }
      }
    }
  }
  return { opaque: new Float32Array(verts), water: new Float32Array(waterVerts) };
}
