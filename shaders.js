export const VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
uniform mat4 uVP;
uniform vec3 uOffset;
out vec3 vColor;
void main() {
  gl_Position = uVP * vec4(aPos + uOffset, 1.0);
  vColor = aColor;
}
`;

export const FS = `#version 300 es
precision mediump float;
in vec3 vColor;
uniform float uAlpha;
out vec4 outColor;
void main() {
  outColor = vec4(vColor, uAlpha);
}
`;
