#!/usr/bin/env bash
set -e

cd /root/GolfCardSync/python-strokes
source venv/bin/activate
exec uvicorn main:app --host 0.0.0.0 --port 8002
