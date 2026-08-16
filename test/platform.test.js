"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { executableName, releaseAsset } = require("../src/platform");

const cases = [
  ["linux", "x64", "treetop-bundle-x86_64-linux-musl.tar.gz"],
  ["linux", "arm64", "treetop-bundle-aarch64-linux-musl.tar.gz"],
  ["darwin", "arm64", "treetop-bundle-aarch64-macos.tar.gz"],
  ["win32", "x64", "treetop-bundle-x86_64-windows.zip"],
];

for (const [platform, arch, expected] of cases) {
  test(`maps ${platform}/${arch} to its release archive`, () => {
    assert.equal(releaseAsset(platform, arch), expected);
  });
}

test("rejects unsupported architectures", () => {
  assert.throws(() => releaseAsset("linux", "riscv64"), /does not publish/u);
  assert.throws(() => releaseAsset("darwin", "x64"), /does not publish/u);
  assert.throws(() => releaseAsset("win32", "arm64"), /does not publish/u);
});

test("uses the Windows executable suffix only on Windows", () => {
  assert.equal(executableName("win32"), "treetop-bundle.exe");
  assert.equal(executableName("linux"), "treetop-bundle");
  assert.equal(executableName("darwin"), "treetop-bundle");
});
