"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assertCliResult, main, runAction } = require("../src/action");

class FakeWorkflow {
  constructor(inputs = {}) {
    this.inputs = inputs;
    this.annotations = [];
    this.outputs = new Map();
    this.summaries = [];
    this.failures = [];
    this.paths = [];
  }

  input(name, defaultValue = "") {
    return this.inputs[name] ?? defaultValue;
  }

  booleanInput(name, defaultValue = false) {
    const value = this.input(name, String(defaultValue));
    if (value !== "true" && value !== "false") {
      throw new Error(`${name} must be true or false`);
    }
    return value === "true";
  }

  annotation(level, message, properties) {
    this.annotations.push({ level, message, properties });
  }

  setOutput(name, value) {
    this.outputs.set(name, value);
  }

  addPath(value) {
    this.paths.push(value);
  }

  summary(value) {
    this.summaries.push(value);
  }

  info() {}

  fail(message, annotate = true) {
    this.failures.push({ annotate, message });
  }
}

const environment = { GITHUB_WORKSPACE: path.resolve(__dirname, "fixtures/valid") };
const executable = path.join(os.tmpdir(), "treetop-bundle-test-binary");

test("publishes valid check outputs and a successful summary", async () => {
  const workflow = new FakeWorkflow();
  const result = await runAction({
    environment,
    workflow,
    async resolveExecutable() {
      return { executable, version: "1.2.3" };
    },
    async runCli() {
      return { code: 0, stderr: "", stdout: '{"valid":true,"diagnostics":[]}\n' };
    },
  });
  assert.equal(result.valid, true);
  assert.equal(workflow.outputs.get("valid"), "true");
  assert.equal(workflow.outputs.get("diagnostics-json"), "[]");
  assert.equal(workflow.outputs.get("binary-version"), "1.2.3");
  assert.match(workflow.summaries[0], /bundle valid/u);
  assert.deepEqual(workflow.failures, []);
});

test("annotates diagnostics and fails invalid content without losing outputs", async () => {
  const workflow = new FakeWorkflow();
  const result = await runAction({
    environment,
    workflow,
    async resolveExecutable() {
      return { executable, version: "custom" };
    },
    async runCli() {
      return {
        code: 1,
        stderr: "validation failed\n",
        stdout: JSON.stringify({
          diagnostics: [
            {
              code: "policy.syntax",
              message: "unexpected token",
              module: "dns",
              path: "policy.cedar",
              severity: "error",
            },
          ],
          valid: false,
        }),
      };
    },
  });
  assert.equal(result.valid, false);
  assert.equal(workflow.outputs.get("valid"), "false");
  assert.equal(workflow.annotations[0].level, "error");
  assert.equal(workflow.annotations[0].properties.file, "policy.cedar");
  assert.equal(workflow.failures.length, 1);
  assert.equal(workflow.failures[0].annotate, false);
});

test("reports bundle build outputs", async () => {
  const workflow = new FakeWorkflow({ "build-output": "dist/bundle.tar.gz" });
  await runAction({
    environment,
    workflow,
    async resolveExecutable() {
      return { executable, version: "custom" };
    },
    async runCli() {
      return {
        code: 0,
        stderr: "",
        stdout:
          '{"archive_sha256":"abc123","built":true,"output":"dist/bundle.tar.gz"}\n',
      };
    },
  });
  assert.equal(
    workflow.outputs.get("archive-path"),
    path.join(environment.GITHUB_WORKSPACE, "dist/bundle.tar.gz"),
  );
  assert.equal(workflow.outputs.get("archive-sha256"), "abc123");
});

test("turns operational CLI errors into one action failure", async () => {
  const workflow = new FakeWorkflow();
  const result = await main({
    environment,
    workflow,
    async resolveExecutable() {
      return { executable, version: "custom" };
    },
    async runCli() {
      return { code: 2, stderr: "filesystem error: missing", stdout: "" };
    },
  });
  assert.equal(result, undefined);
  assert.deepEqual(workflow.failures, [
    { annotate: true, message: "treetop-bundle could not run: filesystem error: missing" },
  ]);
});

test("turns malformed CLI output into an action failure", async () => {
  const workflow = new FakeWorkflow();
  await main({
    environment,
    workflow,
    async resolveExecutable() {
      return { executable, version: "custom" };
    },
    async runCli() {
      return { code: 0, stderr: "", stdout: "not JSON" };
    },
  });
  assert.match(workflow.failures[0].message, /did not emit structured JSON/u);
});

test("rejects incomplete structured CLI results", () => {
  assert.throws(() => assertCliResult({}, false, 0), /boolean valid field/u);
  assert.throws(() => assertCliResult({}, true, 0), /confirm.*archive was built/u);
  assert.throws(() => assertCliResult({ valid: true }, false, 1), /valid=false/u);
});
