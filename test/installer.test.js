"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  checksumForAsset,
  download,
  installBinary,
  parseChecksums,
  sha256,
  validateVersion,
  windowsExtractionScript,
} = require("../src/installer");

test("accepts exact versions and rejects tags or moving channels", () => {
  assert.equal(validateVersion("1.2.3"), "1.2.3");
  assert.equal(validateVersion("1.2.3-rc.1"), "1.2.3-rc.1");
  assert.throws(() => validateVersion("v1.2.3"), /without a leading v/u);
  assert.throws(() => validateVersion("latest"), /exact semantic version/u);
});

test("keeps both Expand-Archive parameters in one PowerShell command", () => {
  assert.equal(
    windowsExtractionScript(),
    "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath " +
      "$env:TREETOP_ACTION_ARCHIVE -DestinationPath $env:TREETOP_ACTION_DESTINATION",
  );
});

test("parses GNU and binary-mode checksum entries", () => {
  const first = "a".repeat(64);
  const second = "B".repeat(64);
  const parsed = parseChecksums(`${first}  first.tar.gz\n${second} *second.zip\n`);
  assert.equal(parsed.get("first.tar.gz"), first);
  assert.equal(parsed.get("second.zip"), second.toLowerCase());
});

test("finds legacy path-prefixed assets without accepting ambiguity", () => {
  const hash = "d".repeat(64);
  const asset = "treetop-bundle-x86_64-linux-musl.tar.gz";
  assert.equal(
    checksumForAsset(new Map([[`release-artifacts/${asset}`, hash]]), asset),
    hash,
  );
  assert.throws(
    () =>
      checksumForAsset(
        new Map([
          [asset, hash],
          [`release-artifacts/${asset}`, hash],
        ]),
        asset,
      ),
    /ambiguous entries/u,
  );
});

test("rejects malformed and duplicate checksum entries", () => {
  assert.throws(() => parseChecksums("not-a-checksum\n"), /invalid SHA256SUMS/u);
  const hash = "c".repeat(64);
  assert.throws(
    () => parseChecksums(`${hash}  same\n${hash}  same\n`),
    /duplicate SHA256SUMS/u,
  );
});

test("hashes files without loading them through the action interface", async () => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), "treetop-hash-test-"));
  const filename = path.join(temporary, "data");
  await fsp.writeFile(filename, "bundle");
  assert.equal(
    await sha256(filename),
    crypto.createHash("sha256").update("bundle").digest("hex"),
  );
});

test("download rejects unsuccessful and oversized responses", async () => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), "treetop-download-test-"));
  await assert.rejects(
    download(
      "https://example.invalid/missing",
      path.join(temporary, "missing"),
      "",
      async () => new Response("missing", { status: 404 }),
    ),
    /HTTP 404/u,
  );
  await assert.rejects(
    download(
      "https://example.invalid/large",
      path.join(temporary, "large"),
      "",
      async () =>
        new Response("small", {
          headers: { "content-length": String(129 * 1024 * 1024) },
        }),
    ),
    /exceeds 128 MiB/u,
  );
});

test("installs a verified archive and reuses the completed tool cache", async () => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), "treetop-install-test-"));
  const archiveContents = Buffer.from("verified release archive");
  const expected = crypto.createHash("sha256").update(archiveContents).digest("hex");
  let downloads = 0;
  const options = {
    arch: "x64",
    environment: {
      RUNNER_TEMP: temporary,
      RUNNER_TOOL_CACHE: path.join(temporary, "cache"),
    },
    platform: "linux",
    version: "1.2.3",
    async downloadImplementation(url, destination) {
      downloads += 1;
      if (url.endsWith("/SHA256SUMS")) {
        await fsp.writeFile(
          destination,
          `${expected}  treetop-bundle-x86_64-linux-musl.tar.gz\n`,
          { flag: "wx" },
        );
      } else {
        await fsp.writeFile(destination, archiveContents, { flag: "wx" });
      }
    },
    async extractImplementation(_archive, destination) {
      await fsp.writeFile(path.join(destination, "treetop-bundle"), "executable");
    },
  };

  const installed = await installBinary(options);
  assert.equal(await fsp.readFile(installed, "utf8"), "executable");
  assert.equal(downloads, 2);
  assert.ok(fs.statSync(installed).mode & 0o100);

  const cached = await installBinary({
    ...options,
    async downloadImplementation() {
      throw new Error("cache miss");
    },
  });
  assert.equal(cached, installed);
  assert.equal(downloads, 2);
});

test("refuses an archive whose checksum does not match", async () => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), "treetop-install-test-"));
  const options = {
    arch: "x64",
    environment: {
      RUNNER_TEMP: temporary,
      RUNNER_TOOL_CACHE: path.join(temporary, "cache"),
    },
    platform: "linux",
    version: "1.2.3",
    async downloadImplementation(url, destination) {
      const contents = url.endsWith("/SHA256SUMS")
        ? `${"0".repeat(64)}  treetop-bundle-x86_64-linux-musl.tar.gz\n`
        : "tampered";
      await fsp.writeFile(destination, contents, { flag: "wx" });
    },
    async extractImplementation() {
      throw new Error("must not extract an unverified archive");
    },
  };
  await assert.rejects(installBinary(options), /checksum mismatch/u);
});
