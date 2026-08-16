"use strict";

const ASSETS = new Map([
  ["linux-x64", "treetop-bundle-x86_64-linux-musl.tar.gz"],
  ["linux-arm64", "treetop-bundle-aarch64-linux-musl.tar.gz"],
  ["darwin-arm64", "treetop-bundle-aarch64-macos.tar.gz"],
  ["win32-x64", "treetop-bundle-x86_64-windows.zip"],
]);

function releaseAsset(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const asset = ASSETS.get(key);
  if (!asset) {
    throw new Error(
      `treetop-bundle does not publish a CLI for ${platform}/${arch}; ` +
        `supported runners are Linux on x64 or arm64, macOS on arm64, ` +
        `and Windows on x64`,
    );
  }
  return asset;
}

function executableName(platform = process.platform) {
  return platform === "win32" ? "treetop-bundle.exe" : "treetop-bundle";
}

module.exports = { ASSETS, executableName, releaseAsset };
