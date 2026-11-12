# MCP Image Generator 🍌

> Generate and edit images from Codex, Cursor, Claude Code, or any MCP client. mcp-image adds visual direction to your request before sending it to Gemini, OpenAI, or BytePlus Seedream.

[![npm version](https://badge.fury.io/js/mcp-image.svg)](https://www.npmjs.com/package/mcp-image)
[![npm downloads](https://img.shields.io/npm/dm/mcp-image.svg)](https://www.npmjs.com/package/mcp-image)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Tell it what image to create or what to change in an existing image, and what it is for. The result is saved to disk and returned to your assistant.

## What It Does

Before generating an image, mcp-image rewrites short requests into more specific prompts. It keeps what you asked for and fills in what the image needs for its use, such as lighting and camera angle for a photo or layout for a poster. Text you want in the image stays as you wrote it, in your language. The more detail you provide, the less it changes.

**You ask:**

> "A photo of a roast chicken dinner for a recipe site. It should look like it was actually cooked, and it should be partway through being carved so you can tell how juicy it is."

**mcp-image sends to the image model:**

> "... a freshly roasted whole chicken resting on a rustic, seasoned wooden carving board. The chicken features **deeply bronzed, blistered, and crispy skin** ... It is **partway carved, with one breast cleanly sliced open** to reveal **tender, steaming-hot white meat glistening with natural juices pooling** slightly onto the board ... **shallow depth of field** with a softly blurred background."

![Roast chicken, generated with prompt enhancement](assets/roast-chicken-optimized.jpg)

*Generated with Gemini using the default `fast` quality preset.*

What carried through:

- `for a recipe site`: one clear subject, with everything else kept subordinate
- `actually cooked`: blistered, uneven browning, rising steam, and drippings on the knife
- `partway through being carved`: one breast sliced open, with the cut piece still resting against the bird
- `how juicy it is`: juices pooling on the board and shallow depth of field around the cut

<details>
<summary>Compare the same request with prompt enhancement turned off</summary>

<img src="assets/roast-chicken-plain.jpg" alt="Baseline result with prompt enhancement turned off" width="480">

*Baseline from the same request, with prompt enhancement disabled.*

Set `SKIP_PROMPT_ENHANCEMENT=true` to send the original prompt to the image model unchanged.

</details>

## Quick Start

You need Node.js 22 or later, an MCP-compatible client, and an API key for one image provider.

### 1. Get an API key

All three providers generate and edit images. Gemini is the default and requires the least configuration.

| Provider | Image size | Output format | Setup |
|----------|------------|---------------|-------|
| Gemini (default) | 1K, 2K, 4K | Automatic | [Get a key](https://aistudio.google.com/apikey), then set `GEMINI_API_KEY` |
| OpenAI | 1K, 2K, 4K | PNG or JPEG | [Get a key](https://platform.openai.com/api-keys), then set `IMAGE_PROVIDER=openai` and `OPENAI_API_KEY` |
| BytePlus Seedream | 1K, 2K | PNG or JPEG | [Get an AP region key](https://console.byteplus.com/ark/region:ark+ap-southeast-1/apikey), then set `IMAGE_PROVIDER=seedream` and `ARK_API_KEY` |

Google Search grounding is available with Gemini only. OpenAI may require organization verification before it can generate images.

The examples below use Gemini. Replace the provider settings if you prefer OpenAI or Seedream.

### 2. Configure your MCP client

#### Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.mcp-image]
command = "npx"
args = ["-y", "mcp-image"]

[mcp_servers.mcp-image.env]
GEMINI_API_KEY = "your_gemini_api_key_here"
IMAGE_OUTPUT_DIR = "/absolute/path/to/images"
```

#### Cursor

Add this to `~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "mcp-image": {
      "command": "npx",
      "args": ["-y", "mcp-image"],
      "env": {
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "IMAGE_OUTPUT_DIR": "/absolute/path/to/images"
      }
    }
  }
}
```

#### Claude Code

Run this in your project directory:

```bash
claude mcp add mcp-image --env GEMINI_API_KEY=your-api-key --env IMAGE_OUTPUT_DIR=/absolute/path/to/images -- npx -y mcp-image
```

Add `--scope user` after `mcp-image` to make it available in every project.

Never commit API keys to version control. Use an absolute `IMAGE_OUTPUT_DIR` in MCP configuration because the server's working directory depends on the client. If omitted, images are written to `./output` relative to that working directory.

### 3. Generate an image

Restart your MCP client after changing its configuration, then ask your AI assistant:

```text
Generate a product photo of a ceramic coffee mug on a wooden desk.
```

The generated file is saved in the configured output directory and returned to the assistant as an MCP resource.

<details>
<summary>Run mcp-image from a local checkout</summary>

```bash
pnpm install
pnpm run build
```

Configure the MCP client to run the local build instead of `npx -y mcp-image`:

```bash
node /absolute/path/to/mcp-image/dist/index.js
```

</details>

## More Examples

### Edit an existing image

Give the assistant an absolute path to the source image:

```text
Edit /path/to/image.jpg so the person is facing right.
```

### Control the result

- `Generate a high-quality product photo of a smartphone with clear text on the screen.`
- `Generate a cinematic desert landscape in a 21:9 aspect ratio.`
- `Keep the knight's appearance consistent with the previous image.`

See the [tool reference](#tool-reference) for the options your assistant can pass explicitly.

## Configuration

Changing the provider changes both prompt enhancement and image generation. The way you ask for an image stays the same.

### Quality

`IMAGE_QUALITY` accepts `fast` (default), `balanced`, or `quality`. Set it in the MCP server environment:

```bash
IMAGE_QUALITY=balanced
```

Use `fast` to try ideas quickly, `balanced` for everyday use, and `quality` for complex scenes or images where small details matter. Higher settings can take longer and cost more; results vary by provider.

All three providers support these presets for generation and editing. You can override the default with the `quality` option on each request.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_PROVIDER` | `gemini` | Default provider: `gemini`, `openai`, or `seedream` |
| `GEMINI_API_KEY` | - | API key for Gemini |
| `OPENAI_API_KEY` | - | API key for OpenAI |
| `ARK_API_KEY` | - | ModelArk AP API key for Seedream |
| `GEMINI_BASE_URL` | Google SDK default | Custom Gemini API base URL, applied to image generation and prompt enhancement |
| `OPENAI_BASE_URL` | OpenAI SDK default | Custom OpenAI-compatible API base URL, including its API prefix (for example, `https://provider.example/v1`) |
| `ARK_BASE_URL` | `https://ark.ap-southeast.bytepluses.com/api/v3` | Custom ModelArk API base URL, applied to image generation and prompt enhancement |
| `GEMINI_IMAGE_MODEL` | Quality preset selects the model | Override the Gemini image model for every quality preset |
| `OPENAI_IMAGE_MODEL` | Quality preset selects the model | Override the OpenAI image model for every quality preset |
| `SEEDREAM_IMAGE_MODEL` | `dola-seedream-5-0-pro-260628` | Override the Seedream image model or endpoint ID |
| `GEMINI_TEXT_MODEL` | `gemini-3.8-flash` | Model used for Gemini prompt enhancement |
| `OPENAI_TEXT_MODEL` | `gpt-5.6-luna` | Model used for OpenAI prompt enhancement |
| `SEEDREAM_TEXT_MODEL` | `seed-2-0-lite-260428` | Model used for Seedream prompt enhancement |
| `IMAGE_OUTPUT_DIR` | `./output` | Directory where generated images are saved; use an absolute path in MCP configuration |
| `IMAGE_QUALITY` | `fast` | Default quality preset: `fast`, `balanced`, or `quality` |
| `SKIP_PROMPT_ENHANCEMENT` | `false` | Set to `true` to send prompts through unchanged |
| `MCP_TRANSPORT` | `stdio` | Set to `http` for remote MCP clients such as Executor |
| `HOST` | `127.0.0.1` | HTTP bind address; Docker sets this to `0.0.0.0` inside the container |
| `PORT` | `3000` | HTTP listen port; Compose fixes the container port and uses `HTTP_PORT` for the host mapping |
| `MCP_HTTP_TOKEN` | - | Required in HTTP mode: a random private URL token of 32 to 128 URL-safe characters |

You can configure keys for more than one provider and switch per request. A request-level `provider` option takes precedence over `IMAGE_PROVIDER`.

### Custom providers and model names

To use GPT Image models hosted by another provider, select the OpenAI adapter and set the provider's API key, base URL, and exact model ID in your MCP server environment. For example:

```json
{
  "mcpServers": {
    "mcp-image": {
      "command": "npx",
      "args": ["-y", "mcp-image"],
      "env": {
        "IMAGE_PROVIDER": "openai",
        "OPENAI_API_KEY": "your_provider_api_key",
        "OPENAI_BASE_URL": "https://provider.example/v1",
        "OPENAI_IMAGE_MODEL": "gpt-image-1",
        "SKIP_PROMPT_ENHANCEMENT": "true",
        "IMAGE_OUTPUT_DIR": "/absolute/path/to/images"
      }
    }
  }
}
```

Use the API base URL, without `/images/generations`, `/images/edits`, or `/responses`; the adapter adds the endpoint path. Trailing slashes are supported. `GEMINI_BASE_URL` is a Gemini API root (for example, `https://gemini-proxy.example`); the Google SDK adds its API version and model path. URLs must use HTTP or HTTPS, with no embedded credentials, query parameters, or fragments. Empty override values keep the defaults. Restart the MCP server after changing these settings.

The OpenAI adapter sends generation requests to `/images/generations` and reference-image edits to `/images/edits`, and expects base64 image data in `data[].b64_json`. The custom endpoint must accept the adapter's request options, including size, quality, and output format. Model overrides apply across all quality presets; the presets still control the other request options, including OpenAI's `low`, `high`, and `max` quality values. Choose options supported by your model and provider.

Prompt enhancement uses the same base URL and API key as image generation. If your custom provider supports the Responses API, remove `SKIP_PROMPT_ENHANCEMENT` and set `OPENAI_TEXT_MODEL` to a text model it offers. Otherwise keep enhancement disabled. Gemini and Seedream have equivalent image and text model overrides in the table above. Each adapter retains its existing API format and capability limits.

### Executor and remote MCP clients

The default transport is stdio for local MCP clients. HTTP mode provides a stateless Streamable HTTP endpoint for Executor and other remote MCP clients. It returns generated images as standard MCP image content with metadata, without saving files on the server. Reference images are supplied inline instead of using server file paths.

#### Deploy with Docker

1. Copy `.env.example` to `.env` and fill in your provider's key, base URL, and exact image model ID. These are server-side settings; Executor does not receive the provider key.
2. Generate a private endpoint token and set it as `MCP_HTTP_TOKEN` in `.env`:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Build and start the container:

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

4. Put an HTTPS reverse proxy or tunnel in front of `http://127.0.0.1:3000`. Preserve the request path and allow requests and responses large enough for image data. Allow at least six minutes for image generation. The Compose service binds only to the host's loopback interface; `HTTP_PORT` changes that host port.
5. In Executor's **Connect a service** form, import the remote MCP URL:

   ```text
   https://your-host.example/image-mcp/YOUR_MCP_HTTP_TOKEN/
   ```

The complete URL is a private access credential: anyone holding it can invoke your configured providers. Keep it private, use HTTPS, and configure your reverse proxy to omit the secret path from access logs. This uses possession of the URL for access, rather than an OAuth sign-in or an extra authorization header. Changing `MCP_HTTP_TOKEN` and recreating the container revokes the old URL; update the URL in Executor afterwards. The server never logs the token. `/health` is a public health check and does not reveal provider settings.

The container runs as a non-root user with a read-only filesystem. Provider credentials and the endpoint token are read at runtime from the ignored `.env` file and excluded from the Docker build context. No image storage volume is needed. The Docker image starts the built code from this checkout, including custom provider support.

An optional Caddy configuration is included for a public server. Point a domain at that server, allow inbound TCP ports 80 and 443, and set `MCP_DOMAIN` in `.env`. Then start both services with:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
```

Caddy provides HTTPS for that hostname and forwards the private endpoint path to the image server. The supplied configuration omits request URIs from its runtime log fields and leaves access logging disabled. Keep the same two `-f` arguments when managing this deployment.

#### Run HTTP mode without Docker

Build the project and run `node dist/index.js` with `MCP_TRANSPORT=http`, `MCP_HTTP_TOKEN`, and the same provider environment variables as above. `HOST` defaults to `127.0.0.1` and `PORT` to `3000`. An HTTPS proxy or tunnel is needed to make the endpoint reachable from Executor. A `.env` file is loaded by Docker Compose; for a direct Node invocation, use `node --env-file=.env dist/index.js`.

HTTP mode accepts POST requests at `/image-mcp/<MCP_HTTP_TOKEN>/` (with or without the trailing slash) and returns JSON MCP responses. Requests from browser origins are rejected. It permits up to eight active requests, a 32 MiB HTTP request body, and 10 MiB per inline reference image; provider-specific limits still apply. Generation results include image bytes directly, so there are no public download routes or `file://` references.

For image editing over HTTP, call `generate_image` with references in this form:

```json
{
  "prompt": "Make the teapot red while preserving its shape",
  "inputImages": [
    { "data": "BASE64_IMAGE_BYTES", "mimeType": "image/png" }
  ]
}
```

Supported reference MIME types are PNG, JPEG, and WebP (Seedream accepts PNG and JPEG). Use base64 bytes without a `data:` prefix; image bytes must match the declared MIME type. HTTP mode rejects `inputImagePaths` before reading or checking any file. Local stdio mode continues to use `inputImagePaths` and saves images in `IMAGE_OUTPUT_DIR`.

## Tool Reference

Your MCP client calls this tool for you. Open the reference when you need to check an option or provider limitation.

<details>
<summary><code>generate_image</code> parameters</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Image description or editing instruction |
| `quality` | string | No | `fast`, `balanced`, or `quality`; overrides `IMAGE_QUALITY` |
| `provider` | string | No | `gemini`, `openai`, or `seedream`; overrides `IMAGE_PROVIDER` |
| `inputImagePaths` | string[] | No | Local stdio mode: absolute paths to input images for editing |
| `inputImages` | object[] | No | HTTP mode: inline references with base64 `data` and `mimeType`, in prompt order |
| `fileName` | string | No | Output filename; `.png`, `.jpg`, or `.jpeg` selects the format for OpenAI and Seedream |
| `aspectRatio` | string | No | `1:1` (default), `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `1:4`, `1:8`, `4:1`, or `8:1` |
| `imageSize` | string | No | `1K`, `2K`, or `4K`; availability depends on the provider |
| `blendImages` | boolean | No | Add blending guidance when combining visual elements |
| `maintainCharacterConsistency` | boolean | No | Keep a character's appearance consistent across images |
| `useWorldKnowledge` | boolean | No | Add context for historical figures, landmarks, and factual scenes |
| `useGoogleSearch` | boolean | No | Gemini only. Use Google Search grounding for current information |
| `purpose` | string | No | Intended use, such as `cookbook cover` or `social media post` |
| `category` | string | No | Kind of image: `photo`, `illustration`, `asset`, `ui-screen`, `graphic-design`, `diagram`, or `pattern-texture`. Your assistant sets it when the kind is clear |

</details>

## Troubleshooting

### API key not found

Check that the key for the selected provider is present in the MCP server's environment:

- Gemini: `GEMINI_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Seedream: `ARK_API_KEY`

Restart the MCP client after changing its configuration.

### Input image file not found

Use absolute paths and make sure the MCP server can read the files. Input images can be PNG, JPEG, or WebP and must be no larger than 10 MiB each. Seedream editing accepts PNG and JPEG only.

### Provider rejects a request

Check the requested size in the provider table. `useGoogleSearch` works with Gemini only, and Seedream does not support 4K. For OpenAI permission errors, check your [organization settings](https://platform.openai.com/settings/organization/general). For quota or rate-limit errors, check the selected provider account.

## Image Generation Prompt Skill

This repository also includes an [Agent Skill](https://agentskills.io) for assistants that already have access to an image generation tool. It teaches the prompt-writing approach used by mcp-image and works independently of this server.

Install it with:

```bash
npx mcp-image skills install --path <skills-directory>
```

For example, use `~/.codex/skills`, `~/.cursor/skills`, or `~/.claude/skills` as the destination.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

Need help? [Open an issue](https://github.com/shinpr/mcp-image/issues) or check [Troubleshooting](#troubleshooting).
