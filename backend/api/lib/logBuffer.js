const MAX_LINES = 2000;
const buffer = [];

function push(level, args) {
  const line = {
    level,
    ts: new Date().toISOString(),
    message: args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ")
  };
  buffer.push(line);
  if (buffer.length > MAX_LINES) buffer.shift();
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function install() {
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...args) => {
    push("info", args);
    original.log(...args);
  };
  console.error = (...args) => {
    push("error", args);
    original.error(...args);
  };
  console.warn = (...args) => {
    push("warn", args);
    original.warn(...args);
  };
}

function getAll() {
  return buffer;
}

module.exports = { install, getAll };
