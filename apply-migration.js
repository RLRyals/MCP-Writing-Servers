#!/usr/bin/env node
// Script to apply Workflow Manager migration
// Usage: node apply-migration.js

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
    console.log('📊 Applying Workflow Manager migration...\n');

    // Database config (read from environment or use defaults)
    const config = {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'mcp_series',
        user: process.env.POSTGRES_USER || 'writer',
        password: process.env.POSTGRES_PASSWORD || 'your_secure_password2025'
    };

    console.log(`Connecting to: ${config.user}@${config.host}:${config.port}/${config.database}`);

    const pool = new Pool(config);

    try {
        // Test connection
        const client = await pool.connect();
        console.log('✅ Database connected\n');

        // Read migration file
        const migrationPath = join(__dirname, 'migrations', '027_workflow_manager.sql');
        const migrationSQL = readFileSync(migrationPath, 'utf8');

        console.log('Executing migration SQL...');

        // Execute migration
        await client.query(migrationSQL);

        console.log('\n✅ Migration applied successfully!\n');

        // Verify tables created
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN (
                'workflow_instances',
                'workflow_phase_history',
                'workflow_approvals',
                'workflow_quality_gates',
                'production_metrics',
                'daily_writing_stats',
                'phase_performance',
                'revision_passes',
                'qa_reports'
            )
            ORDER BY table_name
        `);

        console.log('📋 Tables created:');
        result.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ${row.table_name}`);
        });

        console.log(`\nTotal: ${result.rows.length}/9 tables\n`);

        if (result.rows.length === 9) {
            console.log('🎉 All tables created successfully!');
        } else {
            console.warn('⚠️  Warning: Not all tables were created');
        }

        client.release();

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nDetails:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
