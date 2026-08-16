"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function javascriptFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...javascriptFiles(filename));
    } else if (entry.isFile() && filename.endsWith(".js")) {
      files.push(filename);
    }
  }
  return files;
}

const roots = ["src", "scripts", "test"];
for (const filename of roots.flatMap(javascriptFiles)) {
  const result = spawnSync(process.execPath, ["--check", filename], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exitCode = 1;
  }
}
