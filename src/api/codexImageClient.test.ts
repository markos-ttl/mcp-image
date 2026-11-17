import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexImageClient } from './codexImageClient.js'

type RunOptions = { cwd: string; env: Record<string, string>; signal?: AbortSignal }
const fake = vi.hoisted(() => ({
  run: vi.fn<(command: string, args: string[], options: RunOptions) => Promise<void>>(),
  input: vi.fn(),
}))
vi.mock('node:child_process', () => {
  const execFile = Object.assign(() => {}, {
    [Symbol.for('nodejs.util.promisify.custom')]: (...args: [string, string[], RunOptions]) => {
      const result = Promise.resolve().then(() => fake.run(...args))
      return Object.assign(result, { child: { stdin: { end: fake.input } } })
    },
  })
  return { execFile }
})

const config = {
  imageProvider: 'codex' as const,
  geminiApiKey: '',
  openaiApiKey: '',
  arkApiKey: '',
  imageOutputDir: './output',
  skipPromptEnhancement: false,
  imageQuality: 'fast' as const,
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
  'base64'
)

describe('Codex image adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fake.run.mockImplementation(async (_command, _args, options) => {
      await mkdir(path.join(options.cwd, 'generated_images'))
      await writeFile(path.join(options.cwd, 'generated_images', 'image.png'), png)
    })
  })

  it('returns validated bytes, isolates configuration, and removes temporary files', async () => {
    const result = await createCodexImageClient(config).generateImage({ prompt: 'A mug' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.imageData).toEqual(png)
      expect(result.data.metadata.provider).toBe('codex')
    }
    const [command, args, options] = firstCall()
    expect(command).toBe('codex')
    expect(args).toContain('--ignore-user-config')
    expect(args).toContain('workspace-write')
    expect(options.env.OPENAI_API_KEY).toBe('')
    expect(options.env.CODEX_API_KEY).toBe('')
    expect(fake.input).toHaveBeenCalledWith(expect.stringContaining('"A mug"'))
    await expect(access(options.cwd)).rejects.toThrow()
  })

  it('passes reference images, selected model, and cancellation signal', async () => {
    const signal = new AbortController().signal
    const result = await createCodexImageClient({
      ...config,
      codexModel: 'custom-model',
    }).generateImage({
      prompt: 'Edit',
      signal,
      inputImages: [{ data: png.toString('base64'), mimeType: 'image/png' }],
    })
    expect(result.success).toBe(true)
    const [, args, options] = firstCall()
    expect(args).toContain('--image')
    expect(args).toContain('custom-model')
    expect(options.signal).toBe(signal)
  })

  it('rejects unsupported options before launching Codex', async () => {
    for (const options of [{ useGoogleSearch: true }, { preferredOutputFormat: 'jpeg' as const }]) {
      expect(
        (await createCodexImageClient(config).generateImage({ prompt: 'Test', ...options })).success
      ).toBe(false)
    }
    expect(fake.run).not.toHaveBeenCalled()
  })

  it('rejects invalid image bytes and cleans the workspace', async () => {
    fake.run.mockImplementation(async (_command, _args, options) => {
      await mkdir(path.join(options.cwd, 'generated_images'))
      await writeFile(path.join(options.cwd, 'generated_images', 'image.png'), 'not an image')
    })
    expect((await createCodexImageClient(config).generateImage({ prompt: 'Test' })).success).toBe(
      false
    )
    await expect(access(firstCall()[2].cwd)).rejects.toThrow()
  })

  it('does not leak upstream diagnostics on failure', async () => {
    fake.run.mockRejectedValue(new Error('secret upstream diagnostic'))
    const result = await createCodexImageClient(config).generateImage({ prompt: 'Test' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('secret upstream diagnostic')
    await expect(access(firstCall()[2].cwd)).rejects.toThrow()
  })

  it('does not launch for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(
      (
        await createCodexImageClient(config).generateImage({
          prompt: 'Test',
          signal: controller.signal,
        })
      ).success
    ).toBe(false)
    expect(fake.run).not.toHaveBeenCalled()
  })
})

function firstCall(): [string, string[], RunOptions] {
  const call = fake.run.mock.calls[0]
  if (!call) {
    throw new Error('Expected a CLI invocation')
  }
  return call
}
