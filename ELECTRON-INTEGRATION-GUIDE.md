# Electron App Integration Guide

This guide explains how to properly integrate the MCP Writing Servers repository with your Electron installer app.

## The Problem

The Electron installer was trying to pull Docker images from Docker Hub, resulting in this error:

```
pull access denied for mcp-servers, repository does not exist or may require 'docker login'
```

This happens because the `mcp-servers` image doesn't exist on Docker Hub - it needs to be built from this repository's source code.

## The Solution

The Electron app needs to **clone this repository** and **build the Docker image from source**. Here's how:

---

## Correct Installation Flow

### Step 1: Clone the Repository

The Electron app should clone the full repository to the user's AppData directory:

**Windows:**
```javascript
const appDataPath = path.join(app.getPath('userData'), 'mcp-writing-system');
const repoUrl = 'https://github.com/RLRyals/MCP-Writing-Servers.git';

// Clone the repository
await execAsync(`git clone "${repoUrl}" "${appDataPath}"`, {
  timeout: 300000 // 5 minutes
});
```

This will create the following structure:
```
C:\Users\<User>\AppData\Roaming\mcp-electron-app\mcp-writing-system\
├── docker/
│   ├── docker-compose.core.yml
│   ├── docker-compose.mcp-connector.yml
│   ├── docker-compose.typing-mind.yml
│   ├── Dockerfile.mcp-connector
│   ├── init.sql
│   └── nginx.conf
├── src/
│   ├── mcps/
│   ├── shared/
│   └── ...
├── package.json
└── ...
```

**macOS/Linux:**
```javascript
const appDataPath = path.join(app.getPath('userData'), 'mcp-writing-system');
const repoUrl = 'https://github.com/RLRyals/MCP-Writing-Servers.git';

// Clone the repository
await execAsync(`git clone "${repoUrl}" "${appDataPath}"`, {
  timeout: 300000 // 5 minutes
});
```

### Step 2: Generate .env File

Create a `.env` file in the cloned repository root:

```javascript
const crypto = require('crypto');

async function generateEnvFile(repoPath) {
  const envContent = `# MCP Writing System Configuration
# Generated: ${new Date().toISOString()}

# Database
POSTGRES_DB=mcp_writing_db
POSTGRES_USER=writer
POSTGRES_PASSWORD=${crypto.randomBytes(32).toString('hex')}
POSTGRES_PORT=5432
POSTGRES_CONTAINER_NAME=mcp-writing-db
POSTGRES_VOLUME_NAME=mcp-writing-data

# Network
MCP_NETWORK_NAME=mcp-network

# MCP Connector (if using)
MCP_CONNECTOR_PORT=50880
MCP_CONNECTOR_CONTAINER_NAME=mcp-connector
MCP_AUTH_TOKEN=${crypto.randomBytes(32).toString('hex')}

# Typing Mind (if using)
TYPING_MIND_PORT=3000
TYPING_MIND_CONTAINER_NAME=typing-mind-web
TYPING_MIND_DIR=${path.join(repoPath, 'typing-mind-static')}
NGINX_CONF_PATH=${path.join(repoPath, 'docker', 'nginx.conf')}

# Node environment
NODE_ENV=production
INCLUDE_AUTHOR_SERVER=true
MCP_STDIO_MODE=true
`;

  const envPath = path.join(repoPath, '.env');
  await fs.promises.writeFile(envPath, envContent);
}
```

### Step 3: Run Docker Compose from the Correct Directory

**IMPORTANT:** Run docker-compose from the `docker/` subdirectory:

```javascript
async function startCoreSystem(repoPath) {
  const dockerDir = path.join(repoPath, 'docker');

  // Build and start containers
  // Using the .env file from parent directory
  await execAsync(
    'docker-compose --env-file ../.env -f docker-compose.core.yml up -d --build',
    {
      cwd: dockerDir,
      timeout: 600000 // 10 minutes for first build
    }
  );
}
```

### Step 4: Wait for Services to be Healthy

