import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { ConfigError } from './errors.js'

export interface HttpServerConfig {
  host: string
  port: number
  token: string
}

type TransportConfig = { transport: 'stdio' } | ({ transport: 'http' } & HttpServerConfig)

export function getTransportConfig(
  env: NodeJS.ProcessEnv = process.env
): Result<TransportConfig, ConfigError> {
  const transport = env['MCP_TRANSPORT'] ?? 'stdio'
  if (transport === 'stdio') {
    return Ok({ transport })
  }
  if (transport !== 'http') {
    return Err(new ConfigError('Invalid MCP_TRANSPORT', 'Set MCP_TRANSPORT to stdio or http'))
  }
  const port = env['PORT'] ?? '3000'
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return Err(new ConfigError('Invalid PORT', 'Set PORT to an integer between 1 and 65535'))
  }
  const token = env['MCP_HTTP_TOKEN'] ?? ''
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    return Err(
      new ConfigError(
        'HTTP mode requires MCP_HTTP_TOKEN',
        'Set MCP_HTTP_TOKEN to a cryptographically random token of 32 to 128 URL-safe characters'
      )
    )
  }
  return Ok({ transport, host: env['HOST'] || '127.0.0.1', port: Number(port), token })
}
