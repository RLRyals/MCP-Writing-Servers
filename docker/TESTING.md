# Testing Guide for Config Mode

## Overview

This document describes the testing procedures for the mcp-config.json support feature.

## Test Environment Setup

### Prerequisites
- Docker and Docker Compose installed
- `.env` file configured with required variables:
  - `POSTGRES_PASSWORD`
  - `MCP_AUTH_TOKEN`

---

## Test Suite

### Test 1: Config File Validation ✅

**Purpose:** Verify mcp-config.json is valid JSON

**Steps:**
```bash
cd /home/user/MCP-Writing-Servers/docker
cat mcp-config.json | python3 -m json.tool
```

**Expected Result:**
- No JSON syntax errors
- File contains 8 server definitions
- All URLs follow pattern: `http://localhost:3000/<server-name>`

**Status:** ✅ PASSED

---

### Test 2: Bash Script Syntax ✅

**Purpose:** Verify entrypoint script has valid bash syntax

**Steps:**
```bash
bash -n /home/user/MCP-Writing-Servers/docker/connector-config-entrypoint.sh
```

**Expected Result:**
- No syntax errors reported
- Script is executable (`chmod +x` applied)

**Status:** ✅ PASSED

---

### Test 3: Docker Compose Validation ✅

**Purpose:** Verify docker-compose file has valid YAML syntax

**Steps:**
```bash
cd /home/user/MCP-Writing-Servers/docker
python3 -c "import yaml; yaml.safe_load(open('docker-compose.connector-config.yml'))"
```

**Expected Result:**
- No YAML syntax errors
- Valid service definitions
- Proper volume mounts
- Correct network configuration

**Status:** ✅ PASSED

---

### Test 4: With Config File (Manual Test)

**Purpose:** Verify system works with mcp-config.json present

**Steps:**
```bash
cd /home/user/MCP-Writing-Servers/docker

# Ensure config file exists
ls -la mcp-config.json

# Start services
docker-compose -f docker-compose.connector-config.yml up -d

# Watch logs
docker logs mcp-writing-system -f
```

**Expected Log Output:**
```
✅ Found mcp-config.json
   Reading server configurations from file...
✅ Config file is valid JSON
   Servers defined: 8

🚀 Starting MCP Connector...
   Config Mode: ENABLED (using mcp-config.json)

ℹ️  Servers will be auto-discovered from config file
```

**Verification Tests:**
```bash
# Test HTTP/SSE server
docker exec mcp-writing-system curl http://localhost:3000/health

# Test connector
curl http://localhost:50880/health

# Verify config mounted
docker exec mcp-writing-system cat /app/mcp-config.json

# Check all servers available
docker exec mcp-writing-system curl http://localhost:3000/
```

**Expected Results:**
- ✅ Container starts successfully
- ✅ Config file detected and loaded
- ✅ 8 servers listed in HTTP/SSE response
- ✅ Connector accepts connections
- ✅ Config file accessible inside container

**Status:** 🔄 REQUIRES DOCKER (validated via code review)

---

### Test 5: Fallback Mode - Missing Config (Manual Test)

**Purpose:** Verify graceful fallback when config file is missing

**Steps:**
```bash
cd /home/user/MCP-Writing-Servers/docker

# Rename config file to simulate missing
mv mcp-config.json mcp-config.json.backup

# Start services
docker-compose -f docker-compose.connector-config.yml up -d

# Watch logs
docker logs mcp-writing-system -f
```

**Expected Log Output:**
```
ℹ️  No mcp-config.json found at /app/mcp-config.json
   Running in default mode (servers configured via TypingMind UI)

🚀 Starting MCP Connector...
   Config Mode: DISABLED (manual configuration)

ℹ️  Configure servers in TypingMind UI with URLs like:
   http://localhost:3000/book-planning
   http://localhost:3000/series-planning
   etc.
```

**Verification Tests:**
```bash
# Verify container still runs
docker ps | grep mcp-writing-system

# Test endpoints still work
docker exec mcp-writing-system curl http://localhost:3000/health
curl http://localhost:50880/health
```

**Expected Results:**
- ✅ Container starts successfully
- ✅ Fallback message displayed
- ✅ Connector runs in manual mode
- ✅ HTTP/SSE server still accessible
- ✅ All functionality preserved

**Cleanup:**
```bash
# Restore config file
mv mcp-config.json.backup mcp-config.json
docker-compose -f docker-compose.connector-config.yml restart mcp-writing-system
```

**Status:** 🔄 REQUIRES DOCKER (validated via code review)

---

### Test 6: Fallback Mode - Invalid JSON (Manual Test)

**Purpose:** Verify graceful fallback when config file has invalid JSON

**Steps:**
```bash
cd /home/user/MCP-Writing-Servers/docker

# Backup good config
cp mcp-config.json mcp-config.json.backup

# Create invalid JSON
echo '{ invalid json }' > mcp-config.json

# Start services
docker-compose -f docker-compose.connector-config.yml up -d

# Watch logs
docker logs mcp-writing-system -f
```

**Expected Log Output:**
```
✅ Found mcp-config.json
   Reading server configurations from file...
⚠️  Config file contains invalid JSON
   Falling back to default mode

🚀 Starting MCP Connector...
   Config Mode: DISABLED (manual configuration)
```

**Expected Results:**
- ✅ Container starts successfully
- ✅ Invalid JSON detected
- ✅ Fallback to manual mode
- ✅ No crash or exit
- ✅ System remains functional

**Cleanup:**
```bash
# Restore valid config
mv mcp-config.json.backup mcp-config.json
docker-compose -f docker-compose.connector-config.yml restart mcp-writing-system
```

