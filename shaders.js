export const VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in vec3 aUv; // u, v, テクスチャレイヤ
layout(location = 3) in vec2 aFlow; // テクスチャスクロール速度 (uv/秒)
uniform mat4 uVP;
uniform vec3 uOffset;
out vec3 vColor;
out vec3 vUv;
out vec3 vWorld;
out vec2 vFlow;
void main() {
  vWorld = aPos + uOffset;
  gl_Position = uVP * vec4(vWorld, 1.0);
  vColor = aColor;
  vUv = aUv;
  vFlow = aFlow;
}
`;

export const FS = `#version 300 es
precision mediump float;
in vec3 vColor;
in vec3 vUv;
in vec3 vWorld;
in vec2 vFlow;
uniform float uAlpha;
uniform vec3 uTint;
uniform float uTime;
uniform float uWave; // UV 揺らぎの振幅 (水パスのみ > 0)
uniform mediump sampler2DArray uTex;
out vec4 outColor;
void main() {
  vec2 uv = vUv.xy;
  if (dot(vFlow, vFlow) > 0.0001) {
    uv += vFlow * uTime; // 流水: 流れ方向へスクロール
  } else {
    uv += uWave * vec2(
      sin(uTime * 2.0 + vWorld.x * 2.0 + vWorld.z * 1.3),
      sin(uTime * 1.7 + vWorld.z * 2.2 + vWorld.x * 1.1));
  }
  vec4 t = texture(uTex, vec3(uv, vUv.z));
  outColor = vec4(t.rgb * vColor * uTint, uAlpha);
}
`;
