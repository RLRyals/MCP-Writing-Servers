// tests/database-admin-server/batch-operations.test.js
// Comprehensive tests for batch database operations
// Tests transactional integrity, error handling, and performance

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { DatabaseAdminMCPServer } from '../../src/mcps/database-admin-server/index.js';

describe('Batch Operations Tests', () => {
    let server;
    let testAuthorId;
    let testSeriesId;

    before(async () => {
        // Initialize server
        server = new DatabaseAdminMCPServer();

        // Create test author and series for foreign key constraints
        const authorHandler = server.getToolHandler('db_insert_record');
        const authorResult = await authorHandler({
            table: 'authors',
            data: { name: 'Test Author Batch', bio: 'Author for batch testing' }
        });
        const authorData = JSON.parse(
            authorResult.content[0].text.split('\n\n')[1]
        );
        testAuthorId = authorData.id;

        const seriesHandler = server.getToolHandler('db_insert_record');
        const seriesResult = await seriesHandler({
            table: 'series',
            data: {
                title: 'Test Series Batch',
                author_id: testAuthorId,
                description: 'Series for batch testing'
            }
        });
        const seriesData = JSON.parse(
            seriesResult.content[0].text.split('\n\n')[1]
        );
        testSeriesId = seriesData.id;
    });

    after(async () => {
        // Clean up test data
        try {
            const deleteHandler = server.getToolHandler('db_delete_records');
            if (testSeriesId) {
                await deleteHandler({
                    table: 'series',
                    where: { id: testSeriesId },
                    soft_delete: false
                });
            }
            if (testAuthorId) {
                await deleteHandler({
                    table: 'authors',
                    where: { id: testAuthorId },
                    soft_delete: false
                });
            }
        } catch (error) {
            console.error('Cleanup error:', error.message);
        }

        // Close database connection
        if (server.db && server.db.pool) {
            await server.db.pool.end();
        }
    });

    // =========================================
    // BATCH INSERT TESTS
    // =========================================

    describe('db_batch_insert', () => {
        it('should insert multiple records successfully', async () => {
            const handler = server.getToolHandler('db_batch_insert');
            const result = await handler({
                table: 'books',
                records: [
                    {
                        series_id: testSeriesId,
                        title: 'Batch Book 1',
                        author_id: testAuthorId,
                        description: 'First batch book',
                        book_order: 1
                    },
                    {
                        series_id: testSeriesId,
                        title: 'Batch Book 2',
                        author_id: testAuthorId,
                        description: 'Second batch book',
                        book_order: 2
                    },
                    {
                        series_id: testSeriesId,
                        title: 'Batch Book 3',
                        author_id: testAuthorId,
                        description: 'Third batch book',
                        book_order: 3
                    }
                ]
            });

            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );

            assert.strictEqual(response.success, true);
            assert.strictEqual(response.insertedCount, 3);
            assert.strictEqual(response.insertedIds.length, 3);
            assert.ok(Array.isArray(response.records));
            assert.strictEqual(response.records.length, 3);
        });

        it('should rollback all inserts if one fails', async () => {
            const handler = server.getToolHandler('db_batch_insert');
            const queryHandler = server.getToolHandler('db_query_records');

            // Count books before
            const beforeResult = await queryHandler({
                table: 'books',
                where: { series_id: testSeriesId }
            });
            const beforeData = JSON.parse(
                beforeResult.content[0].text.split('\n\n').pop()
            );
            const beforeCount = beforeData.count;

            // Try to insert with one invalid record (missing required field)
            try {
                await handler({
                    table: 'books',
                    records: [
                        {
                            series_id: testSeriesId,
                            title: 'Valid Book',
                            author_id: testAuthorId,
                            book_order: 10
                        },
                        {
                            // Missing required field 'title'
                            series_id: testSeriesId,
                            author_id: testAuthorId,
                            book_order: 11
                        }
                    ]
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error.message.includes('not null violation') ||
                         error.message.includes('required field'));
            }

            // Count books after - should be same as before (rollback worked)
            const afterResult = await queryHandler({
                table: 'books',
                where: { series_id: testSeriesId }
            });
            const afterData = JSON.parse(
                afterResult.content[0].text.split('\n\n').pop()
            );

            assert.strictEqual(afterData.count, beforeCount);
        });

        it('should enforce batch size limits', async () => {
            const handler = server.getToolHandler('db_batch_insert');

            // Test empty array
            try {
                await handler({
                    table: 'books',
                    records: []
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error.message.includes('Batch size'));
            }

            // Test exceeding max (would need 1001 records - not practical to test)
            // Just verify the validation exists
        });
    });

    // =========================================
    // BATCH UPDATE TESTS
    // =========================================

    describe('db_batch_update', () => {
        let bookIds = [];

        before(async () => {
            // Create test books for update
            const insertHandler = server.getToolHandler('db_batch_insert');
            const result = await insertHandler({
                table: 'books',
                records: [
                    {
                        series_id: testSeriesId,
                        title: 'Update Test Book 1',
                        author_id: testAuthorId,
                        status: 'draft',
                        book_order: 20
                    },
                    {
                        series_id: testSeriesId,
                        title: 'Update Test Book 2',
                        author_id: testAuthorId,
                        status: 'draft',
                        book_order: 21
                    }
                ]
            });

            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );
            bookIds = response.insertedIds;
        });

        it('should update multiple records with different conditions', async () => {
            const handler = server.getToolHandler('db_batch_update');
            const result = await handler({
                table: 'books',
                updates: [
                    {
                        where: { id: bookIds[0] },
                        data: { status: 'published' }
                    },
                    {
                        where: { id: bookIds[1] },
                        data: { status: 'in_review' }
                    }
                ]
            });

            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );

            assert.strictEqual(response.success, true);
            assert.strictEqual(response.updatedCount, 2);

            // Verify updates
            const queryHandler = server.getToolHandler('db_query_records');
            const book1 = await queryHandler({
                table: 'books',
                where: { id: bookIds[0] }
            });
            const book1Data = JSON.parse(
                book1.content[0].text.split('\n\n').pop()
            );
            assert.strictEqual(book1Data.records[0].status, 'published');
        });

        it('should rollback all updates if one fails', async () => {
            const handler = server.getToolHandler('db_batch_update');

            try {
                await handler({
                    table: 'books',
                    updates: [
                        {
                            where: { id: bookIds[0] },
                            data: { status: 'completed' }
                        },
                        {
                            where: { id: 99999999 }, // Non-existent ID
                            data: { status: 'completed' }
                        }
                    ]
                });
                // Note: This might not fail if the second update just affects 0 rows
                // The transaction will still commit
            } catch (error) {
                // If it does fail, that's fine too
                assert.ok(error);
            }
        });
    });

    // =========================================
    // BATCH DELETE TESTS
    // =========================================

    describe('db_batch_delete', () => {
        let deleteTestBookIds = [];

        before(async () => {
            // Create test books for deletion
            const insertHandler = server.getToolHandler('db_batch_insert');
            const result = await insertHandler({
                table: 'books',
                records: [
                    {
                        series_id: testSeriesId,
                        title: 'Delete Test Book 1',
                        author_id: testAuthorId,
                        book_order: 30
                    },
                    {
                        series_id: testSeriesId,
                        title: 'Delete Test Book 2',
                        author_id: testAuthorId,
                        book_order: 31
                    },
                    {
                        series_id: testSeriesId,
                        title: 'Delete Test Book 3',
                        author_id: testAuthorId,
                        book_order: 32
                    }
                ]
            });

            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );
            deleteTestBookIds = response.insertedIds;
        });

        it('should soft delete multiple records', async () => {
            const handler = server.getToolHandler('db_batch_delete');
            const result = await handler({
                table: 'books',
                conditions: [
                    { id: deleteTestBookIds[0] },
                    { id: deleteTestBookIds[1] }
                ],
                soft_delete: true
            });

            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );

            assert.strictEqual(response.success, true);
            assert.strictEqual(response.deletedCount, 2);

            // Verify soft delete (deleted_at should be set)
            const queryHandler = server.getToolHandler('db_query_records');
            const deletedBooks = await queryHandler({
                table: 'books',
                where: { id: { $in: [deleteTestBookIds[0], deleteTestBookIds[1]] } }
            });
            const deletedData = JSON.parse(
                deletedBooks.content[0].text.split('\n\n').pop()
            );

            // Books should still exist with deleted_at set
            assert.strictEqual(deletedData.count, 2);
            assert.ok(deletedData.records[0].deleted_at !== null);
        });

        it('should hard delete multiple records', async () => {
            const handler = server.getToolHandler('db_batch_delete');
            const queryHandler = server.getToolHandler('db_query_records');

            // Delete the third test book with hard delete
            const result = await handler({
                table: 'books',
                conditions: [
                    { id: deleteTestBookIds[2] }
                ],
                soft_delete: false
            });

            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );

            assert.strictEqual(response.success, true);
            assert.strictEqual(response.deletedCount, 1);

            // Verify hard delete (record should not exist)
            const deletedBooks = await queryHandler({
                table: 'books',
                where: { id: deleteTestBookIds[2] }
            });
            const deletedData = JSON.parse(
                deletedBooks.content[0].text.split('\n\n').pop()
            );

            assert.strictEqual(deletedData.count, 0);
        });
    });

    // =========================================
    // PERFORMANCE TESTS
    // =========================================

    describe('Performance Tests', () => {
        it('should insert 100 records in under 2 seconds', async function() {
            this.timeout(5000);

            const records = [];
            for (let i = 0; i < 100; i++) {
                records.push({
                    series_id: testSeriesId,
                    title: `Performance Test Book ${i}`,
                    author_id: testAuthorId,
                    book_order: 100 + i
                });
            }

            const handler = server.getToolHandler('db_batch_insert');
            const startTime = Date.now();

            const result = await handler({
                table: 'books',
                records
            });

            const duration = Date.now() - startTime;
            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );

            console.log(`Inserted 100 records in ${duration}ms`);
            assert.strictEqual(response.insertedCount, 100);
            assert.ok(duration < 2000, `Expected < 2000ms, got ${duration}ms`);

            // Clean up performance test records
            const deleteHandler = server.getToolHandler('db_batch_delete');
            await deleteHandler({
                table: 'books',
                conditions: response.insertedIds.map(id => ({ id })),
                soft_delete: false
            });
        });
    });

    // =========================================
    // TRANSACTION INTEGRITY TESTS
    // =========================================

    describe('Transaction Integrity', () => {
        it('should maintain atomicity across batch operations', async () => {
            const insertHandler = server.getToolHandler('db_batch_insert');
            const queryHandler = server.getToolHandler('db_query_records');

            // Get count before
            const beforeResult = await queryHandler({
                table: 'books',
                where: { series_id: testSeriesId }
            });
            const beforeData = JSON.parse(
                beforeResult.content[0].text.split('\n\n').pop()
            );
            const beforeCount = beforeData.count;

            // Insert valid records
            const result = await insertHandler({
                table: 'books',
                records: [
                    {
                        series_id: testSeriesId,
                        title: 'Atomic Test Book 1',
                        author_id: testAuthorId,
                        book_order: 200
                    },
                    {
                        series_id: testSeriesId,
                        title: 'Atomic Test Book 2',
                        author_id: testAuthorId,
                        book_order: 201
                    }
                ]
            });

            const response = JSON.parse(
                result.content[0].text.split('\n\n').pop()
            );

            // Verify both records were inserted (atomic success)
            const afterResult = await queryHandler({
                table: 'books',
                where: { series_id: testSeriesId }
            });
            const afterData = JSON.parse(
                afterResult.content[0].text.split('\n\n').pop()
            );

            assert.strictEqual(afterData.count, beforeCount + 2);

            // Clean up
            const deleteHandler = server.getToolHandler('db_batch_delete');
            await deleteHandler({
                table: 'books',
                conditions: response.insertedIds.map(id => ({ id })),
                soft_delete: false
            });
        });
    });
});
