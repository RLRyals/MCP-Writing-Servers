#!/bin/bash
# test-stdio-adapter.sh
# Test script for mcp-stdio-adapter.js
# Prerequisites: MCP servers must be running (npm run start:orchestrator)

echo "Testing MCP Stdio Adapter"
echo "=========================="
echo ""

# Check if servers are running
echo "Checking if MCP servers are running..."
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ Error: MCP servers are not running"
    echo "Please start the servers first with: npm run start:orchestrator"
    exit 1
fi
echo "✓ Servers are running"
echo ""

# Test 1: Initialize
echo "Test 1: Initialize request"
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node mcp-stdio-adapter.js &
ADAPTER_PID=$!
sleep 2
kill $ADAPTER_PID 2>/dev/null
echo ""

# Test 2: List tools (with running adapter)
echo "Test 2: List tools request"
(
    sleep 0.5
    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
    sleep 1
    echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
    sleep 2
    kill $ADAPTER_PID 2>/dev/null
) | node mcp-stdio-adapter.js 2>/dev/null | head -20
echo ""

echo "=========================="
echo "Basic tests complete!"
echo ""
echo "For interactive testing:"
echo "1. Start the orchestrator: npm run start:orchestrator"
echo "2. In another terminal, run: node mcp-stdio-adapter.js"
echo "3. Type JSON-RPC messages and press Enter"
echo ""
echo "Example messages:"
echo '  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
echo '  {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
echo ""
