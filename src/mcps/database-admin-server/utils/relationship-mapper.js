// src/mcps/database-admin-server/utils/relationship-mapper.js
// Foreign key relationship mapping with multi-hop discovery

export class RelationshipMapper {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all foreign key relationships for a table
     * @param {string} table - Table name
     * @param {number} depth - How many levels to traverse (1-3)
     * @returns {Promise<Object>} - Relationship map with parents and children
     */
    async getRelationships(table, depth = 1) {
        // Validate depth
        if (depth < 1 || depth > 3) {
            throw new Error('Depth must be between 1 and 3');
        }

        const relationships = {
            table,
            depth,
            parents: [],   // Tables this table references (via foreign keys)
            children: []   // Tables that reference this table
        };

        // Track visited tables to avoid circular references
        const visited = new Set([table]);

        // Get direct relationships
        await this._getDirectRelationships(table, relationships, visited);

        // Get deeper relationships if depth > 1
        if (depth > 1) {
            await this._getNestedRelationships(relationships, depth, visited);
        }

        return relationships;
    }

    /**
     * Get direct parent and child relationships for a table
     * @private
     */
    async _getDirectRelationships(table, relationships, visited) {
        // Query for foreign keys FROM this table (parents)
        const parentsQuery = `
            SELECT
                tc.constraint_name,
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
                AND tc.table_schema = 'public'
            ORDER BY kcu.column_name;
        `;

        const parentsResult = await this.db.query(parentsQuery, [table]);

        for (const row of parentsResult.rows) {
            relationships.parents.push({
                constraint_name: row.constraint_name,
                column: row.column_name,
                references_table: row.foreign_table_name,
                references_column: row.foreign_column_name,
                type: 'foreign_key'
            });
        }

        // Query for foreign keys TO this table (children)
        const childrenQuery = `
            SELECT
                tc.table_name AS child_table,
                tc.constraint_name,
                kcu.column_name AS child_column,
                ccu.column_name AS parent_column
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_name = $1
                AND tc.table_schema = 'public'
            ORDER BY tc.table_name, kcu.column_name;
        `;

        const childrenResult = await this.db.query(childrenQuery, [table]);

        for (const row of childrenResult.rows) {
            relationships.children.push({
                constraint_name: row.constraint_name,
                table: row.child_table,
                column: row.child_column,
                references_column: row.parent_column,
                type: 'foreign_key'
            });
        }
    }

    /**
     * Get nested relationships (multi-hop discovery)
     * @private
     */
    async _getNestedRelationships(relationships, maxDepth, visited) {
        let currentDepth = 1;

        while (currentDepth < maxDepth) {
            const tablesToExplore = new Set();

            // Collect tables from current level parents
            for (const parent of relationships.parents) {
                if (parent.depth === currentDepth || !parent.depth) {
                    if (!parent.depth) parent.depth = 1;
                    if (!visited.has(parent.references_table)) {
                        tablesToExplore.add(parent.references_table);
                    }
                }
            }

            // Collect tables from current level children
            for (const child of relationships.children) {
                if (child.depth === currentDepth || !child.depth) {
                    if (!child.depth) child.depth = 1;
                    if (!visited.has(child.table)) {
                        tablesToExplore.add(child.table);
                    }
                }
            }

            if (tablesToExplore.size === 0) {
                break; // No more tables to explore
            }

            // Explore each table
            for (const tableName of tablesToExplore) {
                visited.add(tableName);
                const nestedRels = {
                    parents: [],
                    children: []
                };

                await this._getDirectRelationships(tableName, nestedRels, visited);

                // Add nested parents
                for (const parent of nestedRels.parents) {
                    parent.depth = currentDepth + 1;
                    parent.via_table = tableName;
                    relationships.parents.push(parent);
                }

                // Add nested children
                for (const child of nestedRels.children) {
                    child.depth = currentDepth + 1;
                    child.via_table = tableName;
                    relationships.children.push(child);
                }
            }

            currentDepth++;
        }
    }

    /**
     * Get a simple relationship graph for visualization
     * @param {string} table - Starting table
     * @param {number} depth - Depth to traverse
     * @returns {Promise<Object>} - Simplified graph structure
     */
    async getRelationshipGraph(table, depth = 1) {
        const relationships = await this.getRelationships(table, depth);

        // Build a graph structure
        const graph = {
            nodes: new Set([table]),
            edges: []
        };

        // Add parent relationships
        for (const parent of relationships.parents) {
            graph.nodes.add(parent.references_table);
            graph.edges.push({
                from: table,
                to: parent.references_table,
                column: parent.column,
                type: 'references',
                depth: parent.depth || 1
            });
        }

        // Add child relationships
        for (const child of relationships.children) {
            graph.nodes.add(child.table);
            graph.edges.push({
                from: child.table,
                to: table,
                column: child.column,
                type: 'referenced_by',
                depth: child.depth || 1
            });
        }

        return {
            nodes: Array.from(graph.nodes),
            edges: graph.edges,
            center: table
        };
    }

    /**
     * Find the path between two tables through relationships
     * @param {string} fromTable - Starting table
     * @param {string} toTable - Target table
     * @param {number} maxDepth - Maximum depth to search
     * @returns {Promise<Array|null>} - Array of tables in path, or null if no path found
     */
    async findPath(fromTable, toTable, maxDepth = 3) {
        if (fromTable === toTable) {
            return [fromTable];
        }

        const visited = new Set();
        const queue = [[fromTable]];

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (path.length > maxDepth) {
                continue;
            }

            if (visited.has(current)) {
                continue;
            }

            visited.add(current);

            // Get direct relationships
            const rels = {
                parents: [],
                children: []
            };
            await this._getDirectRelationships(current, rels, new Set());

            // Check parents
            for (const parent of rels.parents) {
                if (parent.references_table === toTable) {
                    return [...path, toTable];
                }
                if (!visited.has(parent.references_table)) {
                    queue.push([...path, parent.references_table]);
                }
            }

            // Check children
            for (const child of rels.children) {
                if (child.table === toTable) {
                    return [...path, toTable];
                }
                if (!visited.has(child.table)) {
                    queue.push([...path, child.table]);
                }
            }
        }

        return null; // No path found
    }
}