```javascript
async function waitForServicesHealthy(repoPath, maxAttempts = 60) {
  const dockerDir = path.join(repoPath, 'docker');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await execAsync(
        'docker-compose -f docker-compose.core.yml ps --format json',
        { cwd: dockerDir }
      );

      const services = JSON.parse(`[${result.stdout.trim().replace(/}\s*{/g, '},{')}]`);
      const allHealthy = services.every(s =>
        s.Health === 'healthy' || s.State === 'running'
      );

      if (allHealthy) {
        return true;
      }
    } catch (error) {
      console.log(`Waiting for services... (${i + 1}/${maxAttempts})`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Services failed to start');
}
```

---

## Complete Installation Function

Here's a complete example:

```javascript
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const crypto = require('crypto');

async function installMCPWritingSystem(app) {
  const appDataPath = path.join(app.getPath('userData'), 'mcp-writing-system');
  const repoUrl = 'https://github.com/RLRyals/MCP-Writing-Servers.git';

  try {
    // Step 1: Check if already installed
    const exists = await fs.access(appDataPath).then(() => true).catch(() => false);

    if (exists) {
      console.log('MCP Writing System already installed. Updating...');
      // Pull latest changes
      await execAsync('git pull', { cwd: appDataPath });
    } else {
      console.log('Installing MCP Writing System...');
      // Clone repository
      await execAsync(`git clone "${repoUrl}" "${appDataPath}"`, {
        timeout: 300000
      });
    }

    // Step 2: Generate .env file
    console.log('Generating configuration...');
    await generateEnvFile(appDataPath);

    // Step 3: Build and start Docker containers
    console.log('Building Docker images (this may take a few minutes)...');
    const dockerDir = path.join(appDataPath, 'docker');

    await execAsync(
      'docker-compose --env-file ../.env -f docker-compose.core.yml up -d --build',
      {
        cwd: dockerDir,
        timeout: 600000
      }
    );

    // Step 4: Wait for services
    console.log('Waiting for services to be ready...');
    await waitForServicesHealthy(appDataPath);

    console.log('MCP Writing System installed successfully!');
    return { success: true };

  } catch (error) {
    console.error('Installation failed:', error);
    return { success: false, error: error.message };
  }
}

async function generateEnvFile(repoPath) {
  const envContent = `# MCP Writing System Configuration
# Generated: ${new Date().toISOString()}

# Database
POSTGRES_DB=mcp_writing_db
POSTGRES_USER=writer
POSTGRES_PASSWORD=${crypto.randomBytes(32).toString('hex')}
POSTGRES_PORT=5432
POSTGRES_CONTAINER_NAME=mcp-writing-db
POSTGRES_VOLUME_NAME=mcp-writing-data

# Network
MCP_NETWORK_NAME=mcp-network

# Node environment
NODE_ENV=production
INCLUDE_AUTHOR_SERVER=true
MCP_STDIO_MODE=true
`;

  await fs.writeFile(path.join(repoPath, '.env'), envContent);
}

async function waitForServicesHealthy(repoPath, maxAttempts = 60) {
  const dockerDir = path.join(repoPath, 'docker');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execAsync(
        'docker-compose -f docker-compose.core.yml ps',
        { cwd: dockerDir }
      );

      // Check if services are running
      if (stdout.includes('Up') && stdout.includes('healthy')) {
        return true;
      }
    } catch (error) {
      console.log(`Waiting... (${i + 1}/${maxAttempts})`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Services failed to start');
}
```

---

## Adding Optional Clients

### Installing Typing Mind Client

