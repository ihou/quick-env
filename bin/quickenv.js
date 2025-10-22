#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const tty = require("tty");

const CONFIG_DIR = path.join(os.homedir(), ".quick-env");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function ensureDir() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (e) {
    // ignore if exists
  }
}

function defaultConfig() {
  return { current: null, envs: {} };
}

function readConfig() {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    return defaultConfig();
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    if (!raw.trim()) return defaultConfig();
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== "object") throw new Error("Invalid config");
    if (!cfg.envs || typeof cfg.envs !== "object") cfg.envs = {};
    if (!("current" in cfg)) cfg.current = null;
    return cfg;
  } catch (err) {
    console.error(`Config file is corrupted or unreadable: ${CONFIG_PATH}`);
    console.error("Please back up and fix the JSON, then retry.");
    process.exitCode = 1;
    process.exit(1);
  }
}

function writeConfig(cfg) {
  ensureDir();
  const tmp = path.join(CONFIG_DIR, `config.${Date.now()}.${process.pid}.tmp`);
  const data = JSON.stringify(cfg, null, 2) + "\n";
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, CONFIG_PATH);
}

function isValidKey(key) {
  return /^[A-Z0-9_]+$/.test(key);
}

function hasNewline(val) {
  return /\r|\n/.test(String(val));
}

function shellQuote(value) {
  const s = String(value);
  // single-quote style, escape ' as '\''
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function padRight(str, len) {
  const s = String(str);
  if (s.length >= len) return s;
  return s + " ".repeat(len - s.length);
}

// Minimal ANSI color helpers (used for interactive UI)
function _color(open, close) {
  return (s) => `${open}${s}${close}`;
}
const c = {
  bold: _color("\x1b[1m", "\x1b[22m"),
  dim: _color("\x1b[2m", "\x1b[22m"),
  red: _color("\x1b[31m", "\x1b[39m"),
  green: _color("\x1b[32m", "\x1b[39m"),
  yellow: _color("\x1b[33m", "\x1b[39m"),
  blue: _color("\x1b[34m", "\x1b[39m"),
  magenta: _color("\x1b[35m", "\x1b[39m"),
  cyan: _color("\x1b[36m", "\x1b[39m"),
  gray: _color("\x1b[90m", "\x1b[39m"),
};

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}

function printAlignedVars(vars) {
  const keys = Object.keys(vars);
  if (keys.length === 0) {
    console.log(c.dim("(no variables)"));
    return;
  }
  const width = Math.max(...keys.map((k) => k.length));
  for (const k of keys.sort()) {
    const val = vars[k];
    const keyCol = c.cyan(c.bold(padRight(k, width)));
    const eq = c.dim("=");
    console.log(`${keyCol} ${eq} ${val}`);
  }
}

function presetApplyStatus(cfg, name) {
  const vars = (cfg.envs && cfg.envs[name]) || {};
  const keys = Object.keys(vars);
  if (keys.length === 0) return { total: 0, applied: 0, status: "applied" };
  let applied = 0;
  for (const k of keys) {
    if (process.env[k] === String(vars[k])) applied++;
  }
  let status = "none";
  if (applied === keys.length) status = "applied";
  else if (applied > 0) status = "partial";
  return { total: keys.length, applied, status };
}

function cmdShowDefault() {
  const cfg = readConfig();
  const name = cfg.current;
  if (!name || !cfg.envs[name]) {
    console.log(c.cyan(c.bold("Current preset: ")) + c.yellow("-"));
    console.log("");
    console.log(c.dim("No preset selected. Run `quickenv use` to choose or `quickenv list` to view."));
    return;
  }
  const st = presetApplyStatus(cfg, name);
  const tag = st.status === "applied" ? c.green("applied") : (st.status === "partial" ? c.yellow("partial") : c.yellow("not-applied"));
  console.log(c.cyan(c.bold("Current preset: ")) + c.green(name) + " " + c.dim(`[${st.applied}/${st.total} · ${tag}]`));
  console.log("");
  printAlignedVars(cfg.envs[name] || {});
}

