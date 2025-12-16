# Testing Guide - Migration 028

Quick guide to verify Migration 028 and test the new workflow definition tools.

---

## Step 1: Verify Migration Ran Successfully

Run the verification script:

```bash
cd C:\github\MCP-Writing-Servers
node test-migration-028.js
```

**What this tests:**
- ✅ All 5 new tables created
- ✅ workflow_instances columns added
- ✅ workflow_phase_history columns added
- ✅ 12-phase workflow seeded
- ✅ All 13 phases present (0-12)
- ✅ Indexes created
- ✅ Views created (active_workflows, workflow_execution_summary)
- ✅ Existing workflow instances linked

**Expected output:**
```
🧪 Testing Migration 028 - Workflow Definitions

Test 1: Verifying tables exist...
✅ All 5 new tables created successfully
   - sub_workflow_executions
   - workflow_definitions
   - workflow_imports
   - workflow_version_locks
   - workflow_versions

Test 2: Verifying workflow_instances columns updated...
✅ workflow_instances table updated successfully
   - workflow_def_id
   - workflow_version
   - total_phases

Test 3: Verifying workflow_phase_history columns updated...
✅ workflow_phase_history table updated successfully
   - claude_code_session
   - skill_invoked
   - output_json

Test 4: Verifying 12-phase workflow seeded...
✅ 12-phase workflow seeded successfully
   - ID: 12-phase-novel-pipeline
   - Name: 12-Phase Novel Writing Pipeline
   - Version: 1.0.0
   - System workflow: true
   - Phase count: 13
   - Tags: writing, novel, fiction, series

Test 5: Showing 12-phase workflow details...
✅ Found 13 phases:
   Phase 0: Premise Development (planning) - brainstorming-agent
   Phase 1: Genre Pack Management (planning) - market-research-agent
   Phase 2: Market Research (planning) - market-research-agent
   Phase 3: Series Architect (subworkflow) - series-architect-agent
   Phase 4: NPE Validation (gate) - npe-series-validator-agent
   Phase 5: Commercial Validation (gate) - commercial-validator-agent
   Phase 6: Writing Team Review (writing) - miranda-showrunner
   Phase 7: User Approval (user) - User
   Phase 8: MCP Commit (user) - System
   Phase 9: Chapter Planning (writing) - miranda-showrunner
   Phase 10: Scene Validation (gate) - npe-scene-validator
   Phase 11: Writing Execution (writing) - bailey-first-drafter
   Phase 12: Book Production Loop (loop) - miranda-showrunner

[... more tests ...]

═══════════════════════════════════════════════════
MIGRATION 028 VERIFICATION COMPLETE
═══════════════════════════════════════════════════
✅ All tests passed!
```

---

## Step 2: Test All 11 New MCP Tools

**IMPORTANT:** The MCP server has been refactored. Check if `handlers/workflow-handlers.js` exists first.

Run the MCP tools test:

```bash
cd C:\github\MCP-Writing-Servers
node test-mcp-tools.js
```

**What this tests:**
1. ✅ `get_workflow_definitions` - List all workflows
2. ✅ `get_workflow_definition` - Get specific workflow by ID
3. ✅ `import_workflow_definition` - Import a test workflow
4. ✅ `create_workflow_version` - Create version 1.1.0
5. ✅ `get_workflow_versions` - Get version history
6. ✅ `lock_workflow_version` - Lock version during execution
7. ✅ `unlock_workflow_version` - Unlock after execution
8. ✅ `start_sub_workflow` - Start nested workflow
9. ✅ `get_sub_workflow_status` - Check sub-workflow progress
10. ✅ `complete_sub_workflow` - Mark sub-workflow complete
11. ✅ `update_phase_execution` - Track Claude Code session

**Expected output:**
```
🧪 Testing MCP Workflow Definition Tools

Starting Workflow Manager MCP Server...

✅ Server initialized

═══════════════════════════════════════════════════
TEST 1: get_workflow_definitions
═══════════════════════════════════════════════════
✅ Found 1 workflow definition(s):

   ID: 12-phase-novel-pipeline
   Name: 12-Phase Novel Writing Pipeline
   Version: 1.0.0
   System: true
   Tags: writing, novel, fiction, series
   Created: 2025-12-13T...

[... continues through all 11 tests ...]

═══════════════════════════════════════════════════
ALL TESTS PASSED! ✅
═══════════════════════════════════════════════════

Tested tools:
  1. ✅ get_workflow_definitions
  2. ✅ get_workflow_definition
  3. ✅ import_workflow_definition
  4. ✅ create_workflow_version
  5. ✅ get_workflow_versions
  6. ✅ lock_workflow_version
  7. ✅ unlock_workflow_version
  8. ✅ start_sub_workflow
  9. ✅ get_sub_workflow_status
 10. ✅ complete_sub_workflow
 11. ✅ update_phase_execution

All 11 new MCP tools are working correctly!
```

