// src/mcps/workflow-manager-server/handlers/active-workflow-handlers.js
// Active Workflow Registry Management Handlers (Migration 031)

export class ActiveWorkflowHandlers {
    constructor(db) {
        this.db = db;
    }

    /**
     * List all active workflows (running or paused)
     * Optionally filter by status or source
     */
    async handleListActiveWorkflows(args) {
        const { status, source, include_completed = false } = args || {};

        let whereConditions = [];
        const params = [];
        let paramIndex = 1;

        // By default, only show running/paused unless include_completed is true
        if (!include_completed) {
            whereConditions.push(`status IN ('running', 'paused')`);
        }

        if (status) {
            whereConditions.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        if (source) {
            whereConditions.push(`source = $${paramIndex}`);
            params.push(source);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        const result = await this.db.query(
            `SELECT
                awr.id,
                awr.workflow_def_id,
                COALESCE(awr.workflow_name, wd.name) as workflow_name,
                awr.source,
                awr.project_folder,
                awr.project_name,
                awr.current_node_id,
                awr.current_node_name,
                awr.status,
                awr.progress_percent,
                awr.total_nodes,
                awr.completed_nodes,
                awr.started_at,
                awr.updated_at,
                awr.metadata,
                COALESCE(
                    (SELECT jsonb_agg(jsonb_build_object('id', n->>'id', 'name', COALESCE(n->'data'->>'name', n->>'id')))
                     FROM jsonb_array_elements(wd.graph_json->'nodes') n),
                    '[]'::jsonb
                ) as available_nodes
            FROM active_workflow_registry awr
            LEFT JOIN workflow_definitions wd ON awr.workflow_def_id = wd.id
            ${whereClause}
            ORDER BY awr.started_at DESC`,
            params
        );

        return result.rows;
    }

    /**
     * Register a new active workflow from any source
     */
    async handleRegisterActiveWorkflow(args) {
        const {
            workflow_def_id,
            workflow_name,
            source,
            project_folder,
            project_name,
            total_nodes = 0,
            metadata = {}
        } = args;

        // Validate source
        const validSources = ['fictionlab_ui', 'claude_code', 'typingmind'];
        if (!validSources.includes(source)) {
            throw new Error(`Invalid source: ${source}. Must be one of: ${validSources.join(', ')}`);
        }

        // Get workflow name from definition if not provided
        let resolvedWorkflowName = workflow_name;
        let resolvedTotalNodes = total_nodes;

        if (!resolvedWorkflowName || resolvedTotalNodes === 0) {
            const defResult = await this.db.query(
                `SELECT name, graph_json FROM workflow_definitions WHERE id = $1 LIMIT 1`,
                [workflow_def_id]
            );

            if (defResult.rows.length > 0) {
                if (!resolvedWorkflowName) {
                    resolvedWorkflowName = defResult.rows[0].name;
                }
                if (resolvedTotalNodes === 0 && defResult.rows[0].graph_json?.nodes) {
                    resolvedTotalNodes = defResult.rows[0].graph_json.nodes.length;
                }
            }
        }

        const result = await this.db.query(
            `INSERT INTO active_workflow_registry (
                workflow_def_id,
                workflow_name,
                source,
                project_folder,
                project_name,
                total_nodes,
                metadata,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'running')
            RETURNING id, started_at`,
            [workflow_def_id, resolvedWorkflowName, source, project_folder, project_name, resolvedTotalNodes, metadata]
        );

        return {
            registry_id: result.rows[0].id,
            workflow_def_id,
            workflow_name: resolvedWorkflowName,
            source,
            started_at: result.rows[0].started_at,
            message: `Workflow registered successfully from ${source}`
        };
    }

    /**
     * Update workflow progress (current node, percent complete, etc.)
     */
    async handleUpdateWorkflowProgress(args) {
        const {
            registry_id,
            current_node_id,
            current_node_name,
            progress_percent,
            completed_nodes,
            metadata
        } = args;

        // Build dynamic update query
        const updates = [];
        const params = [registry_id];
        let paramIndex = 2;

        if (current_node_id !== undefined) {
            updates.push(`current_node_id = $${paramIndex}`);
            params.push(current_node_id);
            paramIndex++;
        }

        if (current_node_name !== undefined) {
            updates.push(`current_node_name = $${paramIndex}`);
            params.push(current_node_name);
            paramIndex++;
        }

        if (progress_percent !== undefined) {
            updates.push(`progress_percent = $${paramIndex}`);
            params.push(Math.min(100, Math.max(0, progress_percent)));
            paramIndex++;
        }

        if (completed_nodes !== undefined) {
            updates.push(`completed_nodes = $${paramIndex}`);
            params.push(completed_nodes);
            paramIndex++;
        }

        if (metadata !== undefined) {
            updates.push(`metadata = metadata || $${paramIndex}`);
            params.push(metadata);
            paramIndex++;
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        const result = await this.db.query(
            `UPDATE active_workflow_registry
            SET ${updates.join(', ')}
            WHERE id = $1 AND status IN ('running', 'paused')
            RETURNING id, current_node_id, current_node_name, progress_percent, completed_nodes, updated_at`,
            params
        );

        if (result.rows.length === 0) {
            throw new Error(`Active workflow ${registry_id} not found or already completed`);
        }

        return {
            registry_id,
            ...result.rows[0],
            message: 'Workflow progress updated'
        };
    }

    /**
     * Pause a running workflow
     */
    async handlePauseWorkflow(args) {
        const { registry_id } = args;

        const result = await this.db.query(
            `UPDATE active_workflow_registry
            SET status = 'paused'
            WHERE id = $1 AND status = 'running'
            RETURNING id, workflow_name, status, updated_at`,
            [registry_id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Workflow ${registry_id} not found or not running`);
        }

        return {
            registry_id,
            workflow_name: result.rows[0].workflow_name,
            status: 'paused',
            updated_at: result.rows[0].updated_at,
            message: 'Workflow paused successfully'
        };
    }

    /**
     * Resume a paused workflow
     */
    async handleResumeWorkflow(args) {
        const { registry_id } = args;

        const result = await this.db.query(
            `UPDATE active_workflow_registry
            SET status = 'running'
            WHERE id = $1 AND status = 'paused'
            RETURNING id, workflow_name, status, updated_at`,
            [registry_id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Workflow ${registry_id} not found or not paused`);
        }

        return {
            registry_id,
            workflow_name: result.rows[0].workflow_name,
            status: 'running',
            updated_at: result.rows[0].updated_at,
            message: 'Workflow resumed successfully'
        };
    }

    /**
     * Cancel a workflow (can cancel running or paused)
     */
    async handleCancelWorkflow(args) {
        const { registry_id, reason } = args;

        const result = await this.db.query(
            `UPDATE active_workflow_registry
            SET status = 'cancelled',
                completed_at = NOW(),
                metadata = metadata || $2
            WHERE id = $1 AND status IN ('running', 'paused')
            RETURNING id, workflow_name, status, completed_at`,
            [registry_id, reason ? { cancel_reason: reason } : {}]
        );

        if (result.rows.length === 0) {
            throw new Error(`Workflow ${registry_id} not found or already completed`);
        }

        return {
            registry_id,
            workflow_name: result.rows[0].workflow_name,
            status: 'cancelled',
            completed_at: result.rows[0].completed_at,
            message: 'Workflow cancelled successfully'
        };
    }

    /**
     * Mark workflow as completed successfully
     */
    async handleCompleteWorkflow(args) {
        const { registry_id, final_metadata } = args;

        const result = await this.db.query(
            `UPDATE active_workflow_registry
            SET status = 'completed',
                progress_percent = 100,
                completed_at = NOW(),
                metadata = metadata || $2
            WHERE id = $1 AND status IN ('running', 'paused')
            RETURNING id, workflow_name, status, completed_at, completed_nodes, total_nodes`,
            [registry_id, final_metadata || {}]
        );

        if (result.rows.length === 0) {
            throw new Error(`Workflow ${registry_id} not found or already completed`);
        }

        return {
            registry_id,
            workflow_name: result.rows[0].workflow_name,
            status: 'completed',
            completed_at: result.rows[0].completed_at,
            completed_nodes: result.rows[0].completed_nodes,
            total_nodes: result.rows[0].total_nodes,
            message: 'Workflow completed successfully'
        };
    }

    /**
     * Mark workflow as failed with error information
     */
    async handleFailWorkflow(args) {
        const { registry_id, error_message, error_details } = args;

        const metadata = error_details ? { error_details } : {};

        const result = await this.db.query(
            `UPDATE active_workflow_registry
            SET status = 'failed',
                error_message = $2,
                completed_at = NOW(),
                metadata = metadata || $3
            WHERE id = $1 AND status IN ('running', 'paused')
            RETURNING id, workflow_name, status, error_message, completed_at, current_node_id, current_node_name`,
            [registry_id, error_message, metadata]
        );

        if (result.rows.length === 0) {
            throw new Error(`Workflow ${registry_id} not found or already completed`);
        }

        return {
            registry_id,
            workflow_name: result.rows[0].workflow_name,
            status: 'failed',
            error_message: result.rows[0].error_message,
            failed_at_node: result.rows[0].current_node_name || result.rows[0].current_node_id,
            completed_at: result.rows[0].completed_at,
            message: 'Workflow marked as failed'
        };
    }

    /**
     * Jump to a specific node in the workflow
     * This updates the current position without actually executing
     */
    async handleJumpToNode(args) {
        const { registry_id, node_id, node_name } = args;

        // First verify the node exists in the workflow
        const workflowResult = await this.db.query(
            `SELECT awr.id, awr.workflow_def_id, wd.graph_json
            FROM active_workflow_registry awr
            LEFT JOIN workflow_definitions wd ON awr.workflow_def_id = wd.id
            WHERE awr.id = $1 AND awr.status IN ('running', 'paused')`,
            [registry_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Active workflow ${registry_id} not found or not active`);
        }

        const graphJson = workflowResult.rows[0].graph_json;
        let resolvedNodeName = node_name;

        // Validate node exists in graph if graph is available
        if (graphJson?.nodes) {
            const node = graphJson.nodes.find(n => n.id === node_id);
            if (!node) {
                throw new Error(`Node ${node_id} not found in workflow graph`);
            }
            if (!resolvedNodeName) {
                resolvedNodeName = node.data?.name || node_id;
            }
        }

        // Update current position
        const result = await this.db.query(
            `UPDATE active_workflow_registry
            SET current_node_id = $2,
                current_node_name = $3,
                metadata = metadata || $4
            WHERE id = $1
            RETURNING id, current_node_id, current_node_name, updated_at`,
            [registry_id, node_id, resolvedNodeName, { jumped_to_node: true, jump_timestamp: new Date().toISOString() }]
        );

        return {
            registry_id,
            node_id,
            node_name: resolvedNodeName,
            updated_at: result.rows[0].updated_at,
            message: `Jumped to node: ${resolvedNodeName || node_id}`
        };
    }

    /**
     * Get a single active workflow by ID with full details
     */
    async handleGetActiveWorkflow(args) {
        const { registry_id } = args;

        const result = await this.db.query(
            `SELECT
                awr.*,
                COALESCE(awr.workflow_name, wd.name) as workflow_name,
                wd.graph_json,
                COALESCE(
                    (SELECT jsonb_agg(jsonb_build_object('id', n->>'id', 'name', COALESCE(n->'data'->>'name', n->>'id')))
                     FROM jsonb_array_elements(wd.graph_json->'nodes') n),
                    '[]'::jsonb
                ) as available_nodes
            FROM active_workflow_registry awr
            LEFT JOIN workflow_definitions wd ON awr.workflow_def_id = wd.id
            WHERE awr.id = $1`,
            [registry_id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Workflow ${registry_id} not found`);
        }

        return result.rows[0];
    }

    /**
     * Clean up old completed/failed/cancelled workflows
     * Useful for maintenance
     */
    async handleCleanupOldWorkflows(args) {
        const { older_than_days = 30 } = args || {};

        const result = await this.db.query(
            `DELETE FROM active_workflow_registry
            WHERE status IN ('completed', 'failed', 'cancelled')
            AND completed_at < NOW() - INTERVAL '1 day' * $1
            RETURNING id`,
            [older_than_days]
        );

        return {
            deleted_count: result.rowCount,
            message: `Cleaned up ${result.rowCount} old workflow records older than ${older_than_days} days`
        };
    }
}
