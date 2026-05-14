#!/usr/bin/env bash
set -e

echo "=== Starting AI Email Agent ==="

# Start backend
echo "Starting backend..."
cd /home/moeen/projects/ai-email-agent
nohup .venv/bin/uvicorn src.api.main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend
sleep 3
if curl -s -o /dev/null -w "" --max-time 3 http://localhost:8000/ping 2>/dev/null; then
    echo "  Backend: OK (http://localhost:8000)"
else
    echo "  Backend: failed to start"
    exit 1
fi

# Start frontend
echo "Starting frontend..."
cd /home/moeen/projects/ai-email-agent/frontend
nohup npx next dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

# Wait for frontend
sleep 8
if curl -s -o /dev/null -w "" --max-time 5 http://localhost:3000 2>/dev/null; then
    echo "  Frontend: OK (http://localhost:3000)"
else
    echo "  Frontend: still compiling, check /tmp/frontend.log"
fi

echo ""
echo "=== All running ==="
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo ""
echo "To stop: fuser -k 3000/tcp 8000/tcp"
