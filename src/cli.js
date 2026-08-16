"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const TARGETS = new Set(["auto", "bundle", "module", "policy"]);

function inferTarget(requestedTarget, manifest) {
  const target = requestedTarget.toLowerCase();
  if (!TARGETS.has(target)) {
    throw new Error(`target must be one of: ${[...TARGETS].join(", ")}`);
  }
  if (target !== "auto") {
    return target;
  }

  const basename = path.basename(manifest).toLowerCase();
  if (basename === "treetop-bundle.toml") {
    return "bundle";
  }
  if (basename === "treetop-module.toml") {
    return "module";
  }
  if (basename.endsWith(".cedar")) {
    return "policy";
  }
  throw new Error(
    `cannot infer the target from ${manifest}; set target to bundle, module, or policy`,
  );
}

function createInvocation(options) {
  const target = inferTarget(options.target || "auto", options.manifest);
  const schema = options.schema || "";
  const labels = options.labels || "";
  const buildOutput = options.buildOutput || "";

  if ((schema || labels) && target !== "policy") {
    throw new Error("schema and labels inputs are only valid for a policy target");
  }
  if (buildOutput && target !== "bundle") {
    throw new Error("build-output requires a bundle target");
  }

  let args;
  if (buildOutput) {
    args = [
      "build",
      "--manifest",
      options.manifest,
      "--output",
      buildOutput,
      "--format",
      "json",
    ];
  } else {
    args = ["check", target, options.manifest];
    if (schema) {
      args.push("--schema", schema);
    }
    if (labels) {
      args.push("--labels", labels);
    }
    args.push("--format", "json");
  }
  if (options.denyWarnings) {
    args.push("--deny-warnings");
  }
  return { args, target };
}

function parseCliOutput(stdout) {
  const lines = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .reverse();
  for (const line of lines) {
    try {
      const result = JSON.parse(line);
      if (result && typeof result === "object" && !Array.isArray(result)) {
        return result;
      }
    } catch {
      // Keep looking for the CLI's final structured output line.
    }
  }
  throw new Error("treetop-bundle did not emit structured JSON output");
}

function runCli(executable, args, workingDirectory, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workingDirectory,
      env: environment,
      shell: false,
      windowsHide: true,
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let oversized = false;

    function capture(current, chunk) {
      const combined = Buffer.concat([current, chunk]);
      if (combined.length > MAX_CAPTURE_BYTES) {
        oversized = true;
        child.kill();
      }
      return combined;
    }

    child.stdout.on("data", (chunk) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = capture(stderr, chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (oversized) {
        reject(new Error("treetop-bundle output exceeded the 16 MiB action limit"));
        return;
      }
      if (signal) {
        reject(new Error(`treetop-bundle was terminated by ${signal}`));
        return;
      }
      resolve({
        code: code === null ? 2 : code,
        stderr: stderr.toString("utf8"),
        stdout: stdout.toString("utf8"),
      });
    });
  });
}

module.exports = { createInvocation, inferTarget, parseCliOutput, runCli };
