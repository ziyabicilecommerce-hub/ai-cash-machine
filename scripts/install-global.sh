#!/usr/bin/env bash
#
# install-global.sh — install the marketing arsenal into the GLOBAL Claude
# config (~/.claude) so all slash commands + the Legendary Engine work in
# EVERY chat/project, not just this repo.
#
# Safe to re-run any time (e.g. after a container reset). Idempotent.
#
# Usage:  bash scripts/install-global.sh
#
set -euo pipefail

# Resolve the repo root (this script lives in <repo>/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLAUDE_HOME="${HOME}/.claude"
CMD_SRC="$REPO_ROOT/.claude/commands"
SKILL_SRC="$REPO_ROOT/.agents/skills/legendary-engine"
CMD_DST="$CLAUDE_HOME/commands"
SKILL_DST="$CLAUDE_HOME/skills/legendary-engine"

echo "🌍 Installing marketing arsenal globally into $CLAUDE_HOME ..."

mkdir -p "$CMD_DST" "$CLAUDE_HOME/skills"

# 1) Copy every slash command (160 agents + orchestration + tools),
#    but skip the ruflo/claude-flow commands that ship separately.
count=0
for f in "$CMD_SRC"/*.md; do
  base="$(basename "$f")"
  case "$base" in
    claude-flow-*) continue ;;
  esac
  cp "$f" "$CMD_DST/"
  count=$((count + 1))
done
echo "  ✓ $count slash commands -> $CMD_DST"

# 2) Copy the Legendary Engine (real generator + HTML tools)
cp -r "$SKILL_SRC" "$SKILL_DST/.." 2>/dev/null || cp -r "$SKILL_SRC" "$CLAUDE_HOME/skills/"
echo "  ✓ engine + tools -> $SKILL_DST"

# 3) Point the engine-running commands at the GLOBAL engine path so they
#    work from any project directory (not just this repo).
for f in legendary-engine campaign-generator battle-plan landing-forge launch-machine money-audit; do
  if [ -f "$CMD_DST/$f.md" ]; then
    sed -i 's#\.agents/skills/legendary-engine/#$HOME/.claude/skills/legendary-engine/#g' "$CMD_DST/$f.md"
  fi
done
echo "  ✓ engine paths rewritten to \$HOME/.claude/skills/legendary-engine/"

# 4) Sanity check
if node "$SKILL_DST/engine.js" >/dev/null 2>&1; then
  echo "  ✓ engine runs from global path"
else
  echo "  ⚠ engine did not run — check that Node.js is installed"
fi

echo ""
echo "✅ Done. $count commands + the Legendary Engine are now global."
echo "   Restart Claude Code (or reload) so the / menu picks them up."
