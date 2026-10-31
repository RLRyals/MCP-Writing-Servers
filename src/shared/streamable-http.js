// src/shared/streamable-http.js
// Stateless streamable-HTTP (MCP 2025-06-18) endpoint for an existing MCP server instance.
//
// Why stateless: a container restart (Update MCP-Writing-Servers) used to kill every
// `docker exec ... stdio-adapter.js` Claude Code session for good (stdio cannot resume,
// bead mws-10c). With no server-side session id there is nothing to lose on restart --
// the client's next POST just works, so an in-flight request is a dropped request the
// client retries instead of a dead process needing `/mcp` reconnect.
//
// Each request gets a throwaway protocol-level Server + transport whose handlers delegate
// to the long-lived BaseMCPServer instance (tools, handlers, shared DB pool), so concurrent
// requests never fight over one transport.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export function createRequestServer(mcpServer) {
    const server = new Server(
        { name: mcpServer.serverName, version: mcpServer.serverVersion },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpServer.tools }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const handler = mcpServer.getToolHandler(name);
            if (!handler) {
                throw new Error(`Unknown tool: ${name}`);
            }
            const result = await handler.call(mcpServer, args);
            return mcpServer.formatSuccess(result);
        } catch (error) {
            console.error(`[${mcpServer.serverName}] Error executing tool ${name}:`, error);
            return mcpServer.formatError(name, error);
        }
    });

    return server;
}

export async function handleStreamableHttpPost(mcpServer, req, res) {
    const server = createRequestServer(mcpServer);
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
    });
    res.on('close', () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
    });
    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error(`[${mcpServer.serverName}] streamable-http error:`, error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal server error' },
                id: null
            });
        }
    }
}

// Stateless servers have no server-initiated stream and no session to delete.
export function methodNotAllowed(req, res) {
    res.status(405).set('Allow', 'POST').json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed: stateless streamable HTTP, use POST' },
        id: null
    });
}
