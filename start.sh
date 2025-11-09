#!/bin/bash
# start.sh for Railway deployment

# Load environment variables
export FLASK_APP=app.py
export FLASK_ENV=production
export PORT=${PORT:-5000}

# Run the Flask-SocketIO app using Python directly
python3 -u -m app