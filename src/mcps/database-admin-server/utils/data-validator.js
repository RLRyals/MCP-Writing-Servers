// src/mcps/database-admin-server/utils/data-validator.js
// Data Validation for Database Operations
// Provides schema-based validation and custom validation rules

/**
 * DataValidator class
 * Validates data against schema and custom rules before database operations
 */
export class DataValidator {
    constructor(db) {
        this.db = db;
        this.schemaCache = new Map();
    }

    /**
     * Validate record data against table schema
     * @param {string} table - Table name
     * @param {object} data - Data to validate
     * @param {object} schema - Table schema (optional, will be fetched if not provided)
     * @param {string} operation - Operation type ('insert' or 'update')
     * @returns {object} Validation result
     */
    async validateRecordData(table, data, schema = null, operation = 'insert') {
        const errors = [];

        // Get schema if not provided
        if (!schema) {
            schema = await this.getTableSchema(table);
        }

        // Validate each field in data
        for (const [fieldName, value] of Object.entries(data)) {
            const columnSchema = schema.columns.find(col => col.column_name === fieldName);

            if (!columnSchema) {
                errors.push(`Unknown column '${fieldName}' for table '${table}'`);
                continue;
            }

            // Validate data type
            const typeError = this.validateDataType(fieldName, value, columnSchema);
            if (typeError) {
                errors.push(typeError);
            }

            // Validate NOT NULL constraint
            if (columnSchema.is_nullable === 'NO' && (value === null || value === undefined)) {
                errors.push(`Column '${fieldName}' cannot be null`);
            }

            // Validate length constraints for string types
            if (columnSchema.character_maximum_length && typeof value === 'string') {
                if (value.length > columnSchema.character_maximum_length) {
                    errors.push(
                        `Column '${fieldName}' exceeds maximum length of ${columnSchema.character_maximum_length} characters`
                    );
                }
            }

            // Custom validation rules
            const customError = this.applyCustomValidation(fieldName, value, columnSchema);
            if (customError) {
                errors.push(customError);
            }
        }

        // For INSERT operations, check required fields
        if (operation === 'insert') {
            const requiredFields = schema.columns.filter(col =>
                col.is_nullable === 'NO' &&
                col.column_default === null &&
                !['id', 'created_at', 'updated_at'].includes(col.column_name)
            );

            for (const requiredField of requiredFields) {
                if (!(requiredField.column_name in data)) {
                    errors.push(`Missing required field: ${requiredField.column_name}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate data type matches column schema
     * @param {string} fieldName - Field name
     * @param {*} value - Value to validate
     * @param {object} columnSchema - Column schema
     * @returns {string|null} Error message or null if valid
     */
    validateDataType(fieldName, value, columnSchema) {
        if (value === null || value === undefined) {
            return null; // NULL check is handled separately
        }

        const dataType = columnSchema.data_type.toLowerCase();

        // Integer types
        if (['integer', 'smallint', 'bigint', 'serial', 'bigserial'].includes(dataType)) {
            if (!Number.isInteger(Number(value))) {
                return `Column '${fieldName}' must be an integer, got: ${typeof value}`;
            }
        }

        // Numeric/decimal types
        if (['numeric', 'decimal', 'real', 'double precision'].includes(dataType)) {
            if (typeof value !== 'number' && isNaN(Number(value))) {
                return `Column '${fieldName}' must be a number, got: ${typeof value}`;
            }
        }

        // String types
        if (['character varying', 'varchar', 'character', 'char', 'text'].includes(dataType)) {
            if (typeof value !== 'string') {
                return `Column '${fieldName}' must be a string, got: ${typeof value}`;
            }
        }

        // Boolean type
        if (dataType === 'boolean') {
            if (typeof value !== 'boolean') {
                return `Column '${fieldName}' must be a boolean, got: ${typeof value}`;
            }
        }

        // Date/timestamp types
        if (['date', 'timestamp', 'timestamp without time zone', 'timestamp with time zone'].includes(dataType)) {
            const dateValue = new Date(value);
            if (isNaN(dateValue.getTime())) {
                return `Column '${fieldName}' must be a valid date/timestamp, got: ${value}`;
            }
        }

        // JSON types
        if (['json', 'jsonb'].includes(dataType)) {
            if (typeof value !== 'object') {
                return `Column '${fieldName}' must be a JSON object, got: ${typeof value}`;
            }
        }

        return null;
    }

    /**
     * Apply custom validation rules
     * @param {string} fieldName - Field name
     * @param {*} value - Value to validate
     * @param {object} columnSchema - Column schema
     * @returns {string|null} Error message or null if valid
     */
    applyCustomValidation(fieldName, value, columnSchema) {
        if (value === null || value === undefined) {
            return null;
        }

        // Email validation
        if (fieldName.includes('email') && typeof value === 'string') {
            if (!this.isValidEmail(value)) {
                return `Column '${fieldName}' must be a valid email address`;
            }
        }

        // URL validation
        if (fieldName.includes('url') && typeof value === 'string') {
            if (!this.isValidUrl(value)) {
                return `Column '${fieldName}' must be a valid URL`;
            }
        }

        // Positive number validation for IDs and counts
        if ((fieldName.includes('_id') || fieldName.includes('count') || fieldName.includes('number')) &&
            typeof value === 'number') {
            if (value < 0) {
                return `Column '${fieldName}' must be a positive number`;
            }
        }

        return null;
    }

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid email
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate URL format
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid URL
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get table schema from database
     * @param {string} table - Table name
     * @returns {object} Table schema
     */
    async getTableSchema(table) {
        // Check cache first
        if (this.schemaCache.has(table)) {
            return this.schemaCache.get(table);
        }

        // Query information schema
        const query = `
            SELECT
                column_name,
                data_type,
                character_maximum_length,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
        `;

        const result = await this.db.query(query, [table]);

        const schema = {
            table: table,
            columns: result.rows
        };

        // Cache schema for future use
        this.schemaCache.set(table, schema);

        return schema;
    }

    /**
     * Clear schema cache (useful after schema changes)
     * @param {string} table - Table name (optional, clears all if not provided)
     */
    clearSchemaCache(table = null) {
        if (table) {
            this.schemaCache.delete(table);
        } else {
            this.schemaCache.clear();
        }
    }

    /**
     * Validate foreign key references
     * @param {string} table - Table name
     * @param {object} data - Data to validate
     * @returns {object} Validation result
     */
    async validateForeignKeys(table, data) {
        const errors = [];

        // Get foreign key constraints
        const fkQuery = `
            SELECT
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_name = $1
        `;

        const fkResult = await this.db.query(fkQuery, [table]);

        // Validate each foreign key
        for (const fk of fkResult.rows) {
            const columnName = fk.column_name;
            const value = data[columnName];

            if (value !== null && value !== undefined) {
                // Check if referenced record exists
                const checkQuery = `
                    SELECT EXISTS(
                        SELECT 1 FROM ${fk.foreign_table_name}
                        WHERE ${fk.foreign_column_name} = $1
                    ) as exists
                `;

                const checkResult = await this.db.query(checkQuery, [value]);

                if (!checkResult.rows[0].exists) {
                    errors.push(
                        `Foreign key violation: ${columnName}=${value} does not exist in ${fk.foreign_table_name}.${fk.foreign_column_name}`
                    );
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate unique constraints
     * @param {string} table - Table name
     * @param {object} data - Data to validate
     * @param {string|number} excludeId - ID to exclude from uniqueness check (for updates)
     * @returns {object} Validation result
     */
    async validateUniqueConstraints(table, data, excludeId = null) {
        const errors = [];

        // Get unique constraints
        const uniqueQuery = `
            SELECT
                kcu.column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
                AND tc.table_name = $1
        `;

        const uniqueResult = await this.db.query(uniqueQuery, [table]);

        // Validate each unique constraint
        for (const constraint of uniqueResult.rows) {
            const columnName = constraint.column_name;
            const value = data[columnName];

            if (value !== null && value !== undefined) {
                let checkQuery = `
                    SELECT EXISTS(
                        SELECT 1 FROM ${table}
                        WHERE ${columnName} = $1
                `;

                const params = [value];

                if (excludeId) {
                    checkQuery += ` AND id != $2`;
                    params.push(excludeId);
                }

                checkQuery += `) as exists`;

                const checkResult = await this.db.query(checkQuery, params);

                if (checkResult.rows[0].exists) {
                    errors.push(
                        `Unique constraint violation: ${columnName}=${value} already exists in table ${table}`
                    );
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Perform comprehensive validation
     * @param {string} table - Table name
     * @param {object} data - Data to validate
     * @param {string} operation - Operation type ('insert' or 'update')
     * @param {string|number} recordId - Record ID for updates
     * @returns {object} Comprehensive validation result
     */
    async validateComprehensive(table, data, operation = 'insert', recordId = null) {
        const allErrors = [];

        // Schema validation
        const schemaResult = await this.validateRecordData(table, data, null, operation);
        if (!schemaResult.valid) {
            allErrors.push(...schemaResult.errors);
        }

        // Only do FK and unique validation if schema validation passed
        if (schemaResult.valid) {
            // Foreign key validation
            const fkResult = await this.validateForeignKeys(table, data);
            if (!fkResult.valid) {
                allErrors.push(...fkResult.errors);
            }

            // Unique constraint validation (for inserts and updates)
            const uniqueResult = await this.validateUniqueConstraints(table, data, recordId);
            if (!uniqueResult.valid) {
                allErrors.push(...uniqueResult.errors);
            }
        }

        return {
            valid: allErrors.length === 0,
            errors: allErrors
        };
    }
}
