import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createHttpMcpServer } from './server/httpServer.js'
import { MCPServerImpl } from './server/mcpServer.js'
import { unwrapOrThrow } from './types/result.js'
import { toError } from './utils/errors.js'
import { Logger } from './utils/logger.js'
import { getTransportConfig, type HttpServerConfig } from './utils/transportConfig.js'

const logger = new Logger()

async function startHttp(config: HttpServerConfig): Promise<void> {
  const server = createHttpMcpServer(config)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  logger.info(
    'mcp-startup',
    'HTTP MCP server listening; endpoint is /image-mcp/<MCP_HTTP_TOKEN>/',
    {
      host: config.host,
      port: config.port,
    }
  )
  const shutdown = (): void => {
    const timeout = setTimeout(() => server.closeAllConnections(), 10000)
    timeout.unref()
    server.close(() => clearTimeout(timeout))
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

async function main(): Promise<void> {
  try {
    logger.info('mcp-startup', 'Starting MCP Image Generator initialization', {
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env['NODE_ENV'] || 'development',
    })

    const transportConfig = unwrapOrThrow(getTransportConfig())
    if (transportConfig.transport === 'http') {
      await startHttp(transportConfig)
      return
    }

    const mcpServerImpl = new MCPServerImpl()

    const server = mcpServerImpl.initialize()

    const transport = new StdioServerTransport()

    await server.connect(transport)

    logger.info('mcp-startup', 'Image Generator MCP Server started successfully')
  } catch (error) {
    const startupError = toError(error)
    logger.error('mcp-startup', 'Failed to start MCP server', startupError, {
      errorType: startupError.constructor.name,
      stack: startupError.stack,
    })
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  logger.error('mcp-startup', 'Fatal error during startup', toError(error))
  process.exit(1)
})
