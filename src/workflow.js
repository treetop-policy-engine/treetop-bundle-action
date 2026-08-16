"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

function escapeData(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function escapeProperty(value) {
  return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

function inputEnvironmentName(name) {
  return `INPUT_${name.replaceAll(" ", "_").toUpperCase()}`;
}

class Workflow {
  constructor(environment = process.env, output = process.stdout) {
    this.environment = environment;
    this.output = output;
  }

  input(name, defaultValue = "") {
    const value = this.environment[inputEnvironmentName(name)];
    return value === undefined ? defaultValue : value.trim();
  }

  booleanInput(name, defaultValue = false) {
    const value = this.input(name, String(defaultValue)).toLowerCase();
    if (value !== "true" && value !== "false") {
      throw new Error(`${name} must be true or false`);
    }
    return value === "true";
  }

  info(message) {
    this.output.write(`${String(message)}\n`);
  }

  annotation(level, message, properties = {}) {
    const serialized = Object.entries(properties)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${escapeProperty(value)}`)
      .join(",");
    const suffix = serialized === "" ? "" : ` ${serialized}`;
    this.output.write(`::${level}${suffix}::${escapeData(message)}\n`);
  }

  setOutput(name, value) {
    this.#appendFileCommand("GITHUB_OUTPUT", name, String(value));
  }

  addPath(value) {
    const destination = this.environment.GITHUB_PATH;
    if (destination) {
      fs.appendFileSync(destination, `${value}\n`, "utf8");
    }
  }

  summary(markdown) {
    const destination = this.environment.GITHUB_STEP_SUMMARY;
    if (destination) {
      fs.appendFileSync(destination, markdown, "utf8");
    }
  }

  fail(message, annotate = true) {
    if (annotate) {
      this.annotation("error", message, { title: "treetop-bundle action" });
    } else {
      this.info(message);
    }
    process.exitCode = 1;
  }

  #appendFileCommand(environmentName, name, value) {
    const destination = this.environment[environmentName];
    if (!destination) {
      return;
    }
    let delimiter;
    do {
      delimiter = `treetop_${crypto.randomUUID()}`;
    } while (value.includes(delimiter));
    fs.appendFileSync(
      destination,
      `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
      "utf8",
    );
  }
}

module.exports = {
  Workflow,
  escapeData,
  escapeProperty,
  inputEnvironmentName,
};
