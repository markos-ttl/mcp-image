import { MAX_IMAGE_SIZE, MAX_INPUT_IMAGES, type ReferenceImage } from '../types/image.js'
import type { GenerateImageParams } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { InputValidationError } from '../utils/errors.js'
import { matchesImageDataMimeType } from '../utils/mimeUtils.js'
import { validateGenerateImageParams } from './inputValidator.js'

function invalidImage(message: string): Result<never, InputValidationError> {
  return Err(
    new InputValidationError(
      message,
      'Use inputImages with base64 data and a matching image MIME type'
    )
  )
}

function matchesImage(data: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
    return matchesImageDataMimeType(data, mimeType)
  }
  return (
    mimeType === 'image/webp' &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

function validateImage(value: unknown): Result<ReferenceImage, InputValidationError> {
  if (typeof value !== 'object' || value === null || !('data' in value) || !('mimeType' in value)) {
    return invalidImage('Each reference image must contain data and mimeType')
  }
  const { data, mimeType } = value
  if (typeof data !== 'string' || typeof mimeType !== 'string' || data.length === 0) {
    return invalidImage('Image data and mimeType must be non-empty strings')
  }
  if (data.length > 4 * Math.ceil(MAX_IMAGE_SIZE / 3)) {
    return invalidImage('Each reference image must be at most 10 MiB')
  }
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length > MAX_IMAGE_SIZE || bytes.toString('base64') !== data) {
    return invalidImage('Image data must be valid base64 encoding of at most 10 MiB')
  }
  if (!matchesImage(bytes, mimeType)) {
    return invalidImage('Image bytes must match a PNG, JPEG, or WebP MIME type')
  }
  return Ok({ data, mimeType })
}

export function validateRemoteGenerateImageParams(
  input: unknown
): Result<GenerateImageParams, InputValidationError> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return validateGenerateImageParams(input)
  }
  for (const field of ['inputImagePaths', 'inputImagePath', 'inputImage', 'inputImageMimeType']) {
    if (field in input) {
      return invalidImage('Server file paths are unavailable over HTTP')
    }
  }
  const result = validateGenerateImageParams(input)
  if (!result.success || !('inputImages' in input)) {
    return result
  }
  const images = input.inputImages
  if (!Array.isArray(images) || images.length === 0 || images.length > MAX_INPUT_IMAGES.openai) {
    return invalidImage(`inputImages must contain 1 to ${MAX_INPUT_IMAGES.openai} reference images`)
  }
  const inputImages: ReferenceImage[] = []
  for (const [index, image] of images.entries()) {
    const imageResult = validateImage(image)
    if (!imageResult.success) {
      imageResult.error.message = `Input image ${index + 1}: ${imageResult.error.message}`
      return imageResult
    }
    inputImages.push(imageResult.data)
  }
  return Ok({ ...result.data, inputImages })
}
