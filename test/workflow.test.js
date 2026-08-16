"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Writable } = require("node:stream");
const {
  Workflow,
  escapeData,
  escapeProperty,
  inputEnvironmentName,
} = require("../src/workflow");

function captureStream() {
  let contents = "";
  return {
    read: () => contents,
    stream: new Writable({
      write(chunk, _encoding, callback) {
        contents += chunk.toString();
        callback();
      },
    }),
  };
}

test("escapes workflow command data and properties", () => {
  assert.equal(escapeData("50%\r\nnext"), "50%25%0D%0Anext");
  assert.equal(escapeProperty("a:b,c"), "a%3Ab%2Cc");
});

test("maps action input names without making them shell identifiers", () => {
  assert.equal(inputEnvironmentName("deny-warnings"), "INPUT_DENY-WARNINGS");
});

test("reads trimmed string and strict boolean inputs", () => {
  const workflow = new Workflow({
    INPUT_MANIFEST: "  bundle.toml  ",
    "INPUT_DENY-WARNINGS": "TRUE",
  });
  assert.equal(workflow.input("manifest"), "bundle.toml");
  assert.equal(workflow.booleanInput("deny-warnings"), true);
  assert.throws(
    () => new Workflow({ "INPUT_FLAG": "yes" }).booleanInput("flag"),
    /must be true or false/u,
  );
});

test("writes multiline-safe outputs, paths, summaries, and annotations", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "treetop-workflow-test-"));
  const outputs = path.join(temporary, "outputs");
  const paths = path.join(temporary, "paths");
  const summary = path.join(temporary, "summary");
  fs.writeFileSync(outputs, "");
  fs.writeFileSync(paths, "");
  fs.writeFileSync(summary, "");
  const capture = captureStream();
  const workflow = new Workflow(
    { GITHUB_OUTPUT: outputs, GITHUB_PATH: paths, GITHUB_STEP_SUMMARY: summary },
    capture.stream,
  );

  workflow.setOutput("diagnostics", "first\nsecond");
  workflow.addPath("/tool/bin");
  workflow.summary("## Result\n");
  workflow.annotation("error", "bad\ninput", { file: "a,b.cedar", line: 2 });

  assert.match(fs.readFileSync(outputs, "utf8"), /diagnostics<<treetop_/u);
  assert.match(fs.readFileSync(outputs, "utf8"), /first\nsecond/u);
  assert.equal(fs.readFileSync(paths, "utf8"), "/tool/bin\n");
  assert.equal(fs.readFileSync(summary, "utf8"), "## Result\n");
  assert.equal(
    capture.read(),
    "::error file=a%2Cb.cedar,line=2::bad%0Ainput\n",
  );
});
