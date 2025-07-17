#!/bin/bash

PORT=${1:-8000}

source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port $PORT

