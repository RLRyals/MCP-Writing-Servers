// src/mcps/book-server/handlers/book-handlers.js
// Core Book Management Handler - CRUD operations for books within series
// Designed for AI Writing Teams to manage book-level story structure

import { bookPlanningSchemas } from '../schemas/book-planning-schemas.js';

export class BookHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // BOOK TOOL DEFINITIONS
    // =============================================
    getBookTools() {
        // Import schemas from external file to reduce handler size and token usage
        return [
            bookPlanningSchemas.list_books,
            bookPlanningSchemas.get_book,
            bookPlanningSchemas.create_book,
            bookPlanningSchemas.update_book,
            {
                name: 'delete_book',
                description: 'Delete a book and all its chapters/scenes',
                inputSchema: {
                    type: 'object',
                    properties: {
                        book_id: {
                            type: 'integer',
                            description: 'The ID of the book to delete'
                        },
                        confirm_deletion: {
                            type: 'boolean',
                            description: 'Must be true to confirm deletion'
                        }
                    },
                    required: ['book_id', 'confirm_deletion']
                }
            }
        ];
    }

    // =============================================
    // BOOK MANAGEMENT HANDLERS
    // =============================================

    async handleListBooks(args) {
        try {
            const { series_id, status, include_stats = false } = args;
            
            let query = `
                SELECT b.*, s.title as series_title, a.name as author_name,
                       bwg.genre_names
                FROM books b
                JOIN series s ON b.series_id = s.id
                JOIN authors a ON s.author_id = a.id
                LEFT JOIN books_with_genres bwg ON b.id = bwg.id
            `;
            
            const params = [];
            const conditions = [];
            let paramCount = 0;

            if (series_id) {
                paramCount++;
                conditions.push(`b.series_id = $${paramCount}`);
                params.push(series_id);
            }

            if (status) {
                paramCount++;
                conditions.push(`b.status = $${paramCount}`);
                params.push(status);
            }

            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
            
            query += ' ORDER BY s.title, b.book_number';
            
            const result = await this.db.query(query, params);

            const books = [];
            for (const book of result.rows) {
                const bookData = {
                    id: book.id,
                    title: book.title,
                    series_id: book.series_id,
                    series_title: book.series_title,
                    book_number: book.book_number,
                    author_name: book.author_name,
                    status: book.status,
                    publication_year: book.publication_year,
                    target_word_count: book.target_word_count,
                    actual_word_count: book.actual_word_count,
                    page_count: book.page_count,
                    isbn: book.isbn,
                    description: book.description,
                    genre_names: book.genre_names || [],
                    created_at: book.created_at,
                    updated_at: book.updated_at
                };

                if (include_stats) {
                    // Get chapter count and total word count
                    const statsQuery = `
                        SELECT
                            COUNT(*) as chapter_count,
                            COALESCE(SUM(word_count), 0) as total_words
                        FROM chapters
                        WHERE book_id = $1
                    `;
                    const statsResult = await this.db.query(statsQuery, [book.id]);
                    const stats = statsResult.rows[0];

                    bookData.stats = {
                        chapter_count: parseInt(stats.chapter_count) || 0,
                        total_words: parseInt(stats.total_words) || 0,
                        progress_percent: (book.target_word_count && stats.total_words > 0)
                            ? Math.round((stats.total_words / book.target_word_count) * 100)
                            : null
                    };
                }

                books.push(bookData);
            }

            return { books };
        } catch (error) {
            throw new Error(`Failed to list books: ${error.message}`);
        }
    }

    async handleGetBook(args) {
        try {
            const { book_id, include_chapters = false } = args;

            const query = `
                SELECT b.*, s.title as series_title, a.name as author_name,
                       bwg.genre_names
                FROM books b
                JOIN series s ON b.series_id = s.id
                JOIN authors a ON s.author_id = a.id
                LEFT JOIN books_with_genres bwg ON b.id = bwg.id
                WHERE b.id = $1
            `;
            const result = await this.db.query(query, [book_id]);

            if (result.rows.length === 0) {
                return {
                    error: 'not_found',
                    book_id,
                    message: `No book found with ID: ${book_id}`
                };
            }

            const book = result.rows[0];

            const bookData = {
                id: book.id,
                title: book.title,
                series_id: book.series_id,
                series_title: book.series_title,
                book_number: book.book_number,
                author_name: book.author_name,
                status: book.status,
                target_word_count: book.target_word_count,
                actual_word_count: book.actual_word_count || 0,
                publication_year: book.publication_year,
                page_count: book.page_count,
                isbn: book.isbn,
                cover_image_url: book.cover_image_url,
                genre_names: book.genre_names || [],
                description: book.description,
                created_at: book.created_at,
                updated_at: book.updated_at
            };

            if (include_chapters) {
                const chaptersQuery = `
                    SELECT id, chapter_number, title, word_count, status
                    FROM chapters
                    WHERE book_id = $1
                    ORDER BY chapter_number
                `;
                const chaptersResult = await this.db.query(chaptersQuery, [book_id]);
                bookData.chapters = chaptersResult.rows;
            }

            return { book: bookData };
        } catch (error) {
            throw new Error(`Failed to get book: ${error.message}`);
        }
    }

    async handleCreateBook(args) {
        try {
            const { title, series_id, book_number, status = 'planned', target_word_count,
                    actual_word_count = 0, publication_year, description, isbn, page_count,
                    cover_image_url, genre_names } = args;

            // Check if book number already exists in series
            const checkQuery = 'SELECT id FROM books WHERE series_id = $1 AND book_number = $2';
            const checkResult = await this.db.query(checkQuery, [series_id, book_number]);

            if (checkResult.rows.length > 0) {
                throw new Error(`Book #${book_number} already exists in this series`);
            }

            const query = `
                INSERT INTO books (
                    title, series_id, book_number, status, target_word_count,
                    actual_word_count, publication_year, description, isbn,
                    page_count, cover_image_url
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `;

            const result = await this.db.query(query, [
                title, series_id, book_number, status, target_word_count || null,
                actual_word_count, publication_year || null, description || null,
                isbn || null, page_count || null, cover_image_url || null
            ]);

            const book = result.rows[0];

            // Handle genre associations
            if (genre_names && genre_names.length > 0) {
                for (const genreName of genre_names) {
                    // Find or create genre
                    const genreQuery = 'SELECT id FROM genres WHERE LOWER(TRIM(genre_name)) = LOWER(TRIM($1))';
                    const genreResult = await this.db.query(genreQuery, [genreName]);

                    if (genreResult.rows.length > 0) {
                        const genreId = genreResult.rows[0].id;
                        // Create junction table entry
                        await this.db.query(
                            'INSERT INTO book_genres (book_id, genre_id) VALUES ($1, $2) ON CONFLICT (book_id, genre_id) DO NOTHING',
                            [book.id, genreId]
                        );
                    }
                }
            }

            // Get series and author info for display
            const infoQuery = `
                SELECT s.title as series_title, a.name as author_name
                FROM series s
                JOIN authors a ON s.author_id = a.id
                WHERE s.id = $1
            `;
            const infoResult = await this.db.query(infoQuery, [series_id]);
            const info = infoResult.rows[0] || {};

            return {
                content: [{
                    type: 'text',
                    text: `Created book successfully!\n\n` +
                          `ID: ${book.id}\n` +
                          `Title: ${book.title}\n` +
                          `Series: ${info.series_title || 'Unknown'} (#${book.book_number})\n` +
                          `Author: ${info.author_name || 'Unknown'}\n` +
                          `Status: ${book.status}\n` +
                          `Target Word Count: ${book.target_word_count || 'Not specified'}\n` +
                          `Current Word Count: ${book.actual_word_count}\n` +
                          `Genre Tags: ${genre_names && genre_names.length > 0 ? genre_names.join(', ') : 'None'}\n` +
                          `Description: ${book.description || 'No description provided'}`
                }]
            };
        } catch (error) {
            if (error.code === '23503') { // Foreign key violation
                throw new Error('Invalid series_id: Series not found');
            }
            throw new Error(`Failed to create book: ${error.message}`);
        }
    }

    async handleUpdateBook(args) {
        try {
            const { book_id, genre_names, ...updates } = args;

            // If updating book_number, check for conflicts
            if (updates.book_number !== undefined) {
                const checkQuery = 'SELECT series_id FROM books WHERE id = $1';
                const seriesResult = await this.db.query(checkQuery, [book_id]);

                if (seriesResult.rows.length === 0) {
                    throw new Error('Book not found');
                }

                const series_id = seriesResult.rows[0].series_id;
                const conflictQuery = 'SELECT id FROM books WHERE series_id = $1 AND book_number = $2 AND id != $3';
                const conflictResult = await this.db.query(conflictQuery, [series_id, updates.book_number, book_id]);

                if (conflictResult.rows.length > 0) {
                    throw new Error(`Book #${updates.book_number} already exists in this series`);
                }
            }

            // Build dynamic update query
            const updateFields = [];
            const params = [book_id];
            let paramCount = 1;

            for (const [key, value] of Object.entries(updates)) {
                if (value !== undefined) {
                    paramCount++;
                    updateFields.push(`${key} = $${paramCount}`);
                    params.push(value);
                }
            }

            if (updateFields.length === 0 && !genre_names) {
                throw new Error('No fields to update');
            }

            if (updateFields.length > 0) {
                updateFields.push('updated_at = CURRENT_TIMESTAMP');

                const query = `
                    UPDATE books
                    SET ${updateFields.join(', ')}
                    WHERE id = $1
                    RETURNING *
                `;

                const result = await this.db.query(query, params);

                if (result.rows.length === 0) {
                    return {
                        error: 'not_found',
                        book_id,
                        message: `No book found with ID: ${book_id}`
                    };
                }
            }

            // Handle genre updates
            if (genre_names !== undefined) {
                // First, remove all existing genre associations
                await this.db.query('DELETE FROM book_genres WHERE book_id = $1', [book_id]);

                // Then add new ones
                if (genre_names.length > 0) {
                    for (const genreName of genre_names) {
                        const genreQuery = 'SELECT id FROM genres WHERE LOWER(TRIM(genre_name)) = LOWER(TRIM($1))';
                        const genreResult = await this.db.query(genreQuery, [genreName]);

                        if (genreResult.rows.length > 0) {
                            const genreId = genreResult.rows[0].id;
                            await this.db.query(
                                'INSERT INTO book_genres (book_id, genre_id) VALUES ($1, $2) ON CONFLICT (book_id, genre_id) DO NOTHING',
                                [book_id, genreId]
                            );
                        }
                    }
                }
            }

            // Get updated book info with genres
            const bookQuery = `
                SELECT b.*, s.title as series_title, a.name as author_name,
                       bwg.genre_names
                FROM books b
                JOIN series s ON b.series_id = s.id
                JOIN authors a ON s.author_id = a.id
                LEFT JOIN books_with_genres bwg ON b.id = bwg.id
                WHERE b.id = $1
            `;
            const bookResult = await this.db.query(bookQuery, [book_id]);
            const book = bookResult.rows[0];

            return {
                book: {
                    id: book.id,
                    title: book.title,
                    series_id: book.series_id,
                    series_title: book.series_title,
                    book_number: book.book_number,
                    author_name: book.author_name,
                    status: book.status,
                    target_word_count: book.target_word_count,
                    actual_word_count: book.actual_word_count || 0,
                    publication_year: book.publication_year,
                    page_count: book.page_count,
                    isbn: book.isbn,
                    cover_image_url: book.cover_image_url,
                    genre_names: book.genre_names || [],
                    description: book.description,
                    created_at: book.created_at,
                    updated_at: book.updated_at
                }
            };
        } catch (error) {
            throw new Error(`Failed to update book: ${error.message}`);
        }
    }

    async handleDeleteBook(args) {
        try {
            const { book_id, confirm_deletion } = args;
            
            if (!confirm_deletion) {
                throw new Error('Must confirm deletion by setting confirm_deletion to true');
            }
            
            // Get book info before deletion
            const bookQuery = `
                SELECT b.title, s.title as series_title, 
                       (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count
                FROM books b 
                JOIN series s ON b.series_id = s.id 
                WHERE b.id = $1
            `;
            const bookResult = await this.db.query(bookQuery, [book_id]);
            
            if (bookResult.rows.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `No book found with ID: ${book_id}`
                    }]
                };
            }
            
            const bookInfo = bookResult.rows[0];
            
            // Delete the book (cascade will handle chapters and scenes)
            const deleteQuery = 'DELETE FROM books WHERE id = $1 RETURNING *';
            const deleteResult = await this.db.query(deleteQuery, [book_id]);
            
            return {
                content: [{
                    type: 'text',
                    text: `Successfully deleted book: "${bookInfo.title}"\n` +
                          `Series: ${bookInfo.series_title}\n` +
                          `${bookInfo.chapter_count} chapters and all associated scenes were also deleted.\n\n` +
                          `⚠️ This action cannot be undone.`
                }]
            };
        } catch (error) {
            throw new Error(`Failed to delete book: ${error.message}`);
        }
    }

    // =============================================
    // UTILITY METHODS FOR CROSS-COMPONENT USE
    // =============================================

    async getBookById(book_id) {
        try {
            const query = `
                SELECT b.*, s.title as series_title, a.name as author_name,
                       bwg.genre_names
                FROM books b
                JOIN series s ON b.series_id = s.id
                JOIN authors a ON s.author_id = a.id
                LEFT JOIN books_with_genres bwg ON b.id = bwg.id
                WHERE b.id = $1
            `;
            const result = await this.db.query(query, [book_id]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Failed to get book by ID: ${error.message}`);
        }
    }

    async updateBookWordCount(book_id, new_word_count) {
        try {
            const query = `
                UPDATE books 
                SET actual_word_count = $2, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $1 
                RETURNING actual_word_count
            `;
            const result = await this.db.query(query, [book_id, new_word_count]);
            return result.rows[0]?.actual_word_count || 0;
        } catch (error) {
            throw new Error(`Failed to update book word count: ${error.message}`);
        }
    }
}