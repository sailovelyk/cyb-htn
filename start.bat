@echo off
echo Starting AegisLog AI Backend...
start cmd /k "cd backend && python -m uvicorn app.main:app --reload --port 8000"

echo Starting AegisLog AI Frontend...
start cmd /k "cd frontend && npm run dev"

echo Both services are starting!
echo Frontend will be available at http://localhost:3000
echo Backend API will be available at http://localhost:8000
