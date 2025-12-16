// src/mcps/database-admin-server/utils/access-control.js
// Access Control System for Database Operations
// Implements table-level permissions and operation controls

/**
 * Access Control Matrix
 * Defines which operations are allowed on which tables
 */
export const ACCESS_CONTROL = {
    // Tables that allow READ operations
    read: [
        'authors', 'series', 'books', 'chapters', 'scenes',
        'characters', 'character_arcs', 'character_relationships', 'character_timeline_events', 'character_knowledge',
        'locations', 'world_elements', 'organizations',
        'plot_threads', 'tropes', 'genres', 'lookup_values',
        'series_genres', 'book_genres', 'book_tropes', 'character_scenes',
        'writing_sessions', 'exports',
        'projects',  // Project folder references
        'audit_logs',  // Audit logs can be read for compliance
        'migrations',  // Migration tracking
        // NPE tables
        'npe_causality_chains', 'npe_causal_links', 'npe_character_decisions', 'npe_scene_validation',
        'npe_pacing_analysis', 'npe_stakes_pressure', 'npe_information_economy', 'npe_relationship_tension',
        'npe_compliance_summary',
        // Workflow tables
        'workflow_instances', 'workflow_phase_history', 'workflow_approvals', 'workflow_quality_gates',
        'production_metrics', 'daily_writing_stats', 'phase_performance', 'revision_passes', 'qa_reports',
        'workflow_definitions', 'workflow_versions', 'workflow_version_locks', 'sub_workflow_executions',
        'workflow_imports'
    ],

    // Tables that allow WRITE operations (INSERT/UPDATE)
    write: [
        'authors', 'series', 'books', 'chapters', 'scenes',
        'characters', 'character_arcs', 'character_relationships', 'character_timeline_events', 'character_knowledge',
        'locations', 'world_elements', 'organizations',
        'plot_threads',
        'series_genres', 'book_genres', 'book_tropes', 'character_scenes',
        'writing_sessions', 'exports',
        'projects',  // Project folder references
        // NPE tables
        'npe_causality_chains', 'npe_causal_links', 'npe_character_decisions', 'npe_scene_validation',
        'npe_pacing_analysis', 'npe_stakes_pressure', 'npe_information_economy', 'npe_relationship_tension',
        'npe_compliance_summary',
        // Workflow tables
        'workflow_instances', 'workflow_phase_history', 'workflow_approvals', 'workflow_quality_gates',
        'production_metrics', 'daily_writing_stats', 'phase_performance', 'revision_passes', 'qa_reports',
        'workflow_definitions', 'workflow_versions', 'workflow_version_locks', 'sub_workflow_executions',
        'workflow_imports'
    ],

    // Tables that allow DELETE operations
    delete: [
        'books', 'chapters', 'scenes',
        'characters', 'character_arcs', 'character_relationships', 'character_timeline_events', 'character_knowledge',
        'locations', 'world_elements', 'organizations',
        'plot_threads',
        'series_genres', 'book_genres', 'book_tropes', 'character_scenes',
        'writing_sessions', 'exports',
        'projects',  // Project folder references
        // NPE tables
        'npe_causality_chains', 'npe_causal_links', 'npe_character_decisions', 'npe_scene_validation',
        'npe_pacing_analysis', 'npe_stakes_pressure', 'npe_information_economy', 'npe_relationship_tension',
        'npe_compliance_summary',
        // Workflow tables
        'workflow_instances', 'workflow_phase_history', 'workflow_approvals', 'workflow_quality_gates',
        'production_metrics', 'daily_writing_stats', 'phase_performance', 'revision_passes', 'qa_reports',
        'workflow_definitions', 'workflow_versions', 'workflow_version_locks', 'sub_workflow_executions',
        'workflow_imports'
    ],

    // Restricted tables - cannot be accessed at all
    restricted: [
        'users', 'auth_tokens', 'system_config'
    ],

    // Admin-only tables (future: will require admin role)
    adminOnly: [
        'system_settings'
    ]
};

/**
 * Operation types
 */
export const OPERATIONS = {
    READ: 'READ',
    WRITE: 'WRITE',  // Covers both INSERT and UPDATE
    DELETE: 'DELETE',
    INSERT: 'INSERT',
    UPDATE: 'UPDATE',
    BATCH_INSERT: 'BATCH_INSERT',
    BATCH_UPDATE: 'BATCH_UPDATE',
    BATCH_DELETE: 'BATCH_DELETE'
};