```javascript
async function installTypingMindClient(repoPath) {
  const dockerDir = path.join(repoPath, 'docker');

  // Download Typing Mind files (if not already present)
  const typingMindDir = path.join(repoPath, 'typing-mind-static');
  const exists = await fs.access(typingMindDir).then(() => true).catch(() => false);

  if (!exists) {
    console.log('Downloading Typing Mind...');
    const tmpDir = path.join(app.getPath('temp'), 'typingmind-download');

    // Clone Typing Mind repository
    await execAsync(
      `git clone --depth 1 https://github.com/TypingMind/typingmind.git "${tmpDir}"`,
      { timeout: 180000 }
    );

    // Copy the src folder to typing-mind-static
    const srcDir = path.join(tmpDir, 'src');
    await fs.cp(srcDir, typingMindDir, { recursive: true });

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  // Start MCP Connector and Typing Mind
  await execAsync(
    'docker-compose --env-file ../.env -f docker-compose.mcp-connector.yml up -d',
    { cwd: dockerDir }
  );

  await execAsync(
    'docker-compose --env-file ../.env -f docker-compose.typing-mind.yml up -d',
    { cwd: dockerDir }
  );

  console.log('Typing Mind available at http://localhost:3000');
}
```

---

## Updating the System

```javascript
async function updateMCPWritingSystem(repoPath) {
  const dockerDir = path.join(repoPath, 'docker');

  try {
    console.log('Updating MCP Writing System...');

    // Pull latest code
    await execAsync('git pull', { cwd: repoPath });

    // Rebuild and restart containers
    await execAsync(
      'docker-compose --env-file ../.env -f docker-compose.core.yml up -d --build',
      {
        cwd: dockerDir,
        timeout: 600000
      }
    );

    console.log('Update complete!');
    return { success: true };

  } catch (error) {
    console.error('Update failed:', error);
    return { success: false, error: error.message };
  }
}
```

---

## Troubleshooting

### Error: "context" directory not found

**Problem:** The build context `..` can't find the source code.

**Solution:** Make sure you're running docker-compose from the `docker/` subdirectory:
```javascript
// Correct
execAsync('docker-compose up', { cwd: path.join(repoPath, 'docker') });

// Wrong
execAsync('docker-compose -f docker/docker-compose.core.yml up', { cwd: repoPath });
```

### Error: "pull access denied for mcp-servers"

**Problem:** Docker Compose is trying to pull the image instead of building it.

**Solution:** This should be fixed now with `pull_policy: build` in docker-compose.core.yml. Make sure you have the latest version of the repository.

### Services fail to start

**Problem:** Database or MCP servers won't start.

**Solution:** Check logs:
```javascript
const { stdout } = await execAsync(
  'docker-compose -f docker-compose.core.yml logs',
  { cwd: dockerDir }
);
console.log(stdout);
```

---

## Directory Structure Reference

After installation, the structure should be:

```
AppData/Roaming/mcp-electron-app/mcp-writing-system/
├── .env                           # Generated by Electron app
├── .git/                          # Git repository data
├── docker/
│   ├── docker-compose.core.yml    # Core: DB + MCP servers
│   ├── docker-compose.mcp-connector.yml
│   ├── docker-compose.typing-mind.yml
│   ├── Dockerfile.mcp-connector
│   ├── init.sql
│   └── nginx.conf
├── src/
│   ├── mcps/                      # MCP server implementations
│   ├── shared/                    # Shared database/utilities
│   ├── stdio-server.js
│   └── http-server.js
├── typing-mind-static/            # Optional: Downloaded separately
│   └── ...
├── package.json
└── README.md
```

---

## Key Takeaways

✅ **DO:**
- Clone the full repository to preserve directory structure
- Run docker-compose from the `docker/` subdirectory
- Use `--build` flag to ensure images are built
- Generate unique passwords in the .env file

❌ **DON'T:**
- Copy individual files - clone the whole repo
- Try to pull images from Docker Hub - they need to be built
- Run docker-compose from the wrong directory
- Hardcode passwords or tokens

---

For more information, see:
- [ELECTRON-APP-REQUIREMENTS.md](ELECTRON-APP-REQUIREMENTS.md) - Prerequisites and user guidance
- [ELECTRON-DEPLOYMENT.md](ELECTRON-DEPLOYMENT.md) - Alternative deployment strategies
- [README.md](README.md) - General MCP Writing System documentation
