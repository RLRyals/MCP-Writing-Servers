#!/usr/bin/env node
/**
 * Create GitHub issues for Database CRUD & Backup implementation
 * Uses Node.js fetch API (Node 18+)
 */

const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "RLRyals";
const REPO_NAME = "MCP-Writing-Servers";

if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    console.error('Set it with: export GITHUB_TOKEN=your_token_here');
    process.exit(1);
}

const ISSUES = [
    {
        file: "issue-01-phase-1-core-crud.md",
        title: "Phase 1: Implement Core Database CRUD Operations",
        labels: ["enhancement", "database", "crud", "phase-1"]
    },
    {
        file: "issue-02-phase-2-batch-operations.md",
        title: "Phase 2: Implement Batch Database Operations",
        labels: ["enhancement", "database", "batch-operations", "transactions", "phase-2"]
    },
    {
        file: "issue-03-phase-3-schema-introspection.md",
        title: "Phase 3: Implement Schema Introspection & Dynamic Queries",
        labels: ["enhancement", "database", "schema", "introspection", "phase-3"]
    },
    {
        file: "issue-04-phase-4-security-audit.md",
        title: "Phase 4: Implement Security Controls & Audit Logging",
        labels: ["security", "audit", "access-control", "compliance", "phase-4"]
    },
    {
        file: "issue-05-phase-5-backup-restore.md",
        title: "Phase 5: Implement Database Backup & Restore System",
        labels: ["enhancement", "database", "backup", "restore", "disaster-recovery", "phase-5"]
    },
    {
        file: "issue-06-phase-6-testing-documentation.md",
        title: "Phase 6: Comprehensive Testing & Documentation",
        labels: ["testing", "documentation", "quality-assurance", "phase-6"]
    },
    {
        file: "issue-07-phase-7-integration-deployment.md",
        title: "Phase 7: Integration, Deployment & Production Rollout",
        labels: ["deployment", "integration", "production", "monitoring", "phase-7"]
    }
];

async function createIssue(filePath, title, labels) {
    try {
        // Read the issue body
        const body = fs.readFileSync(filePath, 'utf-8');

        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                body,
                labels
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.log(`[FAIL] Failed to create issue: ${error.message}`);
            return null;
        }

        const result = await response.json();
        console.log(`[OK] Created issue #${result.number}: ${result.html_url}`);
        return result.html_url;

    } catch (error) {
        console.log(`[ERROR] Error: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log("============================================================");
    console.log("Creating GitHub Issues for Database CRUD Implementation");
    console.log(`Repository: ${REPO_OWNER}/${REPO_NAME}`);
    console.log("============================================================");
    console.log();

    let successCount = 0;
    let failedCount = 0;
    const createdUrls = [];

    for (const issueData of ISSUES) {
        console.log(`Creating: ${issueData.title}`);
        console.log(`  File: ${issueData.file}`);
        console.log(`  Labels: ${issueData.labels.join(', ')}`);

        const result = await createIssue(
            issueData.file,
            issueData.title,
            issueData.labels
        );

        if (result) {
            successCount++;
            createdUrls.push(result);
        } else {
            failedCount++;
        }

        console.log();

        // Rate limiting - wait 2 seconds between requests
        if (issueData !== ISSUES[ISSUES.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log("============================================================");
    console.log("Summary");
    console.log("============================================================");
    console.log(`[OK] Successfully created: ${successCount} issues`);
    console.log(`[FAIL] Failed: ${failedCount} issues`);
    console.log();

    if (createdUrls.length > 0) {
        console.log("Created issues:");
        createdUrls.forEach(url => console.log(`  - ${url}`));
        console.log();
    }

    console.log(`View all issues at: https://github.com/${REPO_OWNER}/${REPO_NAME}/issues`);
}

main().catch(console.error);
