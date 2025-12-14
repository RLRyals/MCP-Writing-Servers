# Workflow Export Tool - Complete Guide

**Tool:** `export_workflow_package`
**Purpose:** Export workflows for sharing, marketplace distribution, or backup

---

## Overview

The `export_workflow_package` tool creates a complete, portable workflow package that includes:
- ✅ Workflow definition (YAML or JSON)
- ✅ Manifest file for marketplace
- ✅ Auto-generated README with documentation
- ✅ List of required agents and skills
- ✅ Dependency information
- ✅ Installation instructions

---

## Usage

### From MCP Tool (Claude Desktop/TypingMind)

```javascript
{
  "tool": "export_workflow_package",
  "arguments": {
    "workflow_def_id": "12-phase-novel-pipeline",
    "version": "1.0.0",
    "include_agents": true,
    "include_skills": true,
    "export_format": "yaml",
    "output_path": "/path/to/export"
  }
}
```

### From Electron App

```typescript
import { MCPWorkflowClient } from './workflow/mcp-workflow-client';

const client = new MCPWorkflowClient();

const exportResult = await client.exportWorkflowPackage(
  '12-phase-novel-pipeline',
  {
    version: '1.0.0',
    includeAgents: true,
    includeSkills: true,
    exportFormat: 'yaml'
  }
);

console.log(exportResult.package);
// Save files to disk...
```

---

## Tool Parameters

### Required
- **`workflow_def_id`** (string) - ID of workflow to export

### Optional
- **`version`** (string) - Specific version (defaults to latest)
- **`include_agents`** (boolean) - Include agent list (default: `true`)
- **`include_skills`** (boolean) - Include skill list (default: `true`)
- **`export_format`** ('json' | 'yaml') - Format for workflow file (default: `'yaml'`)
- **`output_path`** (string) - Optional output directory path

---

## Export Package Structure

The tool returns a complete package with this structure:

```json
{
  "success": true,
  "workflow_id": "12-phase-novel-pipeline",
  "version": "1.0.0",
  "format": "yaml",
  "package": {
    "workflow": {
      "id": "12-phase-novel-pipeline",
      "name": "12-Phase Novel Writing Pipeline",
      "version": "1.0.0",
      "description": "...",
      "tags": ["writing", "novel", "fiction"],
      "marketplace_metadata": { ... },
      "graph": { "nodes": [...], "edges": [...] },
      "dependencies": {
        "agents": ["brainstorming-agent", ...],
        "skills": ["series-planning-skill", ...],
        "mcpServers": ["workflow-manager", ...]
      },
      "phases": [ ... ]
    },
    "agents": [
      { "name": "brainstorming-agent", "filename": "brainstorming-agent.md" },
      ...
    ],
    "skills": [
      { "name": "series-planning-skill", "filename": "series-planning-skill.md" },
      ...
    ],
    "mcpServers": ["workflow-manager", "author-server", ...],
    "readme": "# Workflow Name\n...",
    "manifest": {
      "id": "12-phase-novel-pipeline",
      "name": "12-Phase Novel Writing Pipeline",
      "version": "1.0.0",
      "author": "FictionLab",
      "category": "Novel Writing",
      "difficulty": "Intermediate",
      "phase_count": 13,
      "requires": { ... }
    }
  },
  "instructions": {
    "structure": [...],
    "next_steps": [...]
  }
}
```

---

## Creating a Shareable Package

### Step 1: Export the Workflow

```typescript
const result = await client.exportWorkflowPackage('my-workflow');
const pkg = result.package;
```

### Step 2: Create Folder Structure

```
/my-workflow/
├── workflow.yaml          # pkg.workflow
├── manifest.json          # pkg.manifest
├── README.md              # pkg.readme
├── agents/
│   ├── agent-1.md
│   └── agent-2.md
└── skills/
    ├── skill-1.md
    └── skill-2.md
```

### Step 3: Save Files

```typescript
import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';

const baseDir = `/path/to/${pkg.workflow.id}`;
await fs.ensureDir(baseDir);

// Save workflow definition
const workflowFile = result.format === 'yaml'
  ? yaml.dump(pkg.workflow)
  : JSON.stringify(pkg.workflow, null, 2);

await fs.writeFile(
  path.join(baseDir, `workflow.${result.format}`),
  workflowFile
);

// Save manifest
await fs.writeFile(
  path.join(baseDir, 'manifest.json'),
  JSON.stringify(pkg.manifest, null, 2)
);

// Save README
await fs.writeFile(
  path.join(baseDir, 'README.md'),
  pkg.readme
);

// Copy agent files
await fs.ensureDir(path.join(baseDir, 'agents'));
for (const agent of pkg.agents) {
  const sourcePath = path.join(userDataPath, 'agents', agent.filename);
  const destPath = path.join(baseDir, 'agents', agent.filename);
  if (await fs.pathExists(sourcePath)) {
    await fs.copy(sourcePath, destPath);
  }
}

// Copy skill files
await fs.ensureDir(path.join(baseDir, 'skills'));
for (const skill of pkg.skills) {
  const sourcePath = path.join(homeDir, '.claude', 'skills', skill.filename);
  const destPath = path.join(baseDir, 'skills', skill.filename);
  if (await fs.pathExists(sourcePath)) {
    await fs.copy(sourcePath, destPath);
  }
}
```

