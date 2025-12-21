// src/mcps/workflow-manager-server/handlers/subworkflow-handlers.js
// Sub-Workflow Execution Handlers - Nested workflow support (Migration 028)

export class SubworkflowHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleStartSubWorkflow(args) {
        const {
            parent_instance_id,
            parent_phase_number,
            sub_workflow_def_id,
            sub_workflow_version
        } = args;

        const result = await this.db.query(
            `INSERT INTO sub_workflow_executions (
                parent_instance_id, parent_phase_number,
                sub_workflow_def_id, sub_workflow_version,
                status, started_at
            ) VALUES ($1, $2, $3, $4, 'in_progress', NOW())
            RETURNING id, started_at`,
            [parent_instance_id, parent_phase_number, sub_workflow_def_id, sub_workflow_version]
        );

        return {
            sub_workflow_execution_id: result.rows[0].id,
            status: 'in_progress',
            started_at: result.rows[0].started_at,
            message: `Sub-workflow ${sub_workflow_def_id} v${sub_workflow_version} started`
        };
    }

    async handleCompleteSubWorkflow(args) {
        const { sub_workflow_execution_id, output_json, error } = args;

        const status = error ? 'failed' : 'complete';

        const result = await this.db.query(
            `UPDATE sub_workflow_executions
            SET status = $1, completed_at = NOW(), output_json = $2, error = $3
            WHERE id = $4
            RETURNING parent_instance_id, parent_phase_number, sub_workflow_def_id`,
            [status, output_json, error, sub_workflow_execution_id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Sub-workflow execution ${sub_workflow_execution_id} not found`);
        }

        return {
            sub_workflow_execution_id,
            status,
            parent_instance_id: result.rows[0].parent_instance_id,
            parent_phase_number: result.rows[0].parent_phase_number,
            message: `Sub-workflow ${result.rows[0].sub_workflow_def_id} ${status}`
        };
    }

    async handleGetSubWorkflowStatus(args) {
        const { sub_workflow_execution_id, parent_instance_id } = args;

        let query;
        let params;

        if (sub_workflow_execution_id) {
            query = `SELECT * FROM sub_workflow_executions WHERE id = $1`;
            params = [sub_workflow_execution_id];
        } else if (parent_instance_id) {
            query = `SELECT * FROM sub_workflow_executions WHERE parent_instance_id = $1 ORDER BY started_at DESC`;
            params = [parent_instance_id];
        } else {
            throw new Error('Either sub_workflow_execution_id or parent_instance_id must be provided');
        }

        const result = await this.db.query(query, params);

        return sub_workflow_execution_id ? result.rows[0] : result.rows;
    }
}
