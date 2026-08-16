"use strict";

const path = require("node:path");

function toRepositoryPath(diagnosticPath, workspace, workingDirectory) {
  if (!diagnosticPath) {
    return undefined;
  }
  const absolute = path.isAbsolute(diagnosticPath)
    ? diagnosticPath
    : path.resolve(workingDirectory, diagnosticPath);
  const relative = path.relative(workspace, absolute);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return diagnosticPath.replaceAll(path.sep, "/");
  }
  return relative.replaceAll(path.sep, "/");
}

function annotationProperties(diagnostic, workspace, workingDirectory) {
  const properties = {
    title: diagnostic.code || "treetop-bundle",
    file: toRepositoryPath(diagnostic.path, workspace, workingDirectory),
  };
  if (Number.isInteger(diagnostic.line) && diagnostic.line > 0) {
    properties.line = diagnostic.line;
  }
  if (Number.isInteger(diagnostic.column) && diagnostic.column > 0) {
    properties.col = diagnostic.column;
  }
  return properties;
}

function emitDiagnostics(workflow, diagnostics, workspace, workingDirectory) {
  for (const diagnostic of diagnostics) {
    const level = diagnostic.severity === "warning" ? "warning" : "error";
    const modulePrefix = diagnostic.module ? `${diagnostic.module}: ` : "";
    workflow.annotation(
      level,
      `${modulePrefix}${diagnostic.message}`,
      annotationProperties(diagnostic, workspace, workingDirectory),
    );
  }
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function validationSummary(valid, diagnostics, target, manifest) {
  const icon = valid ? "✅" : "❌";
  let markdown = `## ${icon} Treetop bundle ${valid ? "valid" : "invalid"}\n\n`;
  markdown += `Checked \`${markdownCell(manifest)}\` as a ${markdownCell(target)} target.\n\n`;
  if (diagnostics.length === 0) {
    return `${markdown}No diagnostics.\n`;
  }
  markdown += "| Severity | Code | Module | Path | Message |\n";
  markdown += "| --- | --- | --- | --- | --- |\n";
  for (const diagnostic of diagnostics) {
    markdown += `| ${markdownCell(diagnostic.severity)} | ${markdownCell(diagnostic.code)} | `;
    markdown += `${markdownCell(diagnostic.module)} | ${markdownCell(diagnostic.path)} | `;
    markdown += `${markdownCell(diagnostic.message)} |\n`;
  }
  return markdown;
}

module.exports = {
  annotationProperties,
  emitDiagnostics,
  markdownCell,
  toRepositoryPath,
  validationSummary,
};
