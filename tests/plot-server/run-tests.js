#!/usr/bin/env node
// tests/plot-server/run-tests.js
// Test runner for plot-server tests (bead mws-1783883496416-7-47d7c3e7):
// link_plot_threads round-trip + get_world_systems round-trip.
// Both suites use a mocked db - no live database connection required.

import { runTests as runPlotThreadHandlerTests } from './plot-thread-handlers.test.js';
import { runTests as runGenreExtensionTests } from './genre-extensions.test.js';

console.log('🧪 Running Plot Server Tests\n');
console.log('═'.repeat(70));

let ok = true;

try {
    ok = (await runPlotThreadHandlerTests()) && ok;
} catch (error) {
    console.error('Fatal error running plot-thread-handlers tests:', error);
    ok = false;
}

try {
    ok = (await runGenreExtensionTests()) && ok;
} catch (error) {
    console.error('Fatal error running genre-extensions tests:', error);
    ok = false;
}

console.log('\n' + '═'.repeat(70));
process.exitCode = ok ? 0 : 1;
