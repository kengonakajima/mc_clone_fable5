import { createProgram, createMeshVao, deleteMesh } from './gl.js';
import { VS, FS } from './shaders.js';
import { cam, camViewMatrix, mat4Perspective, mat4Multiply } from './camera.js';
import { CHUNK_X, CHUNK_Z, chunks, chunkKey, generateChunk, terrainHeight } from './world.js';
import { buildChunkMesh } from './mesh.js';

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('WebGL2 not supported');

const hud = document.getElementById('hud');

function resize() {
  canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
  canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

const prog = createProgram(gl, VS, FS);
const uVP = gl.getUniformLocation(prog, 'uVP');
const uOffset = gl.getUniformLocation(prog, 'uOffset');
const uAlpha = gl.getUniformLocation(prog, 'uAlpha');

// --- チャンク管理 ---
const VIEW_RADIUS = 4;          // この半径内をメッシュ化して描画
const MESH_BUILDS_PER_FRAME = 4;
const meshes = new Map();       // "cx,cz" -> { cx, cz, vao, vbo, vertexCount }

function updateChunks() {
  const ccx = Math.floor(cam.x / CHUNK_X);
  const ccz = Math.floor(cam.z / CHUNK_Z);

  // データ生成はメッシュ化より 1 チャンク広く行い、境界カリングが隣を参照できるようにする
  for (let dz = -(VIEW_RADIUS + 1); dz <= VIEW_RADIUS + 1; dz++) {
    for (let dx = -(VIEW_RADIUS + 1); dx <= VIEW_RADIUS + 1; dx++) {
      if (!chunks.has(chunkKey(ccx + dx, ccz + dz))) generateChunk(ccx + dx, ccz + dz);
    }
  }

  // 足りないメッシュを近い順に上限つきで生成
  const missing = [];
  for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      if (!meshes.has(chunkKey(ccx + dx, ccz + dz))) {
        missing.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
      }
    }
  }
  missing.sort((a, b) => a[2] - b[2]);
  for (const [cx, cz] of missing.slice(0, MESH_BUILDS_PER_FRAME)) {
    const built = buildChunkMesh(cx, cz);
    meshes.set(chunkKey(cx, cz), {
      cx, cz,
      opaque: createMeshVao(gl, built.opaque),
      water: createMeshVao(gl, built.water),
    });
  }

  // 遠くなったチャンクを破棄
  for (const [key, mesh] of meshes) {
    if (Math.max(Math.abs(mesh.cx - ccx), Math.abs(mesh.cz - ccz)) > VIEW_RADIUS + 1) {
      deleteMesh(gl, mesh.opaque);
      deleteMesh(gl, mesh.water);
      meshes.delete(key);
    }
  }
  for (const key of chunks.keys()) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > VIEW_RADIUS + 2) {
      chunks.delete(key);
    }
  }
}

// スポーン位置: 原点付近の地形の上
cam.x = CHUNK_X / 2;
cam.z = CHUNK_Z / 2;
cam.y = terrainHeight(CHUNK_X / 2, CHUNK_Z / 2) + 20;
cam.yaw = 0;
cam.pitch = -0.35;

// --- 入力 ---
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => canvas.requestPointerLock());
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  cam.yaw += e.movementX * 0.002;
  cam.pitch -= e.movementY * 0.002;
  const lim = Math.PI / 2 - 0.01;
  cam.pitch = Math.max(-lim, Math.min(lim, cam.pitch));
});

const FLY_SPEED = 10;

function moveCamera(dt) {
  if (document.pointerLockElement !== canvas) return; // ロック中のみ操作を受け付ける
  let mx = 0, mz = 0; // mz: 前後, mx: 左右
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyA']) mx -= 1;
  if (keys['KeyD']) mx += 1;
  const sy = Math.sin(cam.yaw);
  const cy = Math.cos(cam.yaw);
  cam.x += (mz * sy + mx * cy) * FLY_SPEED * dt;
  cam.z += (mz * -cy + mx * sy) * FLY_SPEED * dt;
  if (keys['Space']) cam.y += FLY_SPEED * dt;
  if (keys['ShiftLeft']) cam.y -= FLY_SPEED * dt;
}

window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// デバッグ用
window.cam = cam;
window.keys = keys;

// --- メインループ ---
let frames = 0;
let lastFpsTime = performance.now();
let fps = 0;
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  frames++;
  if (now - lastFpsTime >= 1000) {
    fps = frames;
    frames = 0;
    lastFpsTime = now;
  }

  moveCamera(dt);
  updateChunks();

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0.55, 0.75, 0.95, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const proj = mat4Perspective(70 * Math.PI / 180, canvas.width / canvas.height, 0.1, 1000);
  const vp = mat4Multiply(proj, camViewMatrix());

  gl.useProgram(prog);
  gl.uniformMatrix4fv(uVP, false, vp);
  // パス1: 不透明
  gl.uniform1f(uAlpha, 1.0);
  for (const mesh of meshes.values()) {
    if (mesh.opaque.vertexCount === 0) continue;
    gl.uniform3f(uOffset, mesh.cx * CHUNK_X, 0, mesh.cz * CHUNK_Z);
    gl.bindVertexArray(mesh.opaque.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.opaque.vertexCount);
  }

  // パス2: 水 (半透明、depth write off)
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.uniform1f(uAlpha, 0.6);
  for (const mesh of meshes.values()) {
    if (mesh.water.vertexCount === 0) continue;
    gl.uniform3f(uOffset, mesh.cx * CHUNK_X, 0, mesh.cz * CHUNK_Z);
    gl.bindVertexArray(mesh.water.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.water.vertexCount);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  hud.textContent = `fps: ${fps}\npos: ${cam.x.toFixed(1)}, ${cam.y.toFixed(1)}, ${cam.z.toFixed(1)}\nchunks: ${meshes.size}`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
