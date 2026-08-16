"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  annotationProperties,
  emitDiagnostics,
  validationSummary,
} = require("../src/diagnostics");

test("maps diagnostic paths to repository-relative annotation paths", () => {
  const workspace = path.resolve("/workspace");
  const workingDirectory = path.join(workspace, "policy");
  assert.deepEqual(
    annotationProperties(
      { code: "policy.syntax", column: 4, line: 3, path: "permissions/read.cedar" },
      workspace,
      workingDirectory,
    ),
    {
      col: 4,
      file: "policy/permissions/read.cedar",
      line: 3,
      title: "policy.syntax",
    },
  );
});

test("emits error and warning diagnostics with module context", () => {
  const annotations = [];
  const workflow = {
    annotation(level, message, properties) {
      annotations.push({ level, message, properties });
    },
  };
  emitDiagnostics(
    workflow,
    [
      { code: "policy.syntax", message: "bad", module: "dns", severity: "error" },
      { code: "schema.missing", message: "none", severity: "warning" },
    ],
    "/workspace",
    "/workspace",
  );
  assert.equal(annotations[0].level, "error");
  assert.equal(annotations[0].message, "dns: bad");
  assert.equal(annotations[1].level, "warning");
});

test("renders escaped diagnostics in the job summary", () => {
  const markdown = validationSummary(
    false,
    [
      {
        code: "policy.syntax",
        message: "unexpected | token\ncontinued",
        path: "a.cedar",
        severity: "error",
      },
    ],
    "policy",
    "a.cedar",
  );
  assert.match(markdown, /Treetop bundle invalid/u);
  assert.match(markdown, /unexpected \\| token continued/u);
});
