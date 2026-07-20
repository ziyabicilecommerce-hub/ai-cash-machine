#!/usr/bin/env bash
#
# install-global.sh — install EVERYTHING (all skills incl. ruflo, all slash
# commands, and the Legendary Engine) into the GLOBAL Claude config
# (~/.claude) so it all works in EVERY chat/project, not just this repo.
#
# Safe to re-run any time (e.g. after a container reset). Idempotent.
#
# Usage:  bash scripts/install-global.sh
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLAUDE_HOME="${HOME}/.claude"

echo "🌍 Installing the FULL arsenal globally into $CLAUDE_HOME ..."
mkdir -p "$CLAUDE_HOME/commands" "$CLAUDE_HOME/skills"

# 1) ALL slash commands (160 agents + orchestration + tools + everything)
find "$REPO_ROOT/.claude/commands" -name '*.md' -exec cp {} "$CLAUDE_HOME/commands/" \; 2>/dev/null
CMD_N=$(find "$CLAUDE_HOME/commands" -name '*.md' | wc -l | tr -d ' ')
echo "  ✓ $CMD_N slash commands -> $CLAUDE_HOME/commands"

# 2) ALL skills. The repo's .claude/skills entries are symlinks into
#    .agents/skills, so copy the REAL files from .agents/skills with -L
#    (dereference). Remove any stale broken symlinks in the target first.
find "$CLAUDE_HOME/skills" -maxdepth 1 -type l -delete 2>/dev/null
cp -rL "$REPO_ROOT/.agents/skills/." "$CLAUDE_HOME/skills/" 2>/dev/null
SKILL_N=$(ls -d "$CLAUDE_HOME"/skills/*/ 2>/dev/null | wc -l | tr -d ' ')
echo "  ✓ $SKILL_N skills (incl. ruflo) -> $CLAUDE_HOME/skills"

# 3) Point engine-running commands at the GLOBAL engine path so they work
#    from any project directory (not just this repo).
for f in legendary-engine campaign-generator battle-plan landing-forge launch-machine money-audit; do
  [ -f "$CLAUDE_HOME/commands/$f.md" ] && \
    sed -i 's#\.agents/skills/legendary-engine/#$HOME/.claude/skills/legendary-engine/#g' "$CLAUDE_HOME/commands/$f.md"
done
echo "  ✓ engine paths rewritten to global"

# 4) Sanity check
if node "$CLAUDE_HOME/skills/legendary-engine/engine.js" >/dev/null 2>&1; then
  echo "  ✓ Legendary Engine runs from global path"
fi

echo ""
echo "✅ Done. $CMD_N commands + $SKILL_N skills are now global."
echo "   Restart Claude Code (or reload) so the / menu + skills pick them up."