/**
 * AccessControl class
 * Validates table access permissions for database operations
 */
export class AccessControl {
    /**
     * Validate table access for a specific operation
     * @param {string} table - Table name to validate
     * @param {string} operation - Operation type (READ, WRITE, DELETE, INSERT, UPDATE)
     * @throws {Error} If access is denied
     */
    static validateTableAccess(table, operation) {
        if (!table || typeof table !== 'string') {
            throw new Error('Table name must be a non-empty string');
        }

        if (!operation || typeof operation !== 'string') {
            throw new Error('Operation must be a non-empty string');
        }

        // Normalize operation
        const normalizedOp = operation.toUpperCase();

        // Check if table is restricted
        if (ACCESS_CONTROL.restricted.includes(table)) {
            throw this.createAccessDeniedError(table, normalizedOp, 'This table is restricted and cannot be accessed');
        }

        // Check if table is admin-only (future: check user role)
        if (ACCESS_CONTROL.adminOnly.includes(table)) {
            throw this.createAccessDeniedError(table, normalizedOp, 'This table requires administrator privileges');
        }

        // Map operation to permission category
        const permissionCategory = this.mapOperationToPermission(normalizedOp);

        // Validate access based on permission category
        switch (permissionCategory) {
            case 'READ':
                if (!ACCESS_CONTROL.read.includes(table)) {
                    throw this.createAccessDeniedError(table, normalizedOp, 'READ permission denied');
                }
                break;

            case 'WRITE':
                if (!ACCESS_CONTROL.write.includes(table)) {
                    throw this.createAccessDeniedError(table, normalizedOp, 'WRITE permission denied');
                }
                break;

            case 'DELETE':
                if (!ACCESS_CONTROL.delete.includes(table)) {
                    throw this.createAccessDeniedError(table, normalizedOp, 'DELETE permission denied');
                }
                break;

            default:
                throw new Error(`Unknown operation type: ${normalizedOp}`);
        }

        return true;
    }

    /**
     * Map operation type to permission category
     * @param {string} operation - Operation type
     * @returns {string} Permission category (READ, WRITE, DELETE)
     */
    static mapOperationToPermission(operation) {
        const opMap = {
            'READ': 'READ',
            'QUERY': 'READ',
            'SELECT': 'READ',
            'INSERT': 'WRITE',
            'UPDATE': 'WRITE',
            'WRITE': 'WRITE',
            'BATCH_INSERT': 'WRITE',
            'BATCH_UPDATE': 'WRITE',
            'DELETE': 'DELETE',
            'BATCH_DELETE': 'DELETE'
        };

        const mapped = opMap[operation];
        if (!mapped) {
            throw new Error(`Cannot map operation '${operation}' to permission category`);
        }

        return mapped;
    }

    /**
     * Create a standardized access denied error
     * @param {string} table - Table name
     * @param {string} operation - Operation type
     * @param {string} reason - Reason for denial
     * @returns {Error} Access denied error
     */
    static createAccessDeniedError(table, operation, reason) {
        const error = new Error(
            `Access Denied: Cannot perform ${operation} on table '${table}'. ${reason}`
        );
        error.code = 'DB_403_ACCESS_DENIED';
        error.table = table;
        error.operation = operation;
        return error;
    }

    /**
     * Check if table allows a specific operation
     * @param {string} table - Table name
     * @param {string} operation - Operation type
     * @returns {boolean} True if operation is allowed
     */
    static isOperationAllowed(table, operation) {
        try {
            this.validateTableAccess(table, operation);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get allowed operations for a table
     * @param {string} table - Table name
     * @returns {object} Object with allowed operations
     */
    static getAllowedOperations(table) {
        return {
            canRead: ACCESS_CONTROL.read.includes(table),
            canWrite: ACCESS_CONTROL.write.includes(table),
            canDelete: ACCESS_CONTROL.delete.includes(table),
            isRestricted: ACCESS_CONTROL.restricted.includes(table),
            isAdminOnly: ACCESS_CONTROL.adminOnly.includes(table)
        };
    }

    /**
     * Get all tables with a specific permission
     * @param {string} permission - Permission type (read, write, delete)
     * @returns {string[]} Array of table names
     */
    static getTablesWithPermission(permission) {
        const permissionLower = permission.toLowerCase();
        if (!ACCESS_CONTROL[permissionLower]) {
            throw new Error(`Unknown permission type: ${permission}`);
        }
        return [...ACCESS_CONTROL[permissionLower]];
    }
}