function cmdInit() {
  // Print helper function that evals exports from `quickenv use`.
  // Usage: source <(quickenv init)
  const fn = `# quickenv shell helper (bash/zsh)
quickenv() {
  if [ "$1" = "use" ]; then
    shift
    local __out
    if ! __out="$(command quickenv use "$@" </dev/tty)"; then
      return $?
    fi
    eval "$__out"
  else
    command quickenv "$@"
  fi
}
`;
  process.stdout.write(fn);
}

async function cmdList() {
  const cfg = readConfig();
  const names = Object.keys(cfg.envs).sort();
  if (names.length === 0) {
    console.log(c.dim("(no presets)"));
    return;
  }
  // Interactive selection if possible; otherwise, just print names
  const currentIdx = Math.max(0, cfg.current ? names.indexOf(cfg.current) : 0);
  const picked = await selectMenuInteractively(names, { title: "Select a preset:", initialIndex: currentIdx });
  if (!picked) {
    // Non-interactive or cancelled: print the list of names
    const title = c.cyan(c.bold("Presets"));
    console.log(`${title} ${c.dim(`(${names.length})`)}`);
    for (const n of names) {
      const isCurrent = cfg.current === n;
      const bullet = isCurrent ? c.green("★") : c.gray("•");
      const label = isCurrent ? c.green(c.bold(n)) : n;
      const count = Object.keys(cfg.envs[n] || {}).length;
      const meta = [];
      meta.push(`${count}`);
      if (isCurrent) meta.push("current");
      console.log(` ${bullet} ${label} ${c.dim(`[${meta.join(" · ")}]`)}`);
    }
    return;
  }
  // Show variables of the selected preset
  const vars = cfg.envs[picked] || {};
  console.log(c.cyan(c.bold("Preset: ")) + picked + " " + c.dim(`[${Object.keys(vars).length}]`));
  console.log("");
  printAlignedVars(vars);
}

function cmdShow(name) {
  const cfg = readConfig();
  if (!name || !cfg.envs[name]) {
    console.error(c.red(`Preset not found: ${name || "(missing)"}`));
    console.error(c.dim("Use `quickenv list` to view existing presets."));
    process.exit(1);
  }
  const isCurrent = cfg.current === name;
  const vars = cfg.envs[name] || {};
  const st = presetApplyStatus(cfg, name);
  const tag = st.status === "applied" ? "applied" : (st.status === "partial" ? "partial" : "not-applied");
  const countStr = c.dim(`[${Object.keys(vars).length}${isCurrent ? " · current" : ""} · ${tag}]`);
  console.log(c.cyan(c.bold("Preset: ")) + (isCurrent ? c.green(name) : name) + " " + countStr);
  console.log("");
  printAlignedVars(vars);
}

async function cmdUse(name) {
  const cfg = readConfig();
  if (!name) {
    const names = Object.keys(cfg.envs).sort();
    if (names.length === 0) {
      console.error(c.red("No presets available. Run `quickenv set` to create variables first."));
      process.exit(1);
    }
    const picked = await selectPresetInteractively(names, cfg.current);
    if (!picked) {
      console.error(c.yellow("Cancelled."));
      process.exit(1);
    }
    name = picked;
  }
  if (!cfg.envs[name]) {
    console.error(`Preset not found: ${name}`);
    console.error("Use `quickenv list` to view existing presets.");
    process.exit(1);
  }
  const vars = cfg.envs[name] || {};
  for (const [k, v] of Object.entries(vars)) {
    if (!isValidKey(k)) {
      console.error(`Invalid key name: ${k}. Should match [A-Z0-9_]+`);
      process.exit(1);
    }
    if (hasNewline(v)) {
      console.error(`Value contains newline; cannot export: ${k}`);
      console.error("Please make it a single line via `quickenv set`.");
      process.exit(1);
    }
  }
  // Update current preset then output exports.
  cfg.current = name;
  writeConfig(cfg);
  const out = Object.entries(vars)
    .map(([k, v]) => `export ${k}=${shellQuote(v)};`)
    .join("\n");
  process.stdout.write(out + (out ? "\n" : ""));
}

