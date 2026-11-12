import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it } from 'vitest'

describe('package entry point', () => {
  it('serves MCP over stdio when dist/index.js is executed directly', async () => {
    const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/index.js'],
      cwd: projectRoot,
      stderr: 'pipe',
      env: { ...process.env, MCP_TRANSPORT: 'stdio' },
    })
    const client = new Client({ name: 'entry-point-test', version: '1.0.0' })

    try {
      await client.connect(transport)
      const { tools } = await client.listTools()

      expect(tools.map(({ name }) => name)).toEqual(['generate_image'])
    } finally {
      await client.close()
    }
  })

  it('starts the built executable in HTTP mode without logging the private token', async () => {
    const reservation = createServer()
    await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done))
    const address = reservation.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected a reserved TCP port')
    }
    await new Promise<void>((done) => reservation.close(() => done()))
    const token = 'http-entrypoint-private-token-1234567890'
    const child = spawn(process.execPath, ['dist/index.js'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: {
        ...process.env,
        MCP_TRANSPORT: 'http',
        MCP_HTTP_TOKEN: token,
        HOST: '127.0.0.1',
        PORT: String(address.port),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const client = new Client({ name: 'http-entrypoint-test', version: '1' })
    let logs = ''
    const ready = new Promise<void>((done, reject) => {
      child.on('error', reject)
      child.once('exit', () => reject(new Error(`HTTP child exited before readiness: ${logs}`)))
      child.stderr.on('data', (chunk: Buffer) => {
        logs += chunk.toString()
        if (logs.includes('HTTP MCP server listening')) {
          done()
        }
      })
    })
    const timeout = setTimeout(() => child.kill(), 5000)
    try {
      await ready
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${address.port}/image-mcp/${token}/`)
        )
      )
      const { tools } = await client.listTools()
      expect(tools.map(({ name }) => name)).toEqual(['generate_image'])
      expect(logs).not.toContain(token)
    } finally {
      clearTimeout(timeout)
      await client.close()
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill()
        await exited
      }
    }
  })
})
