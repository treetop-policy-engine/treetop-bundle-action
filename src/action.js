"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { createInvocation, parseCliOutput, runCli } = require("./cli");
const { emitDiagnostics, validationSummary } = require("./diagnostics");
const { installBinary } = require("./installer");
const { Workflow } = require("./workflow");

const DEFAULT_BINARY_VERSION = "0.0.4";

async function resolveExecutable(binaryInput, workspace, installerOptions) {
  if (binaryInput) {
    const executable = path.isAbsolute(binaryInput)
      ? binaryInput
      : path.resolve(workspace, binaryInput);
    await fsp.access(executable, fs.constants.R_OK);
    return { executable, version: "custom" };
  }
  const executable = await installBinary(installerOptions);
  return { executable, version: installerOptions.version };
}

function assertDiagnostics(result) {
  const diagnostics = result.diagnostics ?? [];
  if (!Array.isArray(diagnostics)) {
    throw new Error("treetop-bundle JSON contained a non-array diagnostics field");
  }
  return diagnostics;
}

function assertCliResult(result, buildRequested, exitCode) {
  if (exitCode === 1 && result.valid !== false) {
    throw new Error("treetop-bundle exited with validation status but did not report valid=false");
  }
  if (exitCode === 0 && buildRequested && result.built !== true) {
    throw new Error("treetop-bundle did not confirm that the requested archive was built");
  }
  if (exitCode === 0 && !buildRequested && typeof result.valid !== "boolean") {
    throw new Error("treetop-bundle check output did not contain a boolean valid field");
  }
}

async function runAction(dependencies = {}) {
  const environment = dependencies.environment || process.env;
  const workflow = dependencies.workflow || new Workflow(environment);
  const workspace = path.resolve(environment.GITHUB_WORKSPACE || process.cwd());
  const workingInput = workflow.input("working-directory", ".") || ".";
  const workingDirectory = path.resolve(workspace, workingInput);
  const manifest = workflow.input("manifest", "treetop-bundle.toml") || "treetop-bundle.toml";
  const buildInput = workflow.input("build-output");
  const buildOutput = buildInput ? path.resolve(workingDirectory, buildInput) : "";
  const invocation = createInvocation({
    buildOutput,
    denyWarnings: workflow.booleanInput("deny-warnings", false),
    labels: workflow.input("labels"),
    manifest,
    schema: workflow.input("schema"),
    target: workflow.input("target", "auto") || "auto",
  });

  await fsp.access(workingDirectory, fs.constants.R_OK);
  if (buildOutput) {
    await fsp.mkdir(path.dirname(buildOutput), { recursive: true });
  }

  const version =
    workflow.input("binary-version", DEFAULT_BINARY_VERSION) || DEFAULT_BINARY_VERSION;
  const installerOptions = {
    arch: dependencies.arch || process.arch,
    environment,
    fetchImplementation: dependencies.fetchImplementation,
    platform: dependencies.platform || process.platform,
    token: workflow.input("github-token"),
    version,
  };
  const resolved = dependencies.resolveExecutable
    ? await dependencies.resolveExecutable(installerOptions)
    : await resolveExecutable(workflow.input("binary-path"), workspace, installerOptions);
  const executable = path.resolve(resolved.executable);
  workflow.setOutput("binary-path", executable);
  workflow.setOutput("binary-version", resolved.version);
  workflow.addPath(path.dirname(executable));
  workflow.info(`Running ${executable} ${invocation.args.join(" ")}`);

  const execution = dependencies.runCli
    ? await dependencies.runCli(executable, invocation.args, workingDirectory, environment)
    : await runCli(executable, invocation.args, workingDirectory, environment);
  if (execution.code !== 0 && execution.code !== 1) {
    const details = execution.stderr.trim() || `exit status ${execution.code}`;
    throw new Error(`treetop-bundle could not run: ${details}`);
  }

  const result = parseCliOutput(execution.stdout);
  assertCliResult(result, Boolean(buildOutput), execution.code);
  const diagnostics = assertDiagnostics(result);
  const valid = execution.code === 0 && result.valid !== false;
  emitDiagnostics(workflow, diagnostics, workspace, workingDirectory);
  workflow.summary(validationSummary(valid, diagnostics, invocation.target, manifest));
  workflow.setOutput("valid", String(valid));
  workflow.setOutput("diagnostics-json", JSON.stringify(diagnostics));

  if (result.built === true) {
    const archivePath = path.resolve(workingDirectory, result.output || buildOutput);
    workflow.setOutput("archive-path", archivePath);
    workflow.setOutput("archive-sha256", result.archive_sha256 || "");
  }

  if (!valid) {
    workflow.fail(
      `treetop-bundle rejected ${manifest} with ${diagnostics.length} diagnostic(s)`,
      diagnostics.length === 0,
    );
  }
  return { diagnostics, result, valid };
}

async function main(dependencies = {}) {
  const environment = dependencies.environment || process.env;
  const workflow = dependencies.workflow || new Workflow(environment);
  try {
    return await runAction({ ...dependencies, environment, workflow });
  } catch (error) {
    workflow.fail(error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

module.exports = {
  DEFAULT_BINARY_VERSION,
  assertCliResult,
  assertDiagnostics,
  main,
  resolveExecutable,
  runAction,
};
