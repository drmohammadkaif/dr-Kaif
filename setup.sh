#!/usr/bin/env bash
# One-command helper for GitHub Codespaces.
# Usage:  bash setup.sh dr-kaif.zip
# It unzips the app into this repo, then saves and pushes it to GitHub.
set -e
ZIP="${1:-dr-kaif.zip}"
if [ -f "$ZIP" ]; then
  unzip -o "$ZIP"
  rm -f "$ZIP"
fi
git add -A
git commit -m "Dr. Kaif app" || echo "Nothing new to save."
git push
echo ""
echo "Done. Now connect this repository to Cloudflare Workers (see README.md, Step 5)."
