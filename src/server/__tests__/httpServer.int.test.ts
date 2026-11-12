import { existsSync } from 'node:fs'
import { request as httpRequest, type Server } from 'node:http'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectDefined, parseToolPayload, readPath } from '../../tests/helpers/inspect.js'
import { createHttpMcpServer } from '../httpServer.js'

const TOKEN = 'test-private-endpoint-token-1234567890'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=',
  'base64'
)
const REFERENCE = { data: PNG.toString('base64'), mimeType: 'image/png' }
const realFetch = globalThis.fetch

function imageResponse(): Response {
  return new Response(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HTTP MCP server', () => {
  let server: Server
  let endpoint: URL
  const clients: Client[] = []
  const upstream = vi.fn<typeof fetch>()
  const outputDir = resolve('tmp/http-images-must-not-be-written')

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('IMAGE_PROVIDER', 'openai')
    vi.stubEnv('IMAGE_QUALITY', 'fast')
    vi.stubEnv('OPENAI_API_KEY', 'test-provider-key')
    vi.stubEnv('OPENAI_BASE_URL', 'https://images.example.test/v1')
    vi.stubEnv('OPENAI_IMAGE_MODEL', 'hosted-gpt-image')
    vi.stubEnv('OPENAI_TEXT_MODEL', 'hosted-text-model')
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'true')
    vi.stubEnv('IMAGE_OUTPUT_DIR', outputDir)
    upstream.mockReset().mockImplementation(async () => imageResponse())
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      return url.startsWith('https://images.example.test/')
        ? upstream(input, init)
        : realFetch(input, init)
    })
    server = createHttpMcpServer({ token: TOKEN, host: '127.0.0.1', port: 0 })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected an HTTP listening address')
    }
    endpoint = new URL(`http://127.0.0.1:${address.port}/mcp/${TOKEN}`)
  })

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()))
    server.closeAllConnections()
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done()))
    )
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function connect(): Promise<Client> {
    const client = new Client({ name: 'http-integration-test', version: '1' })
    clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(endpoint))
    return client
  }

  async function generate(
    args: Record<string, unknown>
  ): Promise<ReturnType<typeof CallToolResultSchema.parse>> {
    const client = await connect()
    return CallToolResultSchema.parse(
      await client.callTool({ name: 'generate_image', arguments: args })
    )
  }

  it('initializes and advertises inline reference images through a real MCP HTTP client', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    const tool = expectDefined(tools[0], 'generate_image tool')
    expect(tool.name).toBe('generate_image')
    expect(tool.description).toContain('inputImages')
    expect(tool.description).not.toContain('inputImagePaths')
    expect(tool.inputSchema.properties).toHaveProperty('inputImages')
    expect(tool.inputSchema.properties).not.toHaveProperty('inputImagePaths')
    expect(upstream).not.toHaveBeenCalled()
  })

  it('returns exact image bytes and custom model metadata without writing files', async () => {
    const result = await generate({ prompt: 'a blue teapot' })
    expect(result.isError).toBe(false)
    expect(readPath(parseToolPayload(result), 'metadata', 'model')).toBe('hosted-gpt-image')
    expect(result.content).toContainEqual({
      type: 'image',
      data: PNG.toString('base64'),
      mimeType: 'image/png',
    })
    expect(JSON.stringify(result)).not.toContain('file://')
    expect(JSON.stringify(result)).not.toContain(outputDir)
    expect(existsSync(outputDir)).toBe(false)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(String(upstream.mock.calls[0]?.[0])).toBe(
      'https://images.example.test/v1/images/generations'
    )
  })

  it.each(['gemini', 'seedream'] as const)(
    'returns inline images from the %s adapter',
    async (provider) => {
      vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key')
      vi.stubEnv('GEMINI_BASE_URL', 'https://images.example.test/gemini')
      vi.stubEnv('GEMINI_IMAGE_MODEL', 'hosted-gemini-image')
      vi.stubEnv('ARK_API_KEY', 'test-ark-key')
      vi.stubEnv('ARK_BASE_URL', 'https://images.example.test/ark/v3')
      vi.stubEnv('SEEDREAM_IMAGE_MODEL', 'hosted-seedream-image')
      if (provider === 'gemini') {
        upstream.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              candidates: [
                { content: { parts: [{ inlineData: REFERENCE }] }, finishReason: 'STOP' },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )
      }
      const result = await generate({ prompt: 'a teapot', provider })
      expect(result.isError).toBe(false)
      expect(readPath(parseToolPayload(result), 'metadata', 'model')).toBe(
        `hosted-${provider}-image`
      )
      expect(result.content).toContainEqual({ type: 'image', ...REFERENCE })
      expect(existsSync(outputDir)).toBe(false)
    }
  )

  it('uploads inline references to the custom provider as multipart image edits', async () => {
    const result = await generate({ prompt: 'make this red', inputImages: [REFERENCE] })
    expect(result.isError).toBe(false)
    const call = expectDefined(upstream.mock.calls[0], 'upstream edit request')
    expect(String(call[0])).toBe('https://images.example.test/v1/images/edits')
    const body = call[1]?.body
    if (!(body instanceof FormData)) {
      throw new Error('Expected a multipart image edit')
    }
    expect(body.get('model')).toBe('hosted-gpt-image')
    const file = body.get('image[]')
    if (!(file instanceof File)) {
      throw new Error('Expected an uploaded reference image')
    }
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG)
  })

  it('enhances inline references using the same custom endpoint and text model', async () => {
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
    upstream.mockResolvedValueOnce(
      new Response(JSON.stringify({ output_text: 'enhanced teapot prompt' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const result = await generate({ prompt: 'improve the teapot', inputImages: [REFERENCE] })
    expect(result.isError).toBe(false)
    const textCall = expectDefined(upstream.mock.calls[0], 'text request')
    expect(String(textCall[0])).toBe('https://images.example.test/v1/responses')
    expect(String(textCall[1]?.body)).toContain('hosted-text-model')
    expect(String(textCall[1]?.body)).toContain(`data:image/png;base64,${REFERENCE.data}`)
    expect(readPath(parseToolPayload(result), 'metadata', 'contextMethod')).toBe(
      'structured_prompt'
    )
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it.each([
    { inputImagePaths: [process.execPath] },
    { inputImages: [] },
    { inputImages: Array.from({ length: 17 }, () => REFERENCE) },
    { inputImages: [{ data: 'not base64', mimeType: 'image/png' }] },
    { inputImages: [{ data: REFERENCE.data, mimeType: 'image/jpeg' }] },
    { inputImages: [{ data: REFERENCE.data, mimeType: 'image/svg+xml' }] },
    {
      inputImages: [
        { data: 'a'.repeat(4 * Math.ceil((10 * 1024 * 1024 + 3) / 3)), mimeType: 'image/png' },
      ],
    },
  ])('rejects unsafe reference input before calling a provider (%#)', async (args) => {
    const result = await generate({ prompt: 'edit a reference', ...args })
    expect(result.isError).toBe(true)
    expect(readPath(parseToolPayload(result), 'error', 'code')).toBe('INPUT_VALIDATION_ERROR')
    expect(upstream).not.toHaveBeenCalled()
  })

  it('keeps concurrent clients and repeated JSON-RPC IDs independent', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) => generate({ prompt: `teapot ${index}` }))
    )
    expect(results.every((result) => result.isError === false)).toBe(true)
    expect(upstream).toHaveBeenCalledTimes(4)
  })

  it('exposes a health check while keeping incorrect private URLs unavailable', async () => {
    const health = await realFetch(new URL('/health', endpoint))
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
    for (const path of ['/mcp', '/mcp/wrong-token', `/mcp/${TOKEN}x`]) {
      const response = await realFetch(new URL(path, endpoint), { method: 'POST', body: '{}' })
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain(TOKEN)
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects browser origins and unsupported HTTP methods', async () => {
    const origin = await realFetch(endpoint, {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example' },
      body: '{}',
    })
    expect(origin.status).toBe(403)
    for (const method of ['GET', 'DELETE', 'PUT', 'OPTIONS']) {
      const response = await realFetch(endpoint, { method })
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects oversized HTTP bodies before parsing or contacting a provider', async () => {
    const status = await new Promise<number | undefined>((done, reject) => {
      const request = httpRequest(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'Content-Length': 33 * 1024 * 1024,
          },
        },
        (response) => {
          response.resume()
          response.on('end', () => done(response.statusCode))
        }
      )
      request.on('error', reject)
      request.end('{}')
    })
    expect(status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('limits active requests and releases capacity after they complete', async () => {
    const pending: Array<(response: Response) => void> = []
    let allStarted: (() => void) | undefined
    const started = new Promise<void>((done) => {
      allStarted = done
    })
    upstream.mockImplementation(
      async () =>
        new Promise<Response>((done) => {
          pending.push(done)
          if (pending.length === 8) {
            allStarted?.()
          }
        })
    )
    const client = await connect()
    const requests = Promise.all(
      Array.from({ length: 8 }, () =>
        client.callTool({
          name: 'generate_image',
          arguments: { prompt: 'a teapot' },
        })
      )
    )
    try {
      await started
      const overloaded = await realFetch(endpoint, { method: 'POST', body: '{}' })
      expect(overloaded.status).toBe(503)
      expect(overloaded.headers.get('retry-after')).toBe('5')
    } finally {
      for (const done of pending) {
        done(imageResponse())
      }
      await requests
    }
    upstream.mockImplementation(async () => imageResponse())
    expect((await generate({ prompt: 'another teapot' })).isError).toBe(false)
  })

  it('aborts provider work when the remote caller disconnects', async () => {
    let notifyStarted: (() => void) | undefined
    let notifyAborted: (() => void) | undefined
    const started = new Promise<void>((done) => {
      notifyStarted = done
    })
    const aborted = new Promise<void>((done) => {
      notifyAborted = done
    })
    upstream.mockImplementationOnce(
      async (_input, init) =>
        new Promise<Response>((_done, reject) => {
          const signal = expectDefined(init?.signal, 'upstream abort signal')
          signal.addEventListener(
            'abort',
            () => {
              notifyAborted?.()
              reject(new DOMException('Request aborted', 'AbortError'))
            },
            { once: true }
          )
          notifyStarted?.()
        })
    )
    const controller = new AbortController()
    const request = realFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'generate_image',
          arguments: { prompt: 'a teapot' },
        },
      }),
      signal: controller.signal,
    })
    const rejection = expect(request).rejects.toThrow()
    await started
    controller.abort()
    await rejection
    await aborted
  })
})
