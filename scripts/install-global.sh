#!/usr/bin/env bash
# Installs this repo's Claude Code skills and slash commands into
# ~/.claude/ so they're available in every project, not just this repo.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${HOME}/.claude"

mkdir -p "$DEST/skills" "$DEST/commands"

skills_copied=0
for dir in "$REPO_DIR"/.claude/skills/*/; do
  name="$(basename "$dir")"
  cp -rf "$dir" "$DEST/skills/$name"
  skills_copied=$((skills_copied + 1))
done

commands_copied=0
for file in "$REPO_DIR"/.claude/commands/*.md; do
  cp -f "$file" "$DEST/commands/"
  commands_copied=$((commands_copied + 1))
done

echo "Installed $skills_copied skills to $DEST/skills"
echo "Installed $commands_copied commands to $DEST/commands"
echo "Available in every Claude Code chat now."