---

## Step 3: Manual Database Inspection (Optional)

If you want to inspect the database directly:

### Check workflow definitions table

```sql
SELECT id, name, version, is_system, tags
FROM workflow_definitions;
```

**Expected:**
```
id                        | name                              | version | is_system | tags
--------------------------|-----------------------------------|---------|-----------|-------------------------
12-phase-novel-pipeline   | 12-Phase Novel Writing Pipeline   | 1.0.0   | true      | {writing,novel,fiction,series}
```

### View all phases in 12-phase workflow

```sql
SELECT
    jsonb_array_elements(phases_json)->>'id' as phase_id,
    jsonb_array_elements(phases_json)->>'name' as phase_name,
    jsonb_array_elements(phases_json)->>'type' as phase_type
FROM workflow_definitions
WHERE id = '12-phase-novel-pipeline';
```

### Check dependencies

```sql
SELECT
    id,
    jsonb_array_length(dependencies_json->'agents') as agent_count,
    jsonb_array_length(dependencies_json->'skills') as skill_count,
    jsonb_array_length(dependencies_json->'mcpServers') as mcp_count
FROM workflow_definitions;
```

**Expected:**
```
id                        | agent_count | skill_count | mcp_count
--------------------------|-------------|-------------|----------
12-phase-novel-pipeline   | 7           | 5           | 5
```

### List specific dependencies

```sql
SELECT
    dependencies_json->'agents' as agents,
    dependencies_json->'skills' as skills,
    dependencies_json->'mcpServers' as mcp_servers
FROM workflow_definitions
WHERE id = '12-phase-novel-pipeline';
```

**Expected agents:**
- brainstorming-agent
- market-research-agent
- series-architect-agent
- npe-series-validator-agent
- commercial-validator-agent
- miranda-showrunner
- bailey-first-drafter

**Expected skills:**
- market-driven-planning-skill
- series-planning-skill
- book-planning-skill
- chapter-planning-skill
- scene-writing-skill

**Expected MCP servers:**
- workflow-manager
- author-server
- series-planning-server
- character-planning-server
- core-continuity-server

---

## Troubleshooting

### Error: "Module not found: handlers/workflow-handlers.js"

The workflow manager was recently refactored to use a separate handlers file. You have two options:

**Option A: Update the test script**

The test script needs to be updated if handlers were extracted. Check if this file exists:
```
C:\github\MCP-Writing-Servers\src\mcps\workflow-manager-server\handlers\workflow-handlers.js
```

**Option B: Test directly via database**

Skip the MCP tool tests and verify the database directly using the SQL queries above.

### Error: "Connection refused" or "Database not found"

Make sure Docker containers are running:

```bash
docker ps
```

You should see:
- fictionlab-postgres
- fictionlab-pgbouncer
- fictionlab-mcp-servers

If not running:

```bash
cd C:\github\MCP-Electron-App
docker-compose up -d
```

### Error: "Migration already applied"

This is normal! Migration 028 has protection against running twice. The message means it already ran successfully.

### Error: "Table already exists"

Same as above - migration already ran. This is safe to ignore.

---

## Quick Verification Checklist

Use this checklist to verify everything is working:

- [ ] Migration 028 ran successfully
- [ ] All 5 new tables created
- [ ] workflow_instances has 3 new columns
- [ ] workflow_phase_history has 3 new columns
- [ ] 12-phase workflow seeded with 13 phases
- [ ] All indexes created
- [ ] Both views created (active_workflows, workflow_execution_summary)
- [ ] Can query workflow_definitions table
- [ ] Can see all 13 phases in phases_json
- [ ] Can see dependencies (7 agents, 5 skills, 5 MCPs)
- [ ] MCP server starts without errors
- [ ] All 11 new tools are accessible

---

## Next Steps After Verification

Once all tests pass, you can:

1. **Import a real workflow** - Use the Electron app to import workflows from folders
2. **Build the UI** - Create React Flow visualization
3. **Execute workflows** - Test end-to-end workflow execution
4. **Test sub-workflows** - Try executing Phase 3 with Series Architect sub-workflow

---

## Need Help?

If tests fail, check:
1. Docker containers running (`docker ps`)
2. Database accessible (`psql -h localhost -p 5433 -U fictionlab_user -d fictionlab`)
3. Migration 028 in migrations table (`SELECT * FROM migrations WHERE filename LIKE '%028%'`)
4. Server logs (`docker logs fictionlab-mcp-servers`)

For detailed documentation, see:
- [WORKFLOW_MANAGER_UPDATES.md](./WORKFLOW_MANAGER_UPDATES.md) - Complete technical documentation
- [migrations/028_workflow_definitions.sql](./migrations/028_workflow_definitions.sql) - Database schema
