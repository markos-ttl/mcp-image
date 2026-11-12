import { describe, expect, it } from 'vitest'
import { getTransportConfig } from '../transportConfig.js'

const TOKEN = 'a'.repeat(64)

describe('transport configuration', () => {
  it('keeps stdio as the default without needing HTTP settings', () => {
    expect(getTransportConfig({})).toEqual({ success: true, data: { transport: 'stdio' } })
  })

  it('reads HTTP settings and binds to loopback by default', () => {
    expect(getTransportConfig({ MCP_TRANSPORT: 'http', MCP_HTTP_TOKEN: TOKEN })).toEqual({
      success: true,
      data: { transport: 'http', host: '127.0.0.1', port: 3000, token: TOKEN },
    })
    expect(
      getTransportConfig({
        MCP_TRANSPORT: 'http',
        MCP_HTTP_TOKEN: TOKEN,
        HOST: '0.0.0.0',
        PORT: '8080',
      })
    ).toMatchObject({ success: true, data: { host: '0.0.0.0', port: 8080 } })
  })

  it.each(['', '0', '-1', '65536', '3.5', 'abc', '3000junk'])(
    'rejects invalid HTTP port %j',
    (port) => {
      const result = getTransportConfig({
        MCP_TRANSPORT: 'http',
        MCP_HTTP_TOKEN: TOKEN,
        PORT: port,
      })
      expect(result.success).toBe(false)
    }
  )

  it.each(['', 'short', 'x'.repeat(129), `${TOKEN}/path`, `${TOKEN}?query`])(
    'requires a URL-safe private endpoint token (%j)',
    (token) => {
      const result = getTransportConfig({ MCP_TRANSPORT: 'http', MCP_HTTP_TOKEN: token })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('HTTP mode requires MCP_HTTP_TOKEN')
      }
    }
  )

  it('rejects an unknown transport', () => {
    expect(getTransportConfig({ MCP_TRANSPORT: 'websocket' }).success).toBe(false)
  })
})
