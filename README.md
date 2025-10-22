quick-env — Multi‑preset environment variables CLI

Overview
- Save multiple named presets of environment variables (e.g. dev, prod).
- Switch presets interactively and export to the current shell.
- Add, edit, and delete keys with arrow‑key menus; aligned, readable output.
- Works with zsh and bash. Stores config in your home directory.

Install
- Prerequisite: Node.js 16+
- Global install:
  npm i -g @owen728/quick-env

Initialize (recommended)
- Load the shell helper for this terminal session:
  source <(quick-env init)
- Persist across new terminals (append to your shell rc):
  # zsh
  echo 'source <(quick-env init)' >> ~/.zshrc && source ~/.zshrc
  # bash
  echo 'source <(quick-env init)' >> ~/.bashrc && source ~/.bashrc

Quick Start
- Open the interactive command palette:
  quick-env
- Switch presets and export to the current shell:
  quickenv use
- Switch to a specific preset (quote names with spaces/special chars):
  quickenv use "dev"
- Without the helper function, eval the output manually:
  eval "$(quick-env use)"
  eval "$(quick-env use \"dev\")"

Command Reference
- quick-env                Open interactive command palette
- quick-env init           Print shell helper (adds `quickenv` wrapper)
- quick-env list           Interactively pick a preset and view its keys
- quick-env show <name>    Show variables for a preset
- quick-env use [name]     Interactively choose when name omitted; prints export lines
- quick-env set            Interactive add keys (supports repeated adds and preset switch)
- quick-env edit           Interactive edit variables (select preset/KEY)
- quick-env del [name] [KEY] Interactive delete a key or an entire preset
- quick-env current        Print current preset name

Non‑interactive Examples
- Set a single key without menus:
  quick-env set dev API_URL https://api.example.com
- Export a preset without the helper function:
  eval "$(quick-env use dev)"

Notes
- Shell limitation: a CLI can’t change its parent shell by itself. `quick-env init` adds a `quickenv` function that runs `quick-env use` and evals the export lines so variables apply immediately.
- Key rules: names must match `^[A-Z0-9_]+$`; values must be single‑line.
- Config location: `~/.quick-env/config.json` (persists across terminals).
- Optional: auto‑apply the last preset on startup. Append after the init line:
  # zsh
  echo 'quickenv use "$(quick-env current)" 2>/dev/null' >> ~/.zshrc && source ~/.zshrc
  # bash
  echo 'quickenv use "$(quick-env current)" 2>/dev/null' >> ~/.bashrc && source ~/.bashrc

Supported Shells
- zsh, bash
