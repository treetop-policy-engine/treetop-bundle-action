"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { executableName, releaseAsset } = require("./platform");

const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const RELEASE_ROOT = "https://github.com/treetop-policy-engine/treetop-bundle/releases/download";
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

function validateVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `binary-version must be an exact semantic version without a leading v; received ${version}`,
    );
  }
  return version;
}

function parseChecksums(contents) {
  const checksums = new Map();
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/u.exec(line);
    if (!match) {
      throw new Error(`invalid SHA256SUMS line: ${rawLine}`);
    }
    const filename = match[2];
    if (filename.includes("/") || filename.includes("\\")) {
      throw new Error(`SHA256SUMS requires flat asset names: ${filename}`);
    }
    if (checksums.has(filename)) {
      throw new Error(`duplicate SHA256SUMS entry for ${filename}`);
    }
    checksums.set(filename, match[1].toLowerCase());
  }
  return checksums;
}

function checksumForAsset(checksums, asset) {
  const checksum = checksums.get(asset);
  if (!checksum) {
    throw new Error(`SHA256SUMS does not contain ${asset}`);
  }
  return checksum;
}

async function sha256(filename) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function download(url, destination, token, fetchImplementation = globalThis.fetch) {
  const headers = {
    Accept: "application/octet-stream",
    "User-Agent": "treetop-bundle-action",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetchImplementation(url, {
    headers,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`failed to download ${url}: HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`download from ${url} exceeds 128 MiB`);
  }
  const contents = Buffer.from(await response.arrayBuffer());
  if (contents.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(`download from ${url} exceeds 128 MiB`);
  }
  await fsp.writeFile(destination, contents, { flag: "wx" });
}

function extractArchive(archive, destination, platform) {
  let result;
  if (platform === "win32") {
    const environment = {
      ...process.env,
      TREETOP_ACTION_ARCHIVE: archive,
      TREETOP_ACTION_DESTINATION: destination,
    };
    const script = windowsExtractionScript();
    result = spawnSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", env: environment, windowsHide: true },
    );
  } else {
    result = spawnSync("tar", ["-xzf", archive, "-C", destination], {
      encoding: "utf8",
      windowsHide: true,
    });
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`failed to extract ${path.basename(archive)}: ${result.stderr.trim()}`);
  }
}

function windowsExtractionScript() {
  return (
    "$ErrorActionPreference = 'Stop'; " +
    "Expand-Archive -LiteralPath $env:TREETOP_ACTION_ARCHIVE " +
    "-DestinationPath $env:TREETOP_ACTION_DESTINATION"
  );
}

async function installBinary(options) {
  const version = validateVersion(options.version);
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const asset = releaseAsset(platform, arch);
  const binaryName = executableName(platform);
  const environment = options.environment || process.env;
  const cacheRoot =
    environment.RUNNER_TOOL_CACHE ||
    path.join(environment.RUNNER_TEMP || os.tmpdir(), "treetop-tool-cache");
  const destination = path.join(cacheRoot, "treetop-bundle", version, `${platform}-${arch}`);
  const cachedBinary = path.join(destination, binaryName);
  const marker = path.join(destination, ".complete");

  if (fs.existsSync(cachedBinary) && fs.existsSync(marker)) {
    return cachedBinary;
  }

  const temporaryRoot = await fsp.mkdtemp(
    path.join(environment.RUNNER_TEMP || os.tmpdir(), "treetop-bundle-action-"),
  );
  try {
    const checksumFile = path.join(temporaryRoot, "SHA256SUMS");
    const archive = path.join(temporaryRoot, asset);
    const extracted = path.join(temporaryRoot, "extracted");
    const releaseUrl = `${RELEASE_ROOT}/v${version}`;
    const fetchImplementation = options.fetchImplementation || globalThis.fetch;
    const downloadImplementation = options.downloadImplementation || download;

    await downloadImplementation(
      `${releaseUrl}/SHA256SUMS`,
      checksumFile,
      options.token,
      fetchImplementation,
    );
    const checksums = parseChecksums(await fsp.readFile(checksumFile, "utf8"));
    const expected = checksumForAsset(checksums, asset);
    await downloadImplementation(
      `${releaseUrl}/${asset}`,
      archive,
      options.token,
      fetchImplementation,
    );
    const actual = await sha256(archive);
    if (!crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) {
      throw new Error(`checksum mismatch for ${asset}: expected ${expected}, received ${actual}`);
    }

    await fsp.mkdir(extracted);
    await (options.extractImplementation || extractArchive)(archive, extracted, platform);
    const extractedBinary = path.join(extracted, binaryName);
    await fsp.access(extractedBinary, fs.constants.R_OK);

    await fsp.mkdir(destination, { recursive: true });
    await fsp.copyFile(extractedBinary, cachedBinary);
    if (platform !== "win32") {
      await fsp.chmod(cachedBinary, 0o755);
    }
    await fsp.writeFile(marker, `${actual}\n`, "utf8");
    return cachedBinary;
  } finally {
    await fsp.rm(temporaryRoot, { recursive: true, force: true });
  }
}

module.exports = {
  MAX_DOWNLOAD_BYTES,
  RELEASE_ROOT,
  VERSION_PATTERN,
  download,
  checksumForAsset,
  extractArchive,
  installBinary,
  parseChecksums,
  sha256,
  validateVersion,
  windowsExtractionScript,
};
