#!/bin/bash
# ============================================================
# Start the Regulatory Ledger locally — double-click this file.
# ============================================================
# A browser page cannot start a process on your machine; that is a
# security boundary, not an oversight, and no amount of app code gets
# around it. This is the next best thing: one file that starts both
# halves and tells you where to go.
#
# macOS: double-click it in Finder. (First time only, you may need to
#        run `chmod +x start-crawl-service.command` once.)
# Linux: ./start-crawl-service.command
# Windows: run the two commands at the bottom by hand, or use WSL.
#
# Stop everything with Ctrl-C in the window it opens.

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

echo "The Regulatory Ledger"
echo "====================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed, or isn't on PATH."
  echo "Install it from https://nodejs.org (18 or newer), then run this again."
  read -r -p "Press return to close."
  exit 1
fi

# The reviewer's dependencies live in server/agent and are optional — the
# service crawls without them. Install once, quietly, if they're missing.
if [ ! -d "$ROOT/server/agent/node_modules" ]; then
  echo "First run: installing the reviewer's dependencies (once only)…"
  (cd "$ROOT/server/agent" && npm install --silent) || {
    echo "  …that failed. Carrying on — crawling still works, page reading won't."
  }
  echo
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "No ANTHROPIC_API_KEY is set, so the service will crawl but not read."
  echo "To enable reading, close this and run:"
  echo "    export ANTHROPIC_API_KEY=sk-ant-...   &&   ./start-crawl-service.command"
  echo "or put the export line in your ~/.zshrc."
  echo
fi

# Stop both children when this window closes, rather than orphaning a
# server that then blocks the port next time.
cleanup(){ echo; echo "Stopping…"; kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

echo "Starting the crawl service on http://127.0.0.1:8787 …"
(cd "$ROOT/server" && node index.js) &

echo "Serving the app on http://localhost:8000 …"
(cd "$ROOT" && python3 -m http.server 8000 >/dev/null 2>&1) &

sleep 2
echo
echo "------------------------------------------------------------"
echo "  Open:  http://localhost:8000"
echo "  Stop:  Ctrl-C in this window"
echo "------------------------------------------------------------"
echo

command -v open >/dev/null 2>&1 && open "http://localhost:8000"

wait