function writeStderr(str) {
  try { process.stderr.write(str); } catch (_) { /* ignore */ }
}

function clearLines(count) {
  // Move cursor up and clear lines on stderr
  for (let i = 0; i < count; i++) {
    writeStderr("\x1b[1A\x1b[2K");
  }
}

async function selectPresetInteractively(names, current) {
  return new Promise((resolve) => {
    // Prefer real TTY for input
    let input = process.stdin;
    let needClose = false;
    try {
      if (!input.isTTY) {
        const fd = fs.openSync("/dev/tty", "r");
        input = new tty.ReadStream(fd);
        needClose = true;
      }
    } catch (e) {
      console.error(c.red("Non-interactive environment. Provide a name: quickenv use <name>"));
      return resolve(null);
    }
    const hdr = `${c.cyan(c.bold("Select a preset:"))}`;
    const hint = c.dim("↑/↓ to move, Enter to confirm, Esc to cancel");
    let idx = Math.max(0, current ? names.indexOf(current) : 0);
    if (idx === -1) idx = 0;
    let renderedLines = 0;

    function render() {
      const lines = [];
      lines.push(hdr);
      for (let i = 0; i < names.length; i++) {
        const sel = i === idx;
        const pointer = sel ? c.green("›") : " ";
        const label = sel ? c.green(c.bold(names[i])) : names[i];
        lines.push(` ${pointer} ${label}`);
      }
      lines.push(hint);
      if (renderedLines > 0) clearLines(renderedLines);
      writeStderr(lines.join("\n") + "\n");
      renderedLines = lines.length;
    }

    function cleanup() {
      if (renderedLines > 0) {
        clearLines(renderedLines);
        renderedLines = 0;
      }
    }

    const onKeypress = (str, key) => {
      if (!key) return;
      if (key.name === "up") {
        idx = (idx - 1 + names.length) % names.length;
        render();
      } else if (key.name === "down") {
        idx = (idx + 1) % names.length;
        render();
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        stop();
        resolve(names[idx]);
      } else if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        cleanup();
        stop();
        resolve(null);
      }
    };

    function stop() {
      try { input.off("keypress", onKeypress); } catch (_) {}
      try { input.setRawMode(false); } catch (_) {}
      try { input.pause(); } catch (_) {}
      if (needClose) {
        try { input.destroy(); } catch (_) {}
      }
    }

    readline.emitKeypressEvents(input);
    if (input.isTTY) {
      try { input.setRawMode(true); } catch (_) {}
    }
    try { input.resume(); } catch (_) {}
    input.on("keypress", onKeypress);
    render();
  });
}

