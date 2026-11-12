import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getConfig, validateConfig, validateProviderCredentials } from '../config'
import { ConfigError } from '../errors'

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    for (const name of [
      'GEMINI_BASE_URL',
      'OPENAI_BASE_URL',
      'ARK_BASE_URL',
      'GEMINI_IMAGE_MODEL',
      'OPENAI_IMAGE_MODEL',
      'SEEDREAM_IMAGE_MODEL',
      'GEMINI_TEXT_MODEL',
      'OPENAI_TEXT_MODEL',
      'SEEDREAM_TEXT_MODEL',
    ]) {
      delete process.env[name]
    }
    delete process.env.IMAGE_PROVIDER
    delete process.env.GEMINI_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.ARK_API_KEY
    delete process.env.IMAGE_OUTPUT_DIR
    delete process.env.IMAGE_QUALITY
    delete process.env.SKIP_PROMPT_ENHANCEMENT
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('validateConfig', () => {
    it('should validate settings without requiring provider credentials', () => {
      const config = {
        imageProvider: 'gemini' as const,
        geminiApiKey: '',
        openaiApiKey: '',
        arkApiKey: '',
        imageOutputDir: './output',
        skipPromptEnhancement: false,
        imageQuality: 'fast' as const,
      }

      const result = validateConfig(config)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(config)
      }
    })

    it('should reject invalid imageQuality value', () => {
      const config = {
        imageProvider: 'gemini' as const,
        geminiApiKey: 'valid-api-key-12345',
        openaiApiKey: '',
        arkApiKey: '',
        imageOutputDir: './output',
        skipPromptEnhancement: false,
        imageQuality: 'invalid',
      }

      const result = validateConfig(config)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toBe(
          'Invalid IMAGE_QUALITY value: "invalid". Valid options: fast, balanced, quality'
        )
      }
    })

    it('should reject an output directory that is only whitespace', () => {
      const result = validateConfig({
        imageProvider: 'gemini',
        geminiApiKey: '',
        openaiApiKey: '',
        arkApiKey: '',
        imageOutputDir: '   ',
        skipPromptEnhancement: false,
        imageQuality: 'fast',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toBe('IMAGE_OUTPUT_DIR cannot be empty')
      }
    })
  })

  describe('validateProviderCredentials', () => {
    const configWithoutCredentials = {
      imageProvider: 'gemini' as const,
      geminiApiKey: '',
      openaiApiKey: '',
      arkApiKey: '',
      imageOutputDir: './output',
      skipPromptEnhancement: false,
      imageQuality: 'fast' as const,
    }

    it.each([
      ['gemini' as const, { geminiApiKey: 'x' }],
      ['openai' as const, { openaiApiKey: 'x' }],
      ['seedream' as const, { arkApiKey: 'x' }],
    ])('should accept %s credentials without inferring a key format', (provider, credentials) => {
      const config = { ...configWithoutCredentials, ...credentials }

      const result = validateProviderCredentials(config, provider)

      expect(result.success).toBe(true)
    })

    it.each([
      ['gemini' as const, { geminiApiKey: '' }, 'GEMINI_API_KEY'],
      ['gemini' as const, { geminiApiKey: ' \t\n ' }, 'GEMINI_API_KEY'],
      ['openai' as const, { openaiApiKey: '' }, 'OPENAI_API_KEY'],
      ['openai' as const, { openaiApiKey: ' \t\n ' }, 'OPENAI_API_KEY'],
      ['seedream' as const, { arkApiKey: '' }, 'ARK_API_KEY'],
      ['seedream' as const, { arkApiKey: ' \t\n ' }, 'ARK_API_KEY'],
    ])(
      'should guide the caller when %s credentials are missing',
      (provider, credentials, environmentVariable) => {
        const config = { ...configWithoutCredentials, ...credentials }

        const result = validateProviderCredentials(config, provider)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toBeInstanceOf(ConfigError)
          expect(result.error.message).toBe(
            `The selected image provider "${provider}" is not configured on this server.`
          )
          expect(result.error.suggestion).toBe(
            `Ask the user to configure ${environmentVariable} and restart the MCP server. After the server restarts, retry generate_image with provider "${provider}".`
          )
        }
      }
    )
  })

  describe('getConfig', () => {
    it('reads and trims custom endpoints and model names independently for every provider', () => {
      Object.assign(process.env, {
        GEMINI_BASE_URL: ' https://gemini.example.com/proxy ',
        OPENAI_BASE_URL: ' http://localhost:8080/v1/ ',
        ARK_BASE_URL: ' https://ark.example.com/api/v3/ ',
        GEMINI_IMAGE_MODEL: ' custom-gemini-image ',
        OPENAI_IMAGE_MODEL: ' custom-gpt-image ',
        SEEDREAM_IMAGE_MODEL: ' custom-seedream-image ',
        GEMINI_TEXT_MODEL: ' custom-gemini-text ',
        OPENAI_TEXT_MODEL: ' custom-openai-text ',
        SEEDREAM_TEXT_MODEL: ' custom-seedream-text ',
      })

      expect(getConfig()).toMatchObject({
        success: true,
        data: {
          geminiBaseUrl: 'https://gemini.example.com/proxy',
          openaiBaseUrl: 'http://localhost:8080/v1/',
          arkBaseUrl: 'https://ark.example.com/api/v3/',
          geminiImageModel: 'custom-gemini-image',
          openaiImageModel: 'custom-gpt-image',
          seedreamImageModel: 'custom-seedream-image',
          geminiTextModel: 'custom-gemini-text',
          openaiTextModel: 'custom-openai-text',
          seedreamTextModel: 'custom-seedream-text',
        },
      })
    })

    it.each(['', '   ', 'undefined', 'null'])(
      'keeps provider defaults for unset overrides (%j)',
      (value) => {
        process.env.GEMINI_BASE_URL = value
        process.env.OPENAI_BASE_URL = value
        process.env.ARK_BASE_URL = value
        process.env.OPENAI_IMAGE_MODEL = value
        process.env.OPENAI_TEXT_MODEL = value

        const result = getConfig()

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.geminiBaseUrl).toBeUndefined()
          expect(result.data.openaiBaseUrl).toBeUndefined()
          expect(result.data.arkBaseUrl).toBeUndefined()
          expect(result.data.openaiImageModel).toBeUndefined()
          expect(result.data.openaiTextModel).toBeUndefined()
        }
      }
    )

    it.each(['GEMINI_BASE_URL', 'OPENAI_BASE_URL', 'ARK_BASE_URL'])(
      'rejects invalid %s values without disclosing the URL',
      (name) => {
        for (const value of [
          'not-a-url',
          '/relative/path',
          'file:///private/path',
          'https://user:private-password@example.com/v1',
          'https://example.com/v1?key=private-key',
          'https://example.com/v1#fragment',
        ]) {
          process.env[name] = value
          const result = getConfig()

          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error.message).toBe(`Invalid ${name}`)
            expect(result.error.suggestion).toContain('absolute HTTP(S) URL')
            expect(JSON.stringify(result.error)).not.toContain(value)
          }
        }
      }
    )

    it('should return config with default values when environment variables are not set', () => {
      const result = getConfig()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toMatchObject({
          imageProvider: 'gemini',
          geminiApiKey: '',
          openaiApiKey: '',
          arkApiKey: '',
          imageOutputDir: './output',
          imageQuality: 'fast',
        })
      }
    })

    it('should read a custom IMAGE_OUTPUT_DIR', () => {
      process.env.IMAGE_OUTPUT_DIR = '/custom/output'

      const result = getConfig()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageOutputDir).toBe('/custom/output')
      }
    })

    it('should fall back to ./output when IMAGE_OUTPUT_DIR is an empty string', () => {
      process.env.IMAGE_OUTPUT_DIR = ''

      const result = getConfig()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageOutputDir).toBe('./output')
      }
    })

    it('should read IMAGE_PROVIDER from environment', () => {
      process.env.IMAGE_PROVIDER = 'seedream'

      const result = getConfig()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageProvider).toBe('seedream')
      }
    })

    it('should reject an unknown IMAGE_PROVIDER', () => {
      process.env.IMAGE_PROVIDER = 'midjourney'

      const result = getConfig()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toBe(
          'Invalid IMAGE_PROVIDER value: "midjourney". Valid options: gemini, openai, seedream'
        )
      }
    })

    it.each([
      ['true', true],
      ['false', false],
      [undefined, false],
    ])('should read SKIP_PROMPT_ENHANCEMENT=%s as %s', (value, expected) => {
      if (value !== undefined) {
        process.env.SKIP_PROMPT_ENHANCEMENT = value
      }

      const result = getConfig()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.skipPromptEnhancement).toBe(expected)
      }
    })

    it.each([
      ['GEMINI_API_KEY', 'geminiApiKey' as const],
      ['OPENAI_API_KEY', 'openaiApiKey' as const],
      ['ARK_API_KEY', 'arkApiKey' as const],
    ])('should preserve %s exactly as configured', (environmentVariable, configKey) => {
      const credential = ' \ttest-api-key\n '
      process.env[environmentVariable] = credential

      const result = getConfig()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data[configKey]).toBe(credential)
      }
    })

    it('should read IMAGE_QUALITY env var', () => {
      process.env.IMAGE_QUALITY = 'quality'

      const result = getConfig()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageQuality).toBe('quality')
      }
    })

    it('should reject invalid IMAGE_QUALITY env var', () => {
      process.env.IMAGE_QUALITY = 'ultra'

      const result = getConfig()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Invalid IMAGE_QUALITY')
      }
    })
  })
})
