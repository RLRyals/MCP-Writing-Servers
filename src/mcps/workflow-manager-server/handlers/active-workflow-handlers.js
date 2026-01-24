// src/mcps/workflow-manager-server/handlers/active-workflow-handlers.js
// Active Workflow Registry Management Handlers (Migration 032 - FictionLab schema)

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
                awr.workflow_id,
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
                awr.completed_node_ids,
                awr.started_at,
                awr.updated_at,
                awr.metadata,
                awr.breadcrumb,
                awr.parent_workflow_id,
                COALESCE(
                    NULLIF(awr.available_nodes, '[]'::jsonb),
                    (SELECT jsonb_agg(jsonb_build_object('id', n->>'id', 'name', COALESCE(n->>'name', n->'data'->>'name', n->>'id')))
                     FROM jsonb_array_elements(wd.graph_json->'nodes') n),
                    '[]'::jsonb
                ) as available_nodes
            FROM fictionlab.active_workflows awr
            LEFT JOIN fictionlab.workflow_definitions wd ON awr.workflow_id = wd.workflow_id
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
            workflow_id,
            workflow_name,
            source,
            project_folder,
            project_name,
            total_nodes = 0,
            available_nodes,
            parent_workflow_id,
            metadata = {}
        } = args;

        // Validate source
        const validSources = ['fictionlab_ui', 'claude_code', 'typingmind'];
        if (!validSources.includes(source)) {
            throw new Error(`Invalid source: ${source}. Must be one of: ${validSources.join(', ')}`);
        }

        // Get workflow name, total_nodes, and available_nodes from definition if not provided
        let resolvedWorkflowName = workflow_name;
        let resolvedTotalNodes = total_nodes;
        let resolvedAvailableNodes = available_nodes || [];

        if (!resolvedWorkflowName || resolvedTotalNodes === 0 || resolvedAvailableNodes.length === 0) {
            const defResult = await this.db.query(
                `SELECT name, graph_json FROM fictionlab.workflow_definitions WHERE workflow_id = $1 LIMIT 1`,
                [workflow_id]
            );

            if (defResult.rows.length > 0) {
                const graphNodes = defResult.rows[0].graph_json?.nodes || [];

                if (!resolvedWorkflowName) {
                    resolvedWorkflowName = defResult.rows[0].name;
                }
                if (resolvedTotalNodes === 0) {
                    resolvedTotalNodes = graphNodes.length;
                }
                if (resolvedAvailableNodes.length === 0 && graphNodes.length > 0) {
                    resolvedAvailableNodes = graphNodes.map(n => ({
                        id: n.id,
                        name: n.name || n.data?.name || n.id
                    }));
                }
            }
        }

        const result = await this.db.query(
            `INSERT INTO fictionlab.active_workflows (
                workflow_id,
                workflow_name,
                source,
                project_folder,
                project_name,
                total_nodes,
                available_nodes,
                parent_workflow_id,
                metadata,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'running')
            RETURNING id, started_at`,
            [workflow_id, resolvedWorkflowName, source, project_folder, project_name, resolvedTotalNodes, JSON.stringify(resolvedAvailableNodes), parent_workflow_id || null, metadata]
        );

        return {
            registry_id: result.rows[0].id,
            workflow_id,
            workflow_name: resolvedWorkflowName,
            source,
            total_nodes: resolvedTotalNodes,
            available_nodes: resolvedAvailableNodes,
            parent_workflow_id: parent_workflow_id || null,
            started_at: result.rows[0].started_at,
            message: `Workflow registered successfully from ${source}`
        };
    }

    /**
     * Update workflow progress (current node, percent complete, breadcrumb for nested workflows)
     */
    async handleUpdateWorkflowProgress(args) {
        const {
            registry_id,
            current_node_id,
            current_node_name,
            progress_percent,
            completed_nodes,
            breadcrumb,
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

        // Handle breadcrumb - can be JSON string or already parsed
        if (breadcrumb !== undefined) {
            updates.push(`breadcrumb = $${paramIndex}`);
            // Parse if string, otherwise use as-is
            const breadcrumbValue = typeof breadcrumb === 'string' ? JSON.parse(breadcrumb) : breadcrumb;
            params.push(JSON.stringify(breadcrumbValue));
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
            `UPDATE fictionlab.active_workflows
            SET ${updates.join(', ')}
            WHERE id = $1 AND status IN ('running', 'paused')
            RETURNING id, current_node_id, current_node_name, progress_percent, completed_nodes, breadcrumb, updated_at`,
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
            `UPDATE fictionlab.active_workflows
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
            `UPDATE fictionlab.active_workflows
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
            `UPDATE fictionlab.active_workflows
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
            `UPDATE fictionlab.active_workflows
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
            `UPDATE fictionlab.active_workflows
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
            `SELECT awr.id, awr.workflow_id, wd.graph_json
            FROM fictionlab.active_workflows awr
            LEFT JOIN fictionlab.workflow_definitions wd ON awr.workflow_id = wd.workflow_id
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
            `UPDATE fictionlab.active_workflows
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
                awr.id,
                awr.workflow_id,
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
                awr.completed_node_ids,
                awr.started_at,
                awr.updated_at,
                awr.completed_at,
                awr.error_message,
                awr.metadata,
                awr.breadcrumb,
                awr.parent_workflow_id,
                wd.graph_json,
                COALESCE(
                    (SELECT jsonb_agg(jsonb_build_object('id', n->>'id', 'name', COALESCE(n->'data'->>'name', n->>'id')))
                     FROM jsonb_array_elements(wd.graph_json->'nodes') n),
                    '[]'::jsonb
                ) as available_nodes
            FROM fictionlab.active_workflows awr
            LEFT JOIN fictionlab.workflow_definitions wd ON awr.workflow_id = wd.workflow_id
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
            `DELETE FROM fictionlab.active_workflows
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

    /**
     * Mark a node as started (sets it as current node)
     * Called BEFORE executing a node to indicate work is beginning
     */
    async handleMarkNodeStarted(args) {
        const { registry_id, node_id, node_name } = args;

        if (!registry_id || !node_id) {
            throw new Error('registry_id and node_id are required');
        }

        const result = await this.db.query(
            `UPDATE fictionlab.active_workflows
            SET current_node_id = $2,
                current_node_name = $3,
                status = 'running'
            WHERE id = $1 AND status IN ('running', 'paused')
            RETURNING id, current_node_id, current_node_name, updated_at`,
            [registry_id, node_id, node_name || node_id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Active workflow ${registry_id} not found or not active`);
        }

        return {
            registry_id,
            node_id,
            node_name: result.rows[0].current_node_name,
            updated_at: result.rows[0].updated_at,
            message: `Node ${node_name || node_id} marked as started`
        };
    }

    /**
     * Mark a node as completed (adds to completed_node_ids array)
     * Called AFTER a node finishes execution successfully
     */
    async handleMarkNodeCompleted(args) {
        const { registry_id, node_id } = args;

        if (!registry_id || !node_id) {
            throw new Error('registry_id and node_id are required');
        }

        // Use jsonb array append, avoiding duplicates
        const result = await this.db.query(
            `UPDATE fictionlab.active_workflows
            SET completed_node_ids = CASE
                    WHEN NOT (completed_node_ids @> to_jsonb($2::text))
                    THEN completed_node_ids || to_jsonb($2::text)
                    ELSE completed_node_ids
                END,
                completed_nodes = (
                    SELECT jsonb_array_length(
                        CASE
                            WHEN NOT (completed_node_ids @> to_jsonb($2::text))
                            THEN completed_node_ids || to_jsonb($2::text)
                            ELSE completed_node_ids
                        END
                    )
                )
            WHERE id = $1 AND status IN ('running', 'paused')
            RETURNING id, completed_node_ids, completed_nodes, updated_at`,
            [registry_id, node_id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Active workflow ${registry_id} not found or not active`);
        }

        // Calculate progress based on total nodes
        const totalNodesResult = await this.db.query(
            `SELECT total_nodes FROM fictionlab.active_workflows WHERE id = $1`,
            [registry_id]
        );

        const totalNodes = totalNodesResult.rows[0]?.total_nodes || 1;
        const completedNodes = result.rows[0].completed_nodes;
        const progressPercent = Math.round((completedNodes / totalNodes) * 100);

        // Update progress percent
        await this.db.query(
            `UPDATE fictionlab.active_workflows SET progress_percent = $2 WHERE id = $1`,
            [registry_id, Math.min(100, progressPercent)]
        );

        return {
            registry_id,
            node_id,
            completed_node_ids: result.rows[0].completed_node_ids,
            completed_nodes: completedNodes,
            progress_percent: Math.min(100, progressPercent),
            updated_at: result.rows[0].updated_at,
            message: `Node ${node_id} marked as completed`
        };
    }
}