### Step 4: Zip for Distribution

```bash
zip -r my-workflow.zip my-workflow/
```

---

## Example: Export 12-Phase Workflow

```typescript
const result = await client.exportWorkflowPackage('12-phase-novel-pipeline');

console.log(result.message);
// "Workflow package exported successfully"

console.log(result.package.manifest);
// {
//   "id": "12-phase-novel-pipeline",
//   "name": "12-Phase Novel Writing Pipeline",
//   "version": "1.0.0",
//   "author": "FictionLab",
//   "category": "Novel Writing",
//   "difficulty": "Intermediate",
//   "tags": ["writing", "novel", "fiction", "series"],
//   "phase_count": 13,
//   "requires": {
//     "agents": [
//       "brainstorming-agent",
//       "market-research-agent",
//       "series-architect-agent",
//       "npe-series-validator-agent",
//       "commercial-validator-agent",
//       "miranda-showrunner",
//       "bailey-first-drafter"
//     ],
//     "skills": [
//       "market-driven-planning-skill",
//       "series-planning-skill",
//       "book-planning-skill",
//       "chapter-planning-skill",
//       "scene-writing-skill"
//     ],
//     "mcpServers": [
//       "workflow-manager",
//       "author-server",
//       "series-planning-server",
//       "character-planning-server",
//       "core-continuity-server"
//     ]
//   }
// }
```

---

## Auto-Generated README

The export tool automatically generates a comprehensive README:

```markdown
# 12-Phase Novel Writing Pipeline

**Version:** 1.0.0
**Author:** FictionLab
**Category:** Novel Writing
**Difficulty:** Intermediate

## Description

Complete workflow from concept to published 5-book series with quality gates

## Workflow Overview

This workflow consists of **13 phases**:

1. **Premise Development**
   - Type: planning
   - Agent: brainstorming-agent

2. **Genre Pack Management**
   - Type: planning
   - Agent: market-research-agent
   - Skill: market-driven-planning-skill

3. **Market Research**
   - Type: planning
   - Agent: market-research-agent

4. **Series Architect** 🔄 (Sub-Workflow)
   - Type: subworkflow
   - Agent: series-architect-agent
   - Skill: series-planning-skill

5. **NPE Validation** 🚪 (Quality Gate)
   - Type: gate
   - Agent: npe-series-validator-agent
   - Condition: Score >= 80 to PASS

... (continues for all 13 phases)

## Dependencies

### Agents Required (7)
- brainstorming-agent
- market-research-agent
- series-architect-agent
- npe-series-validator-agent
- commercial-validator-agent
- miranda-showrunner
- bailey-first-drafter

### Skills Required (5)
- market-driven-planning-skill
- series-planning-skill
- book-planning-skill
- chapter-planning-skill
- scene-writing-skill

### MCP Servers Required (5)
- workflow-manager
- author-server
- series-planning-server
- character-planning-server
- core-continuity-server

## Installation

1. Import this workflow using FictionLab's workflow importer
2. The importer will automatically install:
   - Agent definitions to your agents directory
   - Skills to your ~/.claude/skills directory
   - Required MCP servers (if not already installed)

## Usage

1. Open FictionLab
2. Navigate to Workflows
3. Select "12-Phase Novel Writing Pipeline"
4. Click "Start Workflow"
5. Follow the phase-by-phase execution

## Tags

`writing`, `novel`, `fiction`, `series`

## Support

For issues or questions about this workflow, please contact FictionLab.

---

*Exported from FictionLab Workflow Manager*
*Export Date: 2025-12-14T...*
```

---

## Marketplace Integration

The exported package is ready for marketplace distribution:

### manifest.json Fields

```json
{
  "id": "workflow-id",
  "name": "Display Name",
  "version": "1.0.0",
  "description": "Brief description",
  "author": "Author Name",
  "category": "Category",
  "difficulty": "Beginner|Intermediate|Advanced",
  "tags": ["tag1", "tag2"],
  "phase_count": 10,
  "requires": {
    "agents": [...],
    "skills": [...],
    "mcpServers": [...]
  },
  "exported_at": "2025-12-14T..."
}
```

---

## Use Cases

### 1. Share with Team
Export workflow and share via Git/Dropbox:
```bash
# Export
workflow:export_workflow_package { workflow_def_id: "team-workflow" }

# Zip
zip -r team-workflow.zip team-workflow/

# Share
git add team-workflow.zip
git commit -m "Add team workflow package"
git push
```

### 2. Marketplace Submission
```typescript
// Export with marketplace metadata
const result = await client.exportWorkflowPackage('my-workflow', {
  exportFormat: 'yaml',
  includeAgents: true,
  includeSkills: true
});

// Package includes manifest.json ready for marketplace
```

