# Repository Guidelines

## Project Structure & Modules
- Root app: `thumbnail_generator_robust.html` (HTML/CSS + React via Babel).
- Engine: `src/engine/registry.js` (lazy-loads and executes nodes).
- Nodes: `src/nodes/` (one file per node, registered at runtime).
- Manifest: `src/nodes/manifest.js` (lightweight metadata used for the library UI and defaults).
- Optional assets: place under `assets/` and reference via relative paths.
 - Execution model: all node execution goes through `NodeRegistry`; no inline switch.

## Build, Run, Test
- Serve locally: `python3 -m http.server 8000` → open `http://localhost:8000/thumbnail_generator_robust.html`.
- Direct open works, but prefer a server to avoid `fetch` CORS issues.
- No build step; UMD React + Babel run in-browser.

## Coding Style
- Indentation: 2 spaces for JS/JSX/HTML/CSS.
- JS naming: camelCase vars, PascalCase components, UPPER_SNAKE_CASE constants.
- Keep modules small and side‑effect free except for `NodeRegistry.register(...)`.

## Node Module Workflow
- Listing: defined in `src/nodes/manifest.js` with fields: `name`, `icon`, `category`, `description`, `inputs`, `outputs`, `headerColor`, `requiresInput`, `defaults`, plus:
  - `io`: `{ inputTypes: [{ kind: 'text'|'image'|'audio'|'video', optional?: true }...], outputType: 'text'|'image'|'audio'|'video'|'none', inputMode: 'single'|'multi' }`.
  - `aiHints`: lightweight guidance for AI builder and tips shown in UI (`purpose`, `whenToUse`, `notFor`, `preconditions`, `postconditions`, optional `requiresKeys`, `proxyHint`, `tags`).
- Execution: each node file registers itself via `NodeRegistry.register(type, { defaults, schema, async execute(ctx) })`.
- Add a node:
  - Add manifest entry in `src/nodes/manifest.js` using the same `type` key as the filename.
  - Create `src/nodes/<type>.js` and call `NodeRegistry.register` with `defaults`, `schema`, `execute`.
  - Return an object with `type` set to one of `'image'|'text'|'audio'|'video'|'none'` and any additional fields (e.g., `text`, `image`, `preview`).
- Common nodes: `promptInput`, `textInput` (emits plain text), `imageInput`, `audioInput`, `videoInput`, `geminiText2Image`, `geminiEditImage`, `briaRemove`, `textOverlay`, `layerFusion`, `export`, `videoExport`, `audioExport`, `textExport`, `videoToAudio`, `deepgramTranscribe`, `llmTextCall`, `textDisplay`, `perplexitySearch`, `falTextToVideo`, `falImageToVideo`, `chatterboxTTS`.

### Node Execution Context & Return Shape
- `execute(ctx)` receives an object shaped like:
  - `inputData`: single upstream value for `single` inputs, or an array for `multi` inputs. Each item should carry a `type` field (`'text'|'image'|'audio'|'video'`).
  - `params`: the node instance parameters merged from manifest `defaults` and UI-edited values.
  - `apiKeys`: values from the API panel (e.g., `openai`, `gemini`, `falai`, `deepgram`, `perplexity`, optional proxies like `falProxy`, `perplexityProxy`).
  - `setExecutionMessage(message: string)`: optional callback to surface progress updates in the UI.
- Return a plain object with at least `type` and the payload for that type, e.g.:
  - Text: `{ type: 'text', text, preview? }`
  - Image: `{ type: 'image', image: dataUrlOrUrl, preview? }`
  - Audio: `{ type: 'audio', audioUrl|blob|objectUrl, preview? }`
  - Video: `{ type: 'video', videoUrl|blob|objectUrl, preview? }`
  - None/output-only: `{ type: 'none' }` (export nodes that only trigger downloads)

### Error Handling & UX
- Throw `Error` with clear, user-facing messages when inputs, params, or API keys are missing. Prefer concise guidance with actionable next steps.
- Use `setExecutionMessage(...)` to indicate progress and success/failure (e.g., `🔎 Searching...`, `✅ Done`).
- Handle network/CORS failures gracefully with hints to configure proxies (see below).

Perplexity Search
- Configure keys in API panel: `perplexity` (+ optional `perplexityProxy` for CORS-friendly forwarding).
- Endpoint: OpenAI-compatible `POST /chat/completions` with `Authorization: Bearer <key>`.
- Model: defaults to `sonar-small`; node auto-negotiates across a few compatible model names if needed.
- Output: newline-separated list (Title - URL) in `type: 'text'`.

## API Keys & Proxies
- Keys live only in `localStorage` via the in-app API panel. Never commit keys.
- Known keys: `openai`, `gemini`, `falai`, `deepgram`, `perplexity`.
- Known proxies (to avoid browser CORS blocks):
  - `falProxy`: CORS-enabled forwarder to `https://fal.run` for Fal endpoints.
  - `perplexityProxy`: CORS-enabled forwarder to `https://api.perplexity.ai`.
- Nodes should prefer the proxy if configured, else call the provider directly. Provide clear error text when CORS blocks are suspected.

## Testing Guidelines
- Manual checks: drag nodes, connect ports, execute single node + full workflow.
- API keys: open the API panel, save keys, run test buttons; confirm success/error badges.
- Quick smoke flows:
  - Text: `textInput → textDisplay`.
  - Perplexity: `textInput (entities) → perplexitySearch → textDisplay` with `perplexity` key (and `perplexityProxy` if needed).
  - Image: `textInput (prompt) → geminiText2Image → export` with `gemini` key.
  - Audio/Video: `videoInput → videoToAudio → deepgramTranscribe` with `deepgram` key; or `textInput → chatterboxTTS → audioExport`.

## Commit & PR Guidelines
- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, etc.).
- PRs include purpose, summary, and screenshots/GIFs for UI changes; note manual test steps.

## Security
- Never commit real API keys. Keys persist in `localStorage` only.
- Expect network/CORS/rate limits for external APIs; handle failures gracefully.
 - For Perplexity, if browser requests are blocked by CORS, set `perplexityProxy` to a lightweight proxy that forwards to `https://api.perplexity.ai` with CORS enabled.

## Engine Notes
- Dynamic loading: `NodeRegistry.ensureLoaded(type)` injects `<script src="src/nodes/<type>.js?v=...">` with cache-busting. Keep filenames exactly matching the manifest `type` key.
- Do not add inline `switch` statements for node logic; all execution goes through `NodeRegistry.execute(type, ctx)`.

## Dev Tips
- Keep node modules side-effect free except for `NodeRegistry.register(...)`.
- Maintain 2-space indentation and follow naming conventions.
- Prefer small, composable nodes with minimal parameters and clear `preview` strings to aid debugging in the UI.
