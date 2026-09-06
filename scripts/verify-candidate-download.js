"use strict";

// Exercise the production installer and action with an unpublished, native
// candidate archive. Only the release URL is mapped to the local HTTP fixture.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runAction, DEFAULT_BINARY_VERSION } = require("../src/action");
const { executableName, releaseAsset } = require("../src/platform");
const { RELEASE_ROOT } = require("../src/installer");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
  return result.stdout;
}

async function main() {
  const root = process.cwd();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "treetop-candidate-download-"));
  const binaryName = executableName();
  const source = path.resolve(process.env.CANDIDATE_BINARY || path.join("treetop-bundle", "target", "release", binaryName));
  const staging = path.join(temporary, "staging");
  const asset = releaseAsset();
  const archive = path.join(temporary, asset);
  let server;
  try {
    assert.match(run(source, ["--version"]), /0\.1\.0/u);
    await fs.mkdir(staging);
    await fs.copyFile(source, path.join(staging, binaryName));
    if (process.platform === "win32") {
      run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
        "$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath $env:CANDIDATE_BINARY -DestinationPath $env:CANDIDATE_ARCHIVE"],
      { env: { ...process.env, CANDIDATE_BINARY: path.join(staging, binaryName), CANDIDATE_ARCHIVE: archive } });
    } else {
      run("tar", ["-czf", archive, "-C", staging, binaryName]);
    }
    const bytes = await fs.readFile(archive);
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const payloads = new Map([
      ["/SHA256SUMS", Buffer.from(`${hash}  ${asset}\n`)],
      [`/${asset}`, bytes],
    ]);
    let downloads = 0;
    server = http.createServer((request, response) => {
      const body = payloads.get(request.url);
      if (!body) return response.writeHead(404).end();
      downloads++;
      response.writeHead(200, { "Content-Length": body.length, "Content-Type": "application/octet-stream" }).end(body);
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const release = `${RELEASE_ROOT}/v${DEFAULT_BINARY_VERSION}`;
    const fetchImplementation = (url, options) => {
      assert.ok(url === `${release}/SHA256SUMS` || url === `${release}/${asset}`);
      return fetch(`${base}${url.slice(release.length)}`, options);
    };
    const environment = {
      ...process.env,
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: temporary,
      RUNNER_TOOL_CACHE: path.join(temporary, "tools"),
      "INPUT_WORKING-DIRECTORY": "test/fixtures/valid",
      "INPUT_DENY-WARNINGS": "true",
    };
    const result = await runAction({ environment, fetchImplementation });
    assert.equal(result.valid, true);
    assert.equal(downloads, 2);
    // Repeated execution must use the verified cache without more downloads.
    assert.equal((await runAction({ environment, fetchImplementation })).valid, true);
    assert.equal(downloads, 2);
    console.log(`Verified candidate download, checksum, extraction, execution, and cache on ${process.platform}/${process.arch}.`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
