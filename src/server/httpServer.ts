import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Logger } from '../utils/logger.js'
import type { HttpServerConfig } from '../utils/transportConfig.js'
import { MCPServerImpl } from './mcpServer.js'

const MAX_REQUEST_BYTES = 32 * 1024 * 1024
const MAX_CONCURRENT_REQUESTS = 8

function sendError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }))
}

function matchesPath(request: IncomingMessage, expected: Buffer): boolean {
  const actual = Buffer.from(request.url ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Private URL access works with remote MCP importers that do not accept custom headers. */
export function createHttpMcpServer(config: HttpServerConfig): Server {
  const expectedPath = Buffer.from(`/mcp/${config.token}`)
  const logger = new Logger()
  let activeRequests = 0

  async function handleMcp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const mcpServer = new MCPServerImpl({ imageResponseMode: 'inline' }).initialize()
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      maxRequestBodySize: MAX_REQUEST_BYTES,
    })
    const close = (): void => {
      mcpServer.close().catch(() => logger.error('mcp-http', 'Could not close MCP request'))
    }
    response.once('close', close)
    activeRequests += 1
    try {
      await mcpServer.connect(transport)
      await transport.handleRequest(request, response)
    } finally {
      response.off('close', close)
      activeRequests -= 1
      await mcpServer.close()
    }
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    // This endpoint is for server-to-server clients, which do not send Origin.
    if (request.headers.origin !== undefined) {
      sendError(response, 403, 'Browser origins are not allowed')
      return
    }
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (!matchesPath(request, expectedPath)) {
      sendError(response, 404, 'Not found')
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      sendError(response, 405, 'Method not allowed')
      return
    }
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      response.setHeader('Retry-After', '5')
      sendError(response, 503, 'Too many concurrent requests')
      return
    }
    await handleMcp(request, response)
  }

  const httpServer = createServer((request, response) => {
    route(request, response).catch(() => {
      logger.error('mcp-http', 'HTTP request failed')
      if (!response.headersSent) {
        sendError(response, 500, 'Internal server error')
      } else {
        response.destroy()
      }
    })
  })
  httpServer.headersTimeout = 10000
  httpServer.requestTimeout = 30000
  return httpServer
}
