quickenv — Multi‑preset environment variables CLI

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
  source <(quickenv init)
- Persist across new terminals (append to your shell rc):
  # zsh
  echo 'source <(quickenv init)' >> ~/.zshrc && source ~/.zshrc
  # bash
  echo 'source <(quickenv init)' >> ~/.bashrc && source ~/.bashrc

Quick Start
- Open the interactive command palette:
  quickenv
- Switch presets and export to the current shell:
  quickenv use
- Switch to a specific preset (quote names with spaces/special chars):
  quickenv use "dev"
- Without the helper function, eval the output manually:
  eval "$(quickenv use)"
  eval "$(quickenv use \"dev\")"

Command Reference
- quickenv                Open interactive command palette
- quickenv init           Print shell helper
- quickenv list           Interactively pick a preset and view its keys
- quickenv show <name>    Show variables for a preset
- quickenv use [name]     Interactively choose when name omitted; prints export lines
- quickenv set            Interactive add keys (supports repeated adds and preset switch)
- quickenv edit           Interactive edit variables (select preset/KEY)
- quickenv del [name] [KEY] Interactive delete a key or an entire preset
- quickenv current        Print current preset name

Non‑interactive Examples
- Set a single key without menus:
  quickenv set dev API_URL https://api.example.com
- Export a preset without the helper function:
  eval "$(quickenv use dev)"

Notes
- Shell limitation: a CLI can’t change its parent shell by itself. `quickenv init` adds a `quickenv` function that runs `quickenv use` and evals the export lines so variables apply immediately.
- Key rules: names must match `^[A-Z0-9_]+$`; values must be single‑line.
- Config location: `~/.quick-env/config.json` (persists across terminals).
- Optional: auto‑apply the last preset on startup. Append after the init line:
  # zsh
  echo 'quickenv use "$(quickenv current)" 2>/dev/null' >> ~/.zshrc && source ~/.zshrc
  # bash
  echo 'quickenv use "$(quickenv current)" 2>/dev/null' >> ~/.bashrc && source ~/.bashrc

Supported Shells
- zsh, bash
