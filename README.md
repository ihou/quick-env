quick‑env — multi‑preset environment variables CLI

What it does
- Save multiple named presets of environment variables (e.g. dev, prod)
- Switch presets interactively and export to your current shell
- Add/Edit/Delete keys with arrow‑key menus; pretty, aligned output

Install
- Requires Node.js 16+
- Global install:
  npm i -g @owen728/quick-env

Initialize (recommended)
- Load the shell helper for the current terminal only:
  source <(quick-env init)
- Persist across new terminals (add to your shell rc):
  # zsh
  echo 'source <(quick-env init)' >> ~/.zshrc && source ~/.zshrc
  # bash
  echo 'source <(quick-env init)' >> ~/.bashrc && source ~/.bashrc

Quick start
- Open the command palette:
  quick-env
- Switch and export to current shell:
  quickenv use
  # or, without the helper: eval "$(quick-env use)"
- Switch to a specific preset (quotes for special chars):
  quickenv use "dev"
  # or: eval "$(quick-env use \"dev\")"

Common commands
- quick-env                Open interactive command palette
- quick-env init           Print shell helper (adds quickenv wrapper)
- quick-env list           Pick a preset and view its keys (arrow‑keys)
- quick-env show <name>    Show variables for a preset
- quick-env use [name]     Interactively choose when name omitted; prints export lines
- quick-env set            Interactive add keys (supports repeated adds and preset switch)
- quick-env edit           Interactive edit variables (select preset/KEY)
- quick-env del [name] [KEY] Interactive delete a key or entire preset
- quick-env current        Print current preset name

Notes
- A CLI can’t change its parent shell by itself. quick-env init adds quickenv,
  which runs quick-env use and evals export lines so vars apply immediately.
- Keys must match ^[A-Z0-9_]+$; values must be single‑line.
- Config is stored at ~/.quick-env/config.json and persists across terminals.
- Optional: auto‑apply last preset on startup. Append after the init line:
  # zsh
  echo 'quickenv use "$(quick-env current)" 2>/dev/null' >> ~/.zshrc && source ~/.zshrc
  # bash
  echo 'quickenv use "$(quick-env current)" 2>/dev/null' >> ~/.bashrc && source ~/.bashrc

Shells supported
- zsh, bash
