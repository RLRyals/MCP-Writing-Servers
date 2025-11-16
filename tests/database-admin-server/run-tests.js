#!/usr/bin/env node
// tests/database-admin-server/run-tests.js
// Simple test runner for database-admin-server tests
// Runs all tests and reports results

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test statistics
const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
};

// Global describe and it functions for tests
global.describe = function(suiteName, suiteFunc) {
    console.log(`\n📦 ${suiteName}`);
    try {
        suiteFunc();
    } catch (error) {
        console.error(`  ❌ Suite failed: ${error.message}`);
        stats.errors.push({ suite: suiteName, test: 'suite', error });
    }
};

global.it = function(testName, testFunc) {
    stats.total++;
    try {
        testFunc();
        console.log(`  ✓ ${testName}`);
        stats.passed++;
    } catch (error) {
        console.log(`  ✗ ${testName}`);
        console.error(`    Error: ${error.message}`);
        stats.failed++;
        stats.errors.push({ test: testName, error });
    }
};

// Run all tests
async function runTests() {
    console.log('🧪 Running Database Admin Server Tests\n');
    console.log('═'.repeat(70));

    try {
        // Import and run security validator tests
        await import('./security-validator.test.js');

        // Import and run query builder tests
        await import('./query-builder.test.js');

        // Print summary
        console.log('\n' + '═'.repeat(70));
        console.log('\n📊 Test Summary\n');
        console.log(`  Total:  ${stats.total}`);
        console.log(`  ✓ Pass:  ${stats.passed} (${((stats.passed / stats.total) * 100).toFixed(1)}%)`);
        console.log(`  ✗ Fail:  ${stats.failed}`);

        if (stats.failed > 0) {
            console.log('\n❌ Test Failures:\n');
            stats.errors.forEach(({ test, error }, index) => {
                console.log(`${index + 1}. ${test}`);
                console.log(`   ${error.message}`);
                if (error.stack) {
                    console.log(`   ${error.stack.split('\n').slice(1, 3).join('\n   ')}`);
                }
            });
        }

        console.log('\n' + '═'.repeat(70));

        // Calculate coverage
        const coverage = (stats.passed / stats.total) * 100;
        console.log(`\n📈 Coverage: ${coverage.toFixed(1)}%`);

        if (coverage >= 90) {
            console.log('✅ Coverage goal met (90%+)\n');
        } else {
            console.log('⚠️  Coverage below 90% goal\n');
        }

        // Exit with appropriate code
        process.exit(stats.failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('\n❌ Fatal error running tests:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
runTests();
