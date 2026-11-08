import { test } from "node:test";
import assert from "node:assert/strict";
import { SCREEN } from "../public/js/view3d/studioScene.js";
import { screenQuad, chooseVideo, clearVideo } from "../public/js/view3d/videoScreen.js";

test("the video quad covers the screen's front face, a lift toward the room", () => {
  const { corners, uvs } = screenQuad(SCREEN);
  const [w, h] = SCREEN.size;
  const [cx, cy] = SCREEN.center;
  const quad = [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
  for (const [i, [x, y]] of quad.entries()) {
    assert.ok(Math.abs(corners[i * 3] - x) < 1e-6);
    assert.ok(Math.abs(corners[i * 3 + 1] - y) < 1e-6);
    assert.ok(corners[i * 3 + 2] > SCREEN.center[2] + SCREEN.size[2] / 2, "in front of the screen face");
    assert.ok(corners[i * 3 + 2] < SCREEN.center[2] + SCREEN.size[2] / 2 + 0.05);
  }
  assert.deepEqual([...uvs], [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], "video origin top-left, v up");
});

test("the screen quad's triangles face the room (+z)", () => {
  const { corners } = screenQuad(SCREEN);
  const a = corners.slice(0, 3);
  const b = corners.slice(3, 6);
  const c = corners.slice(6, 9);
  const ab = b.map((v, i) => v - a[i]);
  const ac = c.map((v, i) => v - a[i]);
  const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  assert.ok(normal[2] > 0, "counter-clockwise seen from the room");
});

function fakeFile(type) {
  return { type };
}

function withUrls(run) {
  const made = [];
  const taken = [];
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (file) => {
    made.push(file);
    return `blob:.${made.length}`;
  };
  URL.revokeObjectURL = (url) => taken.push(url);
  try {
    run({ made, taken });
  } finally {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  }
}

test("a video file becomes the object URL; another replaces it", () => {
  withUrls(({ made, taken }) => {
    const first = fakeFile("video/mp4");
    let url = chooseVideo(null, first);
    assert.equal(url, "blob:.1");
    assert.deepEqual(made, [first]);
    assert.deepEqual(taken, []);
    const second = fakeFile("video/webm");
    url = chooseVideo(url, second);
    assert.equal(url, "blob:.2");
    assert.deepEqual(taken, ["blob:.1"], "the replaced URL is revoked");
    assert.deepEqual(clearVideo(url), null);
    assert.deepEqual(taken, ["blob:.1", "blob:.2"]);
  });
});

test("a non-video file is ignored", () => {
  withUrls(({ made, taken }) => {
    assert.equal(chooseVideo(null, fakeFile("image/png")), null);
    assert.equal(chooseVideo(null, fakeFile("")), null);
    assert.deepEqual(made, []);
    assert.deepEqual(taken, []);
  });
});
