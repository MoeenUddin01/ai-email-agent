#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting AI Email Agent..."
echo ""

# Start backend
echo "[1/2] Starting backend on http://localhost:8000 ..."
cd "$ROOT_DIR"
nohup uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/ai-email-agent-backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

sleep 2

# Start frontend
echo "[2/2] Starting frontend on http://localhost:3000 ..."
cd "$ROOT_DIR/frontend"
nohup npm run dev > /tmp/ai-email-agent-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "Both servers are starting up:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000  (API docs: http://localhost:8000/docs)"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/ai-email-agent-backend.log"
echo "  Frontend: tail -f /tmp/ai-email-agent-frontend.log"
echo ""
echo "To stop: kill $BACKEND_PID $FRONTEND_PID"
