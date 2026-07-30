#!/bin/bash
set -e

echo "🚀 Step 1: Building Vison CLI..."
cd vison-core && cargo build --quiet
cd ..

echo "🔍 Step 2: Validating example.vison.json..."
./vison-core/target/debug/vison example.vison.json

echo "🌐 Step 3: Launching Preview in Browser..."
# We just spin up a simple python server here to work around the fetch
# cross-origin issue. If python isn't available, you can also try
# google-chrome --allow-file-access-from-files directly.
python3 -m http.server 8080 > /dev/null 2>&1 &
SERVER_PID=$!

echo "Previewing at http://localhost:8080/playground.html"
# Automatically open the browser
if command -v xdg-open > /dev/null; then
    xdg-open "http://localhost:8080/playground.html"
elif command -v open > /dev/null; then
    open "http://localhost:8080/playground.html"
fi

echo "Press Ctrl+C to stop the server."
wait $SERVER_PID