async function selectMenuInteractively(items, { title = "Select:", initialIndex = 0 } = {}) {
  return new Promise((resolve) => {
    // Prefer real TTY for input
    let input = process.stdin;
    let needClose = false;
    try {
      if (!input.isTTY) {
        const fd = fs.openSync("/dev/tty", "r");
        input = new tty.ReadStream(fd);
        needClose = true;
      }
    } catch (e) {
      console.error(c.red("Non-interactive environment. Use command form instead."));
      return resolve(null);
    }
    const hdr = c.cyan(c.bold(title));
    const hint = c.dim("↑/↓ to move, Enter to confirm, Esc to cancel");
    let idx = Math.max(0, Math.min(initialIndex, Math.max(items.length - 1, 0)));
    let renderedLines = 0;

    function render() {
      const lines = [];
      lines.push(hdr);
      for (let i = 0; i < items.length; i++) {
        const sel = i === idx;
        const pointer = sel ? c.green("›") : " ";
        const label = sel ? c.green(c.bold(items[i])) : items[i];
        lines.push(` ${pointer} ${label}`);
      }
      lines.push(hint);
      if (renderedLines > 0) clearLines(renderedLines);
      writeStderr(lines.join("\n") + "\n");
      renderedLines = lines.length;
    }

    function cleanup() {
      if (renderedLines > 0) {
        clearLines(renderedLines);
        renderedLines = 0;
      }
    }

    const onKeypress = (str, key) => {
      if (!key) return;
      if (key.name === "up") {
        idx = (idx - 1 + items.length) % items.length;
        render();
      } else if (key.name === "down") {
        idx = (idx + 1) % items.length;
        render();
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        stop();
        resolve(items[idx]);
      } else if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        cleanup();
        stop();
        resolve(null);
      }
    };

    function stop() {
      try { input.off("keypress", onKeypress); } catch (_) {}
      try { input.setRawMode(false); } catch (_) {}
      try { input.pause(); } catch (_) {}
      if (needClose) {
        try { input.destroy(); } catch (_) {}
      }
    }

    readline.emitKeypressEvents(input);
    if (input.isTTY) {
      try { input.setRawMode(true); } catch (_) {}
    }
    try { input.resume(); } catch (_) {}
    input.on("keypress", onKeypress);
    render();
  });
}

async function selectKeyForDeleteInteractively(presetName, keys) {
  const items = [...keys, c.red("Delete entire preset…"), c.yellow("Back"), c.dim("Cancel")];
  const ret = await selectMenuInteractively(items, { title: `Select a KEY to delete (preset: ${presetName})` });
  if (ret === null) return { type: "cancel" };
  const plain = stripAnsi(ret);
  if (plain === "Cancel") return { type: "cancel" };
  if (plain === "Back") return { type: "back" };
  if (plain.includes("Delete entire preset")) return { type: "delete-preset" };
  return { type: "key", key: plain };
}

async function cmdDelInteractive() {
  const cfg = readConfig();
  let names = Object.keys(cfg.envs).sort();
  if (names.length === 0) {
    console.error(c.red("No presets to delete."));
    return;
  }
  while (true) {
    const picked = await selectPresetInteractively(names, cfg.current);
    if (!picked) {
      console.error(c.yellow("Cancelled."));
      return;
    }
    const name = picked;
    // Inner loop for deleting multiple keys
    while (true) {
      const keys = Object.keys(cfg.envs[name] || {}).sort();
      if (keys.length === 0) {
        const opt = await selectMenuInteractively([c.red("Delete entire preset…"), c.yellow("Back"), c.dim("Cancel")], { title: `Preset ${name} has no variables` });
        if (!opt) { console.error(c.yellow("Cancelled.")); return; }
        const plain = stripAnsi(opt);
        if (plain === "Cancel") { console.error(c.yellow("Cancelled.")); return; }
        if (plain === "Back") break; // back to preset selection
        if (plain.includes("Delete entire preset")) {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ans = (await askQuestion(rl, c.yellow(`Confirm delete the entire preset \`${name}\`? (y/N) `))).trim().toLowerCase();
          rl.close();
          if (ans !== "y" && ans !== "yes") { console.error(c.yellow("Cancelled.")); return; }
          delete cfg.envs[name];
          if (cfg.current === name) cfg.current = null;
          writeConfig(cfg);
          console.log(c.green(`Deleted preset: ${name}`));
          names = Object.keys(cfg.envs).sort();
          if (names.length === 0) return; // nothing left
          break; // back to preset selection
        }
      } else {
        const selection = await selectKeyForDeleteInteractively(name, keys);
        if (selection.type === "cancel") { console.error(c.yellow("Cancelled.")); return; }
        if (selection.type === "back") break; // back to preset selection
        if (selection.type === "delete-preset") {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ans = (await askQuestion(rl, c.yellow(`Confirm delete the entire preset \`${name}\`? (y/N) `))).trim().toLowerCase();
          rl.close();
          if (ans !== "y" && ans !== "yes") { console.error(c.yellow("Cancelled.")); return; }
          delete cfg.envs[name];
          if (cfg.current === name) cfg.current = null;
          writeConfig(cfg);
          console.log(c.green(`Deleted preset: ${name}`));
          names = Object.keys(cfg.envs).sort();
          if (names.length === 0) return;
          break; // back to preset selection
        }
        if (selection.type === "key") {
          const key = selection.key;
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ans = (await askQuestion(rl, c.yellow(`Confirm delete \`${name}.${key}\`? (y/N) `))).trim().toLowerCase();
          rl.close();
          if (ans !== "y" && ans !== "yes") {
            console.error(c.yellow("Cancelled."));
            return;
          }
          delete cfg.envs[name][key];
          writeConfig(cfg);
          console.log(c.green(`Deleted: ${name}.${key}`));
          // continue inner loop to allow more deletions
        }
      }
    }
  }
}

