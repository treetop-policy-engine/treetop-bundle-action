"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createInvocation, inferTarget, parseCliOutput } = require("../src/cli");

test("infers standard bundle, module, and policy targets", () => {
  assert.equal(inferTarget("auto", "policy/treetop-bundle.toml"), "bundle");
  assert.equal(inferTarget("AUTO", "module/treetop-module.toml"), "module");
  assert.equal(inferTarget("auto", "permissions/read.cedar"), "policy");
});

test("requires an explicit target for unknown filenames", () => {
  assert.throws(() => inferTarget("auto", "policy.toml"), /cannot infer/u);
  assert.throws(() => inferTarget("archive", "bundle"), /target must be one/u);
});

test("creates a bundle-check invocation without a shell", () => {
  assert.deepEqual(
    createInvocation({
      denyWarnings: true,
      manifest: "policy repo/treetop-bundle.toml",
      target: "auto",
    }),
    {
      args: [
        "check",
        "bundle",
        "policy repo/treetop-bundle.toml",
        "--format",
        "json",
        "--deny-warnings",
      ],
      target: "bundle",
    },
  );
});

test("creates a standalone policy invocation with schema and labels", () => {
  assert.deepEqual(
    createInvocation({
      labels: "labels.json",
      manifest: "policy.cedar",
      schema: "schema.cedarschema",
      target: "policy",
    }).args,
    [
      "check",
      "policy",
      "policy.cedar",
      "--schema",
      "schema.cedarschema",
      "--labels",
      "labels.json",
      "--format",
      "json",
    ],
  );
});

test("creates an unsigned bundle build invocation", () => {
  assert.deepEqual(
    createInvocation({
      buildOutput: "/tmp/output.tar.gz",
      manifest: "treetop-bundle.toml",
      target: "auto",
    }).args,
    [
      "build",
      "--manifest",
      "treetop-bundle.toml",
      "--output",
      "/tmp/output.tar.gz",
      "--format",
      "json",
    ],
  );
});

test("rejects inputs that do not apply to a target", () => {
  assert.throws(
    () =>
      createInvocation({
        manifest: "treetop-module.toml",
        schema: "schema.cedarschema",
        target: "module",
      }),
    /only valid for a policy/u,
  );
  assert.throws(
    () =>
      createInvocation({
        buildOutput: "bundle.tar.gz",
        manifest: "policy.cedar",
        target: "policy",
      }),
    /requires a bundle target/u,
  );
});

test("parses the last structured output line", () => {
  assert.deepEqual(parseCliOutput("progress\n{\"valid\":true,\"diagnostics\":[]}\n"), {
    diagnostics: [],
    valid: true,
  });
  assert.throws(() => parseCliOutput("not json\n"), /did not emit/u);
});
