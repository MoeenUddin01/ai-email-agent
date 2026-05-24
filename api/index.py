"""Vercel serverless entry point for the FastAPI backend."""
import sys
from pathlib import Path

# Ensure the project root is on the Python path
_root = str(Path(__file__).resolve().parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from src.api.main import app

# Vercel expects a variable named 'app' for ASGI