async function cmdEditInteractive() {
  const cfg = readConfig();
  let names = Object.keys(cfg.envs).sort();
  if (names.length === 0) {
    console.error(c.red("No presets to edit. Run `quickenv set` first."));
    return;
  }
  while (true) {
    const picked = await selectPresetInteractively(names, cfg.current);
    if (!picked) { console.error(c.yellow("Cancelled.")); return; }
    const name = picked;
    while (true) {
      const keys = Object.keys(cfg.envs[name] || {}).sort();
      const items = [...keys, c.green("Create KEY…"), c.yellow("Back"), c.dim("Cancel")];
      const ret = await selectMenuInteractively(items, { title: `Select a KEY to edit (preset: ${name})` });
      if (!ret) { console.error(c.yellow("Cancelled.")); return; }
      const plain = stripAnsi(ret);
      if (plain === "Cancel") { console.error(c.yellow("Cancelled.")); return; }
      if (plain === "Back") break; // back to preset selection
      if (plain.includes("Create KEY")) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        let key = (await askQuestion(rl, c.cyan("Enter new KEY (uppercase, A-Z0-9_): "))).trim();
        while (!isValidKey(key)) {
          console.log(c.yellow("Invalid KEY. Use uppercase letters, digits, and underscores (^[A-Z0-9_]+$)"));
          key = (await askQuestion(rl, c.cyan("Re-enter KEY: "))).trim();
        }
        if (typeof cfg.envs[name][key] !== "undefined") {
          const ans = (await askQuestion(rl, c.yellow(`KEY exists. Overwrite? (y/N) `))).trim().toLowerCase();
          if (ans !== "y" && ans !== "yes") { rl.close(); console.error(c.yellow("Cancelled.")); return; }
        }
        const value = (await askQuestion(rl, c.cyan("Enter VALUE (single line): "))).trim();
        rl.close();
        if (hasNewline(value)) { console.error(c.red("Value contains newline. Use single-line string.")); return; }
        cfg.envs[name][key] = value;
        writeConfig(cfg);
        console.log(c.green(`Saved: ${name}.${key}`));
        continue; // stay in key loop
      }
      // edit existing key
      const key = plain;
      const oldVal = cfg.envs[name][key];
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log(c.dim(`Current value: ${oldVal}`));
      let value = (await askQuestion(rl, c.cyan("Enter new value (Enter to keep, '-' to clear): ")));
      value = value.trim();
      if (value === "") value = oldVal; // keep
      else if (value === "-") value = ""; // clear
      rl.close();
      if (hasNewline(value)) { console.error(c.red("Value contains newline. Use single-line string.")); return; }
      cfg.envs[name][key] = value;
      writeConfig(cfg);
      console.log(c.green(`Saved: ${name}.${key}`));
      // continue editing more keys
    }
  }
}