**Status:** 🔄 REQUIRES DOCKER (validated via code review)

---

### Test 7: Backward Compatibility (Manual Test)

**Purpose:** Verify existing setup still works unchanged

**Steps:**
```bash
cd /home/user/MCP-Writing-Servers/docker

# Start old compose file
docker-compose -f docker-compose.connector-http-sse.yml up -d

# Verify it still works
docker logs mcp-writing-system -f
```

**Expected Results:**
- ✅ Old compose file works unchanged
- ✅ No config file required
- ✅ Existing functionality preserved
- ✅ No breaking changes

**Status:** 🔄 REQUIRES DOCKER (validated via code review)

---

### Test 8: Custom Config Location (Manual Test)

**Purpose:** Verify MCP_CONFIG_FILE_PATH environment variable works

**Steps:**
```bash
cd /home/user/MCP-Writing-Servers/docker

# Copy config to custom location
cp mcp-config.json /tmp/custom-config.json

# Set custom path
export MCP_CONFIG_FILE_PATH=/tmp/custom-config.json

# Start services
docker-compose -f docker-compose.connector-config.yml up -d

# Verify custom config loaded
docker exec mcp-writing-system cat /app/mcp-config.json
```

**Expected Results:**
- ✅ Custom config path honored
- ✅ Config loaded from custom location
- ✅ System works normally

**Status:** 🔄 REQUIRES DOCKER (validated via code review)

---

### Test 9: TypingMind Integration (Manual Test)

**Purpose:** Verify TypingMind can connect and use servers

**Steps:**
1. Start services with config file
2. Open TypingMind in browser
3. Go to Settings → Advanced Settings → Model Context Protocol
4. Add connector: `http://localhost:50880`
5. Enter auth token from `.env`
6. Click "Connect"
7. Check Plugins tab

**Expected Results:**
- ✅ Connection succeeds
- ✅ Servers appear (auto-discovered or manual)
- ✅ Tools are callable
- ✅ Database operations work

**Status:** 🔄 REQUIRES TYPINGMIND (end-to-end test)

---

## Test Summary

| Test | Type | Status | Notes |
|------|------|--------|-------|
| Config File Validation | Static | ✅ PASSED | JSON syntax valid |
| Bash Script Syntax | Static | ✅ PASSED | No syntax errors |
| Docker Compose Validation | Static | ✅ PASSED | YAML valid |
| With Config File | Runtime | 🔄 PENDING | Requires Docker |
| Missing Config Fallback | Runtime | 🔄 PENDING | Requires Docker |
| Invalid JSON Fallback | Runtime | 🔄 PENDING | Requires Docker |
| Backward Compatibility | Runtime | 🔄 PENDING | Requires Docker |
| Custom Config Location | Runtime | 🔄 PENDING | Requires Docker |
| TypingMind Integration | E2E | 🔄 PENDING | Requires TypingMind |

---

## Code Review Validation

The following have been validated through code review:

### Entrypoint Script Logic
- ✅ PostgreSQL wait logic (30 retries with 2s intervals)
- ✅ HTTP/SSE server startup with PID tracking
- ✅ Config file existence check (`-f` test)
- ✅ JSON validation using Node.js
- ✅ Conditional connector launch with/without --config
- ✅ Graceful error handling
- ✅ Clear logging and diagnostics

### Docker Configuration
- ✅ Volume mount with `:ro` (read-only)
- ✅ Environment variable defaults
- ✅ Health check configuration
- ✅ Network and dependency setup
- ✅ Service restart policies

### Fallback Behavior
- ✅ No crashes on missing config
- ✅ No crashes on invalid JSON
- ✅ Clear user messaging
- ✅ Full functionality in fallback mode

---

## Testing Checklist for PR

Before submitting PR, verify:

- [x] All static tests pass
- [x] Code syntax is valid
- [x] Files have correct permissions
- [x] Documentation is complete
- [ ] Runtime tests with Docker (requires Docker environment)
- [ ] TypingMind integration test (requires TypingMind instance)

---

## Running Tests Locally

```bash
# Clone repository
git clone https://github.com/RLRyals/MCP-Writing-Servers.git
cd MCP-Writing-Servers
git checkout feature/mcp-config-file-support

# Run static tests
cd docker
cat mcp-config.json | python3 -m json.tool
bash -n connector-config-entrypoint.sh
python3 -c "import yaml; yaml.safe_load(open('docker-compose.connector-config.yml'))"

# Setup .env
cp ../.env.example .env
nano .env  # Add POSTGRES_PASSWORD and MCP_AUTH_TOKEN

# Run runtime tests
docker-compose -f docker-compose.connector-config.yml up -d
docker logs mcp-writing-system -f

# Test endpoints
docker exec mcp-writing-system curl http://localhost:3000/health
curl http://localhost:50880/health

# Test TypingMind integration (manual)
# Open browser, connect TypingMind to http://localhost:50880
```

---

## Known Limitations

1. **Auto-discovery:** Whether TypingMind auto-discovers servers from config file depends on connector implementation. May require manual configuration.

2. **URL Access:** URLs in config use `localhost:3000` which works inside Docker. For remote TypingMind, may need Docker networking adjustments.

3. **Config Changes:** Require container restart to take effect.

---

## Future Test Ideas

- Automated integration tests using Docker Compose
- CI/CD pipeline with GitHub Actions
- Mock TypingMind client for automated testing
- Performance testing with concurrent connections
- Security testing (auth token validation, etc.)

---

**Last Updated:** 2025-11-12
**Test Suite Version:** 1.0.0
**Branch:** feature/mcp-config-file-support
