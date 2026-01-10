// src/mcps/workflow-manager-server/handlers/graph-handlers.js
// Graph-Based Workflow Operation Handlers - Node and edge manipulation (Migration 032 - FictionLab schema)

export class GraphHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleAddNode(args) {
        const { workflow_id, node_id, node_type, node_data } = args;

        // Get the current workflow definition
        const workflowResult = await this.db.query(
            `SELECT workflow_id, version, graph_json FROM fictionlab.workflow_definitions
            WHERE workflow_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [workflow_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_id} not found`);
        }

        const workflow = workflowResult.rows[0];
        const graphJson = workflow.graph_json || { nodes: [], edges: [] };

        // Check if node already exists
        const existingNodeIndex = graphJson.nodes.findIndex(n => String(n.id) === String(node_id));
        if (existingNodeIndex !== -1) {
            throw new Error(`Node ${node_id} already exists in workflow ${workflow_id}`);
        }

        // Build complete node object
        const newNode = {
            id: node_id,
            type: node_type,
            ...node_data
        };

        // Add node to graph
        graphJson.nodes.push(newNode);

        // Update the workflow definition
        await this.db.query(
            `UPDATE fictionlab.workflow_definitions
            SET graph_json = $1, updated_at = NOW()
            WHERE workflow_id = $2 AND version = $3`,
            [JSON.stringify(graphJson), workflow_id, workflow.version]
        );

        return {
            success: true,
            workflow_id,
            node_id,
            message: `Node ${node_id} added to workflow ${workflow_id}`,
            nodes_count: graphJson.nodes.length
        };
    }

    async handleUpdateNode(args) {
        const { workflow_id, node_id, updates } = args;

        // Get the current workflow definition
        const workflowResult = await this.db.query(
            `SELECT workflow_id, version, graph_json FROM fictionlab.workflow_definitions
            WHERE workflow_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [workflow_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_id} not found`);
        }

        const workflow = workflowResult.rows[0];
        const graphJson = workflow.graph_json || { nodes: [], edges: [] };

        // Find and update the node
        const nodeIndex = graphJson.nodes.findIndex(n => String(n.id) === String(node_id));
        if (nodeIndex === -1) {
            throw new Error(`Node ${node_id} not found in workflow ${workflow_id}`);
        }

        // Merge updates into existing node
        graphJson.nodes[nodeIndex] = {
            ...graphJson.nodes[nodeIndex],
            ...updates
        };

        // Update the workflow definition
        await this.db.query(
            `UPDATE fictionlab.workflow_definitions
            SET graph_json = $1, updated_at = NOW()
            WHERE workflow_id = $2 AND version = $3`,
            [JSON.stringify(graphJson), workflow_id, workflow.version]
        );

        return {
            success: true,
            workflow_id,
            node_id,
            message: `Node ${node_id} updated in workflow ${workflow_id}`
        };
    }

    async handleDeleteNode(args) {
        const { workflow_id, node_id } = args;

        // Get the current workflow definition
        const workflowResult = await this.db.query(
            `SELECT workflow_id, version, graph_json FROM fictionlab.workflow_definitions
            WHERE workflow_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [workflow_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_id} not found`);
        }

        const workflow = workflowResult.rows[0];
        const graphJson = workflow.graph_json || { nodes: [], edges: [] };

        // Remove the node
        graphJson.nodes = graphJson.nodes.filter(n => String(n.id) !== String(node_id));

        // Remove all edges connected to this node
        graphJson.edges = graphJson.edges.filter(
            e => String(e.source) !== String(node_id) && String(e.target) !== String(node_id)
        );

        // Update the workflow definition
        await this.db.query(
            `UPDATE fictionlab.workflow_definitions
            SET graph_json = $1, updated_at = NOW()
            WHERE workflow_id = $2 AND version = $3`,
            [JSON.stringify(graphJson), workflow_id, workflow.version]
        );

        return {
            success: true,
            workflow_id,
            node_id,
            message: `Node ${node_id} and connected edges deleted from workflow ${workflow_id}`,
            nodes_count: graphJson.nodes.length,
            edges_count: graphJson.edges.length
        };
    }

    async handleCreateEdge(args) {
        const { workflow_id, edge_id, source_node_id, target_node_id, edge_type, label, condition } = args;

        // Get the current workflow definition
        const workflowResult = await this.db.query(
            `SELECT workflow_id, version, graph_json FROM fictionlab.workflow_definitions
            WHERE workflow_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [workflow_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_id} not found`);
        }

        const workflow = workflowResult.rows[0];
        const graphJson = workflow.graph_json || { nodes: [], edges: [] };

        // Verify source and target nodes exist
        const sourceExists = graphJson.nodes.some(n => String(n.id) === String(source_node_id));
        const targetExists = graphJson.nodes.some(n => String(n.id) === String(target_node_id));

        if (!sourceExists || !targetExists) {
            throw new Error(`Source or target node not found`);
        }

        // Check if edge already exists
        const existingEdge = graphJson.edges.find(e => e.id === edge_id);
        if (existingEdge) {
            throw new Error(`Edge ${edge_id} already exists`);
        }

        // Create new edge
        const newEdge = {
            id: edge_id,
            source: source_node_id,
            target: target_node_id,
            type: edge_type || 'default'
        };

        if (label) newEdge.label = label;
        if (condition) newEdge.condition = condition;

        graphJson.edges.push(newEdge);

        // Update the workflow definition
        await this.db.query(
            `UPDATE fictionlab.workflow_definitions
            SET graph_json = $1, updated_at = NOW()
            WHERE workflow_id = $2 AND version = $3`,
            [JSON.stringify(graphJson), workflow_id, workflow.version]
        );

        return {
            success: true,
            workflow_id,
            edge_id,
            message: `Edge ${edge_id} created in workflow ${workflow_id}`,
            edges_count: graphJson.edges.length
        };
    }

    async handleUpdateEdge(args) {
        const { workflow_id, edge_id, updates } = args;

        // Get the current workflow definition
        const workflowResult = await this.db.query(
            `SELECT workflow_id, version, graph_json FROM fictionlab.workflow_definitions
            WHERE workflow_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [workflow_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_id} not found`);
        }

        const workflow = workflowResult.rows[0];
        const graphJson = workflow.graph_json || { nodes: [], edges: [] };

        // Find and update the edge
        const edgeIndex = graphJson.edges.findIndex(e => e.id === edge_id);
        if (edgeIndex === -1) {
            throw new Error(`Edge ${edge_id} not found in workflow ${workflow_id}`);
        }

        // Merge updates into existing edge
        graphJson.edges[edgeIndex] = {
            ...graphJson.edges[edgeIndex],
            ...updates
        };

        // Update the workflow definition
        await this.db.query(
            `UPDATE fictionlab.workflow_definitions
            SET graph_json = $1, updated_at = NOW()
            WHERE workflow_id = $2 AND version = $3`,
            [JSON.stringify(graphJson), workflow_id, workflow.version]
        );

        return {
            success: true,
            workflow_id,
            edge_id,
            message: `Edge ${edge_id} updated in workflow ${workflow_id}`
        };
    }

    async handleDeleteEdge(args) {
        const { workflow_id, edge_id } = args;

        // Get the current workflow definition
        const workflowResult = await this.db.query(
            `SELECT workflow_id, version, graph_json FROM fictionlab.workflow_definitions
            WHERE workflow_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [workflow_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_id} not found`);
        }

        const workflow = workflowResult.rows[0];
        const graphJson = workflow.graph_json || { nodes: [], edges: [] };

        // Remove the edge
        graphJson.edges = graphJson.edges.filter(e => e.id !== edge_id);

        // Update the workflow definition
        await this.db.query(
            `UPDATE fictionlab.workflow_definitions
            SET graph_json = $1, updated_at = NOW()
            WHERE workflow_id = $2 AND version = $3`,
            [JSON.stringify(graphJson), workflow_id, workflow.version]
        );

        return {
            success: true,
            workflow_id,
            edge_id,
            message: `Edge ${edge_id} deleted from workflow ${workflow_id}`,
            edges_count: graphJson.edges.length
        };
    }
}