function askQuestion(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function cmdSetInteractive() {
  const cfg = readConfig();
  const names = Object.keys(cfg.envs).sort();
  let presetName = null;

  if (names.length === 0) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const input = await askQuestion(rl, c.cyan("No presets yet. Enter a new preset name: "));
    rl.close();
    presetName = input.trim();
    if (!presetName) {
      console.error(c.red("Preset name cannot be empty."));
      return;
    }
    if (!cfg.envs[presetName]) cfg.envs[presetName] = {};
  } else {
    const opts = [...names, c.green("Create new preset…"), c.dim("Cancel")];
    const initialIndex = Math.max(0, cfg.current ? names.indexOf(cfg.current) : 0);
    const sel = await selectMenuInteractively(opts, { title: "Select a preset for setting variables:", initialIndex });
    if (!sel) {
      // Fallback to text input when non-interactive
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log(c.cyan("Select a preset:"));
      names.forEach((n, idx) => {
        const mark = cfg.current === n ? "*" : " ";
        const label = cfg.current === n ? c.green(n) : n;
        console.log(`  [${idx + 1}] ${mark} ${label}`);
      });
      console.log(c.dim(`  [${names.length + 1}] Create new preset`));
      const ans = await askQuestion(rl, c.cyan(`Enter index or name: `));
      rl.close();
      const trimmed = ans.trim();
      const num = Number(trimmed);
      if (Number.isInteger(num) && num >= 1 && num <= names.length) {
        presetName = names[num - 1];
      } else if (Number.isInteger(num) && num === names.length + 1) {
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        const newName = await askQuestion(rl2, c.cyan("Enter new preset name: "));
        rl2.close();
        presetName = newName.trim();
        if (!presetName) {
          console.error(c.red("Preset name cannot be empty."));
          return;
        }
        if (!cfg.envs[presetName]) cfg.envs[presetName] = {};
      } else if (trimmed) {
        if (!cfg.envs[trimmed]) {
          const rl3 = readline.createInterface({ input: process.stdin, output: process.stdout });
          const confirm = (await askQuestion(rl3, c.yellow(`Preset \`${trimmed}\` does not exist. Create it? (y/N) `))).trim().toLowerCase();
          rl3.close();
          if (confirm !== "y" && confirm !== "yes") {
            console.error(c.yellow("Cancelled."));
            return;
          }
          cfg.envs[trimmed] = {};
        }
        presetName = trimmed;
      } else {
        console.error(c.red("Invalid input."));
        return;
      }
    } else {
      const choice = stripAnsi(sel);
      if (choice === "Cancel") {
        console.error(c.yellow("Cancelled."));
        return;
      }
      if (choice.includes("Create new preset")) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const newName = await askQuestion(rl, c.cyan("Enter new preset name: "));
        rl.close();
        presetName = newName.trim();
        if (!presetName) {
          console.error(c.red("Preset name cannot be empty."));
          return;
        }
        if (!cfg.envs[presetName]) cfg.envs[presetName] = {};
      } else {
        presetName = choice;
      }
    }
  }

  // Loop: add multiple keys until user finishes
  while (true) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let key = (await askQuestion(rl, c.cyan("Enter KEY (uppercase, A-Z0-9_): "))).trim();
    while (!isValidKey(key)) {
      console.log(c.yellow("Invalid KEY. Use uppercase letters, digits, and underscores (^[A-Z0-9_]+$)"));
      key = (await askQuestion(rl, c.cyan("Re-enter KEY: "))).trim();
    }
    const currentVal = cfg.envs[presetName][key];
    if (typeof currentVal !== "undefined") {
      const ans = (await askQuestion(rl, c.yellow(`KEY exists (current: ${currentVal}). Overwrite? (y/N) `))).trim().toLowerCase();
      if (ans !== "y" && ans !== "yes") {
        console.log(c.yellow("Not overwritten. Cancelled."));
        rl.close();
        // Ask next action after cancelling overwrite
        const next = await selectMenuInteractively(["Add another key", "Change preset", "Finish"], { title: `Next action for ${presetName}:` });
        const plain = next ? stripAnsi(next) : null;
        if (plain === "Change preset") {
          // choose preset again
          const names2 = Object.keys(cfg.envs).sort();
          const opts2 = [...names2, c.green("Create new preset…"), c.dim("Cancel")];
          const initialIndex2 = Math.max(0, cfg.current ? names2.indexOf(cfg.current) : 0);
          const sel2 = await selectMenuInteractively(opts2, { title: "Select a preset:", initialIndex: initialIndex2 });
          const choice2 = sel2 ? stripAnsi(sel2) : null;
          if (choice2 && choice2 !== "Cancel") {
            if (choice2.includes("Create new preset")) {
              const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
              const newName2 = await askQuestion(rl2, c.cyan("Enter new preset name: "));
              rl2.close();
              const p2 = newName2.trim();
              if (p2) { if (!cfg.envs[p2]) cfg.envs[p2] = {}; presetName = p2; }
            } else {
              presetName = choice2;
            }
          }
        }
        if (plain === "Finish" || !plain) return; // end
        continue; // add another key
      }
    }
    const value = (await askQuestion(rl, c.cyan("Enter VALUE (single line): "))).trim();
    rl.close();
    if (hasNewline(value)) {
      console.error(c.red("Value contains newline. Use single-line string."));
      return;
    }

    cfg.envs[presetName][key] = value;
    writeConfig(cfg);
    console.log(c.green(`Saved: ${presetName}.${key}`));

    // Ask next action
    const next = await selectMenuInteractively(["Add another key", "Change preset", "Finish"], { title: `Next action for ${presetName}:` });
    const plain = next ? stripAnsi(next) : null;
    if (plain === "Change preset") {
      const names2 = Object.keys(cfg.envs).sort();
      const opts2 = [...names2, c.green("Create new preset…"), c.dim("Cancel")];
      const initialIndex2 = Math.max(0, cfg.current ? names2.indexOf(cfg.current) : 0);
      const sel2 = await selectMenuInteractively(opts2, { title: "Select a preset:", initialIndex: initialIndex2 });
      const choice2 = sel2 ? stripAnsi(sel2) : null;
      if (choice2 && choice2 !== "Cancel") {
        if (choice2.includes("Create new preset")) {
          const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
          const newName2 = await askQuestion(rl2, c.cyan("Enter new preset name: "));
          rl2.close();
          const p2 = newName2.trim();
          if (p2) { if (!cfg.envs[p2]) cfg.envs[p2] = {}; presetName = p2; }
        } else {
          presetName = choice2;
        }
      }
    } else if (plain === "Finish" || !plain) {
      return; // done
    }
    // else Add another key -> loop
  }
}

