/**
 * The video on the studio's big screen: a WebGL texture on a quad at the
 * screen's front face (a DOM overlay would cover the coach, who stands in
 * front of it). The rider's own file, browser-only: nothing is uploaded.
 */
import { compile, link, uniforms } from "./renderer.js";
import { SCREEN } from "./studioScene.js";

/** How far the quad sits in front of the screen's face (no z-fighting). */
const LIFT = 0.02;

/** The quad the video is drawn on: the screen's front face, lifted. */
export function screenQuad(screen, lift = LIFT) {
  const [cx, cy, cz] = screen.center;
  const [w, h, d] = screen.size;
  const z = cz + d / 2 + lift;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return {
    corners: new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z]),
    uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]),
  };
}

/**
 * The object URL of the rider's video choice: a video file becomes one, a
 * new choice replaces (and revokes) the old, anything else is ignored.
 * @returns the URL now (null: no video)
 */
export function chooseVideo(url, file) {
  if (!file || !file.type.startsWith("video/")) return url;
  if (url) URL.revokeObjectURL(url);
  return URL.createObjectURL(file);
}

/** Revokes the object URL; the screen goes dark again. */
export function clearVideo(url) {
  if (url) URL.revokeObjectURL(url);
  return null;
}

const VIDEO_VERTEX = `#version 300 es
in vec2 a_corner;
in vec2 a_uv;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_viewProjection * u_model * vec4(a_corner, 0.0, 1.0);
}`;

const VIDEO_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_video;
out vec4 outColor;
void main() {
  outColor = vec4(texture(u_video, v_uv).rgb, 1.0);
}`;

/** The screen's video, self-illuminated like the neon (a screen reads in shade). */
export class VideoScreen {
  #video = null;

  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.program = link(gl, compile(gl, gl.VERTEX_SHADER, VIDEO_VERTEX), compile(gl, gl.FRAGMENT_SHADER, VIDEO_FRAGMENT), {
      a_corner: 0,
      a_uv: 1,
    });
    this.uniforms = uniforms(gl, this.program, ["u_viewProjection", "u_model", "u_video"]);
    const { corners, uvs } = screenQuad(SCREEN);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffers = [corners, uvs].map((data, location) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, data === corners ? 3 : 2, gl.FLOAT, false, 0, 0);
      return buffer;
    });
    gl.bindVertexArray(null);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.unit = 3;
  }

  /** Shows `video` (a muted, looping element) on the screen; null goes dark. */
  setVideo(video) {
    this.#video = video;
  }

  /** Uploads the current frame and draws the quad; dark until a frame is ready. */
  draw(viewProjection) {
    const gl = this.gl;
    const video = this.#video;
    if (!video || video.readyState < 2) return;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0 + this.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform1i(this.uniforms.u_video, this.unit);
    gl.uniformMatrix4fv(this.uniforms.u_viewProjection, false, viewProjection);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    this.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    gl.deleteVertexArray(this.vao);
  }
}