### 3. Backup Workflows
```typescript
// Export all workflows for backup
const workflows = await client.getWorkflowDefinitions();

for (const wf of workflows) {
  await client.exportWorkflowPackage(wf.id, {
    outputPath: `/backups/${wf.id}`
  });
}
```

### 4. Version Migration
```typescript
// Export specific version
await client.exportWorkflowPackage('workflow-id', {
  version: '2.0.0',
  exportFormat: 'json'
});
```

---

## Importing Exported Workflows

The exported package can be imported using the `folder-importer`:

```typescript
import { FolderImporter } from './workflow/folder-importer';

const importer = new FolderImporter();
const result = await importer.importFromFolder('/path/to/workflow-folder');

// Automatically:
// 1. Parses workflow.yaml
// 2. Checks dependencies
// 3. Installs missing agents/skills
// 4. Imports to database
```

---

## Best Practices

### ✅ Do
- Export workflows before major changes (backup)
- Include agents and skills for complete packages
- Use YAML format for human readability
- Update marketplace_metadata before exporting
- Test import on fresh install

### ❌ Don't
- Export with sensitive data in metadata
- Hardcode file paths in workflow definitions
- Export system workflows without permission
- Forget to update version numbers
- Skip testing exported packages

---

## Troubleshooting

### Missing Dependencies
If export shows missing agents/skills:
```typescript
// Check what's installed
const deps = await dependencyResolver.checkDependencies(workflow.dependencies);

console.log('Missing agents:', deps.agents.missing);
console.log('Missing skills:', deps.skills.missing);
```

### Large Export Packages
For workflows with many dependencies:
```typescript
// Exclude agents/skills to reduce size
await client.exportWorkflowPackage('workflow-id', {
  includeAgents: false,
  includeSkills: false
});
```

### Format Issues
If YAML export has issues:
```typescript
// Use JSON instead
await client.exportWorkflowPackage('workflow-id', {
  exportFormat: 'json'
});
```

---

## Complete Example: Full Export Pipeline

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import archiver from 'archiver';

async function exportWorkflowPackage(workflowId: string, outputDir: string) {
  const client = new MCPWorkflowClient();

  // 1. Export workflow
  const result = await client.exportWorkflowPackage(workflowId, {
    includeAgents: true,
    includeSkills: true,
    exportFormat: 'yaml'
  });

  if (!result.success) {
    throw new Error(`Export failed: ${result.message}`);
  }

  const pkg = result.package;
  const workflowDir = path.join(outputDir, workflowId);

  // 2. Create directory structure
  await fs.ensureDir(workflowDir);
  await fs.ensureDir(path.join(workflowDir, 'agents'));
  await fs.ensureDir(path.join(workflowDir, 'skills'));

  // 3. Save workflow definition
  await fs.writeFile(
    path.join(workflowDir, 'workflow.yaml'),
    yaml.dump(pkg.workflow)
  );

  // 4. Save manifest
  await fs.writeFile(
    path.join(workflowDir, 'manifest.json'),
    JSON.stringify(pkg.manifest, null, 2)
  );

  // 5. Save README
  await fs.writeFile(
    path.join(workflowDir, 'README.md'),
    pkg.readme
  );

  // 6. Copy agent files
  const userDataPath = app.getPath('userData');
  for (const agent of pkg.agents) {
    const sourcePath = path.join(userDataPath, 'agents', agent.filename);
    const destPath = path.join(workflowDir, 'agents', agent.filename);

    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, destPath);
      console.log(`✓ Copied agent: ${agent.name}`);
    } else {
      console.warn(`⚠ Agent not found: ${agent.name}`);
    }
  }

  // 7. Copy skill files
  const homeDir = require('os').homedir();
  for (const skill of pkg.skills) {
    const sourcePath = path.join(homeDir, '.claude', 'skills', skill.filename);
    const destPath = path.join(workflowDir, 'skills', skill.filename);

    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, destPath);
      console.log(`✓ Copied skill: ${skill.name}`);
    } else {
      console.warn(`⚠ Skill not found: ${skill.name}`);
    }
  }

  // 8. Create ZIP archive
  const zipPath = path.join(outputDir, `${workflowId}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory(workflowDir, workflowId);
  await archive.finalize();

  console.log(`✅ Workflow exported: ${zipPath}`);

  return {
    workflowDir,
    zipPath,
    manifest: pkg.manifest
  };
}

// Usage
exportWorkflowPackage('12-phase-novel-pipeline', '/path/to/exports');
```

---

## Summary

The `export_workflow_package` tool provides:
- ✅ Complete workflow packages ready for distribution
- ✅ Auto-generated documentation
- ✅ Marketplace-ready manifest
- ✅ Dependency tracking
- ✅ Easy import/export workflow

Perfect for sharing workflows, marketplace submissions, backups, and team collaboration!
