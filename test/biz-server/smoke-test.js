#!/usr/bin/env node
// test/biz-server/smoke-test.js
// Exercises every biz-server tool once against the LIVE database, over the
// real stdio transport (same pattern as test/kanban-server/smoke-test.js).
// Uses the seeded default account (migration 055) and its own throwaway rows
// (transaction, asset, deadlines), all deleted at the end.
//
// Run: node test/biz-server/smoke-test.js
// Requires: DATABASE_URL in .env, migrations 048-053 + 055 already applied.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const { Pool } = pg;

let passCount = 0;
let failCount = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        passCount++;
    } else {
        console.log(`  FAIL  ${label}${detail ? ' -- ' + detail : ''}`);
        failCount++;
    }
}

async function callTool(client, name, args) {
    const result = await client.callTool({ name, arguments: args || {} });
    if (result.isError) {
        throw new Error(`Tool ${name} returned an error: ${result.content?.[0]?.text}`);
    }
    const text = result.content?.[0]?.text;
    return text ? JSON.parse(text) : undefined;
}

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const accountResult = await pool.query('SELECT id FROM fictionlab.biz_accounts ORDER BY id LIMIT 1');
    if (accountResult.rows.length === 0) {
        throw new Error('No fictionlab.biz_accounts row exists -- run migration 055 first');
    }
    const accountId = accountResult.rows[0].id;
    const companyResult = await pool.query('SELECT id FROM fictionlab.biz_companies ORDER BY id LIMIT 1');
    const companyId = companyResult.rows[0].id;

    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(repoRoot, 'src/mcps/biz-server/stdio-adapter.js')],
        cwd: repoRoot,
        env: { ...process.env, MCP_STDIO_MODE: 'true' }
    });

    const client = new Client({ name: 'biz-smoke-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    console.log('Connected to biz-server over stdio.\n');

    let transactionId;
    let annualDeadlineId;
    let noneDeadlineId;

    try {
        // 1. create_biz_transaction
        const createTxRes = await callTool(client, 'create_biz_transaction', {
            account_id: accountId,
            occurred_on: '2026-09-01',
            amount: 42.5,
            direction: 'expense',
            category: 'software',
            description: 'Smoke test transaction'
        });
        transactionId = createTxRes.transaction.id;
        check('create_biz_transaction returns a transaction id', !!transactionId);
        check('create_biz_transaction stores the amount', createTxRes.transaction.amount === '42.50', createTxRes.transaction.amount);

        // 2. list_biz_transactions
        const listTxRes = await callTool(client, 'list_biz_transactions', { account_id: accountId });
        check('list_biz_transactions finds the new transaction', listTxRes.transactions.some((t) => t.id === transactionId));

        // 3. update_biz_transaction (partial patch)
        const updateTxRes = await callTool(client, 'update_biz_transaction', {
            id: transactionId,
            category: 'subscriptions'
        });
        check('update_biz_transaction applies the category patch', updateTxRes.transaction.category === 'subscriptions');
        check(
            'update_biz_transaction leaves description untouched (partial patch)',
            updateTxRes.transaction.description === 'Smoke test transaction'
        );

        // 4. create_biz_asset (receipt pointer, linked to the transaction)
        const createAssetRes = await callTool(client, 'create_biz_asset', {
            title: 'Smoke test receipt',
            asset_type: 'receipt',
            path_or_url: '/tmp/smoke-test-receipt.jpg',
            transaction_id: transactionId
        });
        check('create_biz_asset returns an asset id', !!createAssetRes.asset.id);
        check('create_biz_asset links transaction_id', createAssetRes.asset.transaction_id === String(transactionId));

        const listAssetsRes = await callTool(client, 'list_biz_assets', {});
        check('list_biz_assets finds the new asset', listAssetsRes.assets.some((a) => a.id === createAssetRes.asset.id));

        // 5. list_biz_deadlines / complete_biz_deadline -- S14 recurrence semantics
        const annualDeadlineInsert = await pool.query(
            `INSERT INTO fictionlab.biz_deadlines (company_id, title, due_date, recurrence, category, snoozed_until)
             VALUES ($1, 'Smoke test annual renewal', '2026-01-01', 'annual', 'renewal', '2025-12-20') RETURNING *`,
            [companyId]
        );
        annualDeadlineId = annualDeadlineInsert.rows[0].id;

        const noneDeadlineInsert = await pool.query(
            `INSERT INTO fictionlab.biz_deadlines (company_id, title, due_date, recurrence, category)
             VALUES ($1, 'Smoke test one-off filing', '2026-01-01', 'none', 'compliance') RETURNING *`,
            [companyId]
        );
        noneDeadlineId = noneDeadlineInsert.rows[0].id;

        const listDeadlinesRes = await callTool(client, 'list_biz_deadlines', { category: 'renewal' });
        check(
            'list_biz_deadlines category filter finds the annual deadline',
            listDeadlinesRes.deadlines.some((d) => d.id === annualDeadlineId)
        );
        check(
            'list_biz_deadlines category filter excludes the compliance deadline',
            !listDeadlinesRes.deadlines.some((d) => d.id === noneDeadlineId)
        );

        const completeAnnualRes = await callTool(client, 'complete_biz_deadline', { id: annualDeadlineId });
        check(
            "complete_biz_deadline rolls a recurring deadline's due_date forward one period",
            completeAnnualRes.deadline.due_date.startsWith('2027-01-01'),
            completeAnnualRes.deadline.due_date
        );
        check(
            'complete_biz_deadline clears snoozed_until on a recurring deadline',
            completeAnnualRes.deadline.snoozed_until === null
        );
        check(
            "complete_biz_deadline leaves done_at null for a recurring deadline",
            completeAnnualRes.deadline.done_at === null
        );

        const completeNoneRes = await callTool(client, 'complete_biz_deadline', { id: noneDeadlineId });
        check("complete_biz_deadline sets done_at for recurrence='none'", !!completeNoneRes.deadline.done_at);
        check(
            "complete_biz_deadline leaves due_date unchanged for recurrence='none'",
            completeNoneRes.deadline.due_date.startsWith('2026-01-01')
        );

        // 6. remaining plain list_* tools -- smoke-only (no fixture rows required)
        const subsRes = await callTool(client, 'list_biz_subscriptions', {});
        check('list_biz_subscriptions returns a subscriptions array', Array.isArray(subsRes.subscriptions));

        const debtsRes = await callTool(client, 'list_biz_debts', {});
        check('list_biz_debts returns a debts array', Array.isArray(debtsRes.debts));

        const goalsRes = await callTool(client, 'list_biz_savings_goals', {});
        check('list_biz_savings_goals returns a savings_goals array', Array.isArray(goalsRes.savings_goals));

        const contentRes = await callTool(client, 'list_biz_content_items', {});
        check('list_biz_content_items returns a content_items array', Array.isArray(contentRes.content_items));

        // 7. required-field validation
        let rejectedMissingAccountId = false;
        try {
            await callTool(client, 'list_biz_transactions', {});
        } catch (e) {
            rejectedMissingAccountId = /account_id is required/i.test(e.message);
        }
        check('list_biz_transactions rejects a missing account_id', rejectedMissingAccountId);
    } finally {
        await client.close();
        if (transactionId) {
            await pool.query('DELETE FROM fictionlab.biz_assets WHERE transaction_id = $1', [transactionId]);
            await pool.query('DELETE FROM fictionlab.biz_transactions WHERE id = $1', [transactionId]);
        }
        await pool.query('DELETE FROM fictionlab.biz_deadlines WHERE id = ANY($1)', [
            [annualDeadlineId, noneDeadlineId].filter(Boolean)
        ]);
        console.log('\nCleaned up smoke test rows.');
        await pool.end();
    }

    console.log(`\n${passCount} passed, ${failCount} failed.`);
    process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('Smoke test crashed:', error);
    process.exit(1);
});
