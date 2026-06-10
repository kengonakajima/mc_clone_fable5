import { CHUNK_X, CHUNK_Y, CHUNK_Z, BLOCK, getBlock } from './world.js';

const BLOCK_COLOR = {
  [BLOCK.GRASS]: [0.35, 0.65, 0.25],
  [BLOCK.DIRT]: [0.45, 0.32, 0.2],
  [BLOCK.STONE]: [0.5, 0.5, 0.5],
  [BLOCK.SAND]: [0.82, 0.76, 0.55],
  [BLOCK.WATER]: [0.15, 0.35, 0.75],
};

// p: 面の原点, u/v: 辺ベクトル (cross(u,v) = 外向き法線), shade: 面の向きによる明度
const FACES = [
  { dir: [1, 0, 0], p: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0], shade: 0.8 },
  { dir: [-1, 0, 0], p: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.8 },
  { dir: [0, 1, 0], p: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1], shade: 1.0 },
  { dir: [0, -1, 0], p: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.45 },
  { dir: [0, 0, 1], p: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.65 },
  { dir: [0, 0, -1], p: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.65 },
];

// dropTop: ブロック上端 (y+1) の頂点を 1/8 下げる (水面用)
function pushFace(verts, x, y, z, f, r, g, b, dropTop) {
  const px = x + f.p[0], py = y + f.p[1], pz = z + f.p[2];
  const a = [px, py, pz];
  const q = [px + f.u[0], py + f.u[1], pz + f.u[2]];
  const c = [q[0] + f.v[0], q[1] + f.v[1], q[2] + f.v[2]];
  const d = [px + f.v[0], py + f.v[1], pz + f.v[2]];
  for (const v of [a, q, c, a, c, d]) {
    let vy = v[1];
    if (dropTop && vy === y + 1) vy -= 0.125;
    verts.push(v[0], vy, v[2], r, g, b);
  }
}

// チャンクの不透明/水メッシュを作る。頂点はチャンクローカル座標(描画時に uOffset で移動)
export function buildChunkMesh(cx, cz) {
  const verts = [];
  const waterVerts = [];
  const x0 = cx * CHUNK_X;
  const z0 = cz * CHUNK_Z;
  for (let x = 0; x < CHUNK_X; x++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      for (let y = 0; y < CHUNK_Y; y++) {
        const b = getBlock(x0 + x, y, z0 + z);
        if (b === BLOCK.AIR) continue;
        const color = BLOCK_COLOR[b];
        if (b === BLOCK.WATER) {
          // 水は空気に接する面だけ描く。最上段の水は上端を 1/8 下げる
          const dropTop = getBlock(x0 + x, y + 1, z0 + z) !== BLOCK.WATER;
          for (const f of FACES) {
            const nb = getBlock(x0 + x + f.dir[0], y + f.dir[1], z0 + z + f.dir[2]);
            if (nb !== BLOCK.AIR) continue;
            pushFace(waterVerts, x, y, z, f,
              color[0] * f.shade, color[1] * f.shade, color[2] * f.shade, dropTop);
          }
          continue;
        }
        for (const f of FACES) {
          const nb = getBlock(x0 + x + f.dir[0], y + f.dir[1], z0 + z + f.dir[2]);
          if (nb !== BLOCK.AIR && nb !== BLOCK.WATER) continue;
          pushFace(verts, x, y, z, f,
            color[0] * f.shade, color[1] * f.shade, color[2] * f.shade, false);
        }
      }
    }
  }
  return { opaque: new Float32Array(verts), water: new Float32Array(waterVerts) };
}