function cmdSetNonInteractive(presetName, key, value) {
  const cfg = readConfig();
  if (!presetName) {
    console.error("Provide a preset: quickenv set <preset> <KEY> <VALUE>");
    process.exit(1);
  }
  if (!cfg.envs[presetName]) cfg.envs[presetName] = {};
  if (!isValidKey(key)) {
    console.error("Invalid KEY. Use uppercase letters, digits, and underscores (^[A-Z0-9_]+$)");
    process.exit(1);
  }
  if (typeof value === "undefined" || value === null) value = "";
  if (hasNewline(value)) {
    console.error("Value contains newline. Use single-line string.");
    process.exit(1);
  }
  cfg.envs[presetName][key] = String(value);
  writeConfig(cfg);
  console.log(`Saved: ${presetName}.${key}`);
}

function cmdDel(name, key) {
  const cfg = readConfig();
  if (!name || !cfg.envs[name]) {
    console.error(`Preset not found: ${name || "(missing)"}`);
    console.error("Use `quickenv list` to view existing presets.");
    process.exit(1);
  }
  if (!key) {
    // Delete entire preset
    delete cfg.envs[name];
    if (cfg.current === name) {
      cfg.current = null;
    }
    writeConfig(cfg);
    console.log(`Deleted preset: ${name}`);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(cfg.envs[name], key)) {
    console.error(`KEY not found: ${key}`);
    process.exit(1);
  }
  delete cfg.envs[name][key];
  writeConfig(cfg);
  console.log(`Deleted: ${name}.${key}`);
}

