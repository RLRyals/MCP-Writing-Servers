# Claude Code Configuration

This directory contains Claude Code configuration and hooks for the MCP Writing Servers project.

## Files

### `settings.json`
Project-specific settings for Claude Code sessions including:
- MCP server configurations for all 10 writing servers
- Environment variables and development settings
- Quick start commands for database and servers
- Integration notes for MCP-Electron-App (FictionLab)

### `hooks/SessionStart.sh`
Automatic setup hook that runs when a new Claude Code session starts. This hook:

1. **Checks Node.js environment** - Verifies Node.js is installed
2. **Installs dependencies** - Runs `npm install` if needed or if package.json was updated
3. **Creates .env file** - Copies from .env.example if .env doesn't exist
4. **Sets up GitHub token** - Exports GITHUB_AUTH_TOKEN from environment to .env
5. **Checks database** - Verifies PostgreSQL connection and provides setup commands if needed
6. **Checks Docker** - Verifies Docker is available for database container
7. **Shows repository status** - Displays current git branch and uncommitted changes
8. **Provides quick reference** - Lists common commands for database, servers, and testing

## Usage

### For Claude Code Agents

When you start a session, the SessionStart hook will automatically run and display a comprehensive status report. Review the output for any warnings or errors that need attention.

### Manual Hook Execution

You can manually run the hook at any time:

```bash
./.claude/hooks/SessionStart.sh
```

### Environment Variables

The SessionStart hook will automatically use these environment variables if available:

- `GITHUB_AUTH_TOKEN` - Added to .env for GitHub API access
- Other variables can be added to `.env` file manually

## Integration with MCP-Electron-App

This repository is designed to be cloned into the MCP-Electron-App (FictionLab) project at:

```
MCP-Electron-App/
  └── servers/
      └── mcp-writing/  (this repository)
```

The hook is aware of this integration and provides appropriate setup guidance.

## Quick Commands

After the SessionStart hook runs, you'll see these quick reference commands:

**Database:**
```bash
docker-compose up -d postgres              # Start database
docker-compose exec postgres psql -U writer -d mcp_series -f /docker-entrypoint-initdb.d/init.sql  # Initialize
psql $DATABASE_URL                         # Connect to database
```

**Servers:**
```bash
npm start                                  # Start HTTP/SSE server
node src/stdio-server.js                   # Start stdio server
node mcp-stdio-adapter.js database-admin-server  # Start adapter
```

**Testing:**
```bash
npm test                                   # Run all tests
./test-stdio-adapter.sh                    # Test stdio adapter
```

## Customization

You can customize the hook behavior by editing `.claude/hooks/SessionStart.sh`. The hook is designed to be:

- **Non-blocking** - Warnings don't stop the session
- **Informative** - Provides clear status and next steps
- **Helpful** - Suggests commands to fix issues
- **Fast** - Runs quickly to not delay session start

## Troubleshooting

If the hook fails:

1. Check that the hook is executable: `chmod +x .claude/hooks/SessionStart.sh`
2. Review the error messages in the hook output
3. Run the hook manually to see detailed output
4. Check that required tools are installed (node, npm, git)

## Documentation

For more information about the MCP Writing Servers:

- [Architecture](../docs/ARCHITECTURE.md)
- [MCP-Electron Integration](../docs/MCP-ELECTRON-INTEGRATION.md)
- [API Reference](../docs/API-REFERENCE.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)