function cmdCurrent() {
  const cfg = readConfig();
  if (!cfg.current) {
    console.error("No current preset set.");
    process.exit(1);
  }
  process.stdout.write(String(cfg.current) + "\n");
}

function printUsage() {
  console.log("quickenv — Multi-preset environment variables CLI");
  console.log("");
  console.log("Usage:");
  console.log("  quickenv            Open interactive command palette");
  console.log("  quickenv init       Print shell function");
  console.log("  quickenv list       List all presets");
  console.log("  quickenv show <name>     Show variables for a preset");
  console.log("  quickenv use [name]      Interactively choose when name omitted");
  console.log("  quickenv set        Interactive set variables");
  console.log("  quickenv edit       Interactive edit variables (select preset/KEY)");
  console.log("  quickenv del [name] [KEY] Interactive delete key or entire preset");
  console.log("  quickenv current    Print current preset name");
}

async function cmdRootInteractive() {
  const menu = [
    { cmd: "list", desc: "List all presets" },
    { cmd: "use", desc: "Interactively choose and export" },
    { cmd: "show", desc: "Show variables for a preset" },
    { cmd: "set", desc: "Interactive set variables" },
    { cmd: "edit", desc: "Interactive edit variables (select preset/KEY)" },
    { cmd: "del", desc: "Interactive delete key or entire preset" },
    { cmd: "current", desc: "Print current preset name" },
    { cmd: "help", desc: "Show usage" },
    { cmd: "exit", desc: "Exit" },
  ];
  const labels = menu.map(({ cmd, desc }) => `${c.cyan(cmd)} ${c.dim("— "+desc)}`);
  while (true) {
    const picked = await selectMenuInteractively(labels, { title: "Select a command:" });
    if (!picked) { printUsage(); return; }
    const choice = stripAnsi(picked).split(" — ")[0];
    switch (choice) {
      case "list":
        await cmdList();
        break;
      case "use":
        await cmdUse();
        break;
      case "show": {
        const cfg = readConfig();
        const names = Object.keys(cfg.envs).sort();
        if (names.length === 0) { console.log(c.dim("(no presets)")); break; }
        const name = await selectPresetInteractively(names, cfg.current);
        if (!name) { console.error(c.yellow("Cancelled.")); break; }
        cmdShow(name);
        break;
      }
      case "set":
        await cmdSetInteractive();
        break;
      case "edit":
        await cmdEditInteractive();
        break;
      case "del":
        await cmdDelInteractive();
        break;
      case "current":
        cmdCurrent();
        break;
      case "help":
        printUsage();
        break;
      case "exit":
      default:
        return;
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  switch (cmd) {
    case undefined:
      (async () => { await cmdRootInteractive(); })();
      break;
    case "init":
      cmdInit();
      break;
    case "init-internal":
      // reserved if needed; for now same as init
      cmdInit();
      break;
    case "list":
      (async () => { await cmdList(); })();
      break;
    case "show":
      cmdShow(argv[1]);
      break;
    case "use":
      // Support interactive selection when name is omitted
      (async () => {
        await cmdUse(argv[1]);
      })();
      break;
    case "set":
      if (argv.length >= 4) {
        // Non-interactive: quickenv set <preset> <KEY> <VALUE>
        cmdSetNonInteractive(argv[1], argv[2], argv.slice(3).join(" "));
      } else {
        cmdSetInteractive();
      }
      break;
    case "del":
      if (!argv[1]) {
        (async () => { await cmdDelInteractive(); })();
      } else if (argv[1] && !argv[2]) {
        (async () => { await cmdDelInteractive(); })();
      } else {
        cmdDel(argv[1], argv[2]);
      }
      break;
    case "edit":
      (async () => { await cmdEditInteractive(); })();
      break;
    case "current":
      cmdCurrent();
      break;
    case "help":
    case "-h":
    case "--help":
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printUsage();
      process.exit(1);
  }
}

main();
