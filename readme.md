# Aubit Viewer

A local-first workbench for Aubit code-audit reports. Edit YAML or JSON, navigate findings and suggested changes, and export complete Markdown, HTML, or Clank reports. Report processing runs in the browser; there is no report-upload service.

## Run

Use Bun 1.4.2 or newer. Node 26 or newer is needed for the production browser checks, not for the deployed website.

```sh
bun install --frozen-lockfile
bun run dev
```

Vite prints the local development address. To inspect the deployable build instead:

```sh
bun run build
bun run preview
```

Deploy the contents of `dist/` to a static HTTPS host. No Node/Bun process or server-side application is required after building. Relative asset URLs support hosting at a subpath. Serve JavaScript workers with JavaScript MIME types; do not rewrite worker or asset requests to `index.html`. The supplied `_headers` file configures security headers on hosts that support that format. Configure equivalent headers on other hosts.

The repository is a private **application package**, not an npm library. CI creates a static build artifact; it does not publish npm packages or deploy the website automatically.

## Workspace

The design retains the Claude candidate's restrained, full-height interface: a Monacozen editor on the left, a resizable divider, and four views on the right. Panes stack on narrow screens.

| View | Purpose |
| --- | --- |
| Visualization | Priority distribution, category filters, full-text search, priority/category/file grouping, and rich suggested-edit previews. |
| Markdown | Complete generated Markdown in a read-only editor. |
| Preview | The generated Markdown rendered as sanitized HTML. |
| Clank | The original parsed input value, before schema defaults and presentation normalization. |

Click a finding in the visualization to briefly highlight its source entry and place the caret at the end of the entry's last contentful line. Clicking the same finding again cycles the caret to the start of the entry's first contentful line (right of the indentation), then selects the whole entry, then returns to the end. Click an input diagnostic to select its original source range. Moving the editor cursor into a finding highlights its card. Filters remain in place when switching views and affect only the visualization, never complete exports. Large reports initially render 100 findings; the remaining findings can be loaded incrementally. Inline code previews show at most 200 lines while downloads retain all content.

The source toolbar supports Open, Example, New, YAML/JSON formatting, Undo replacement, and exact input download. The output toolbar copies or downloads the current format and can create a compressed share link. The help dialog documents the report format, privacy model, and limits.

## Input format

```yaml
entries:
  meaningful_id:
    title: A clear description of the issue
    priority: 2
    category: correctness
    description: Optional context and rationale.
    suggestedChanges:
      - file: src/example.ts
        edit:
          action: append
          content: "// Suggested code\n"
```

`src/lib/schema/aubit.schema.ts` is the source of truth. The app also exposes a JSON Schema download from Help. The original fixture's validation semantics are preserved.

Priorities range from P0 (critical) through P4 (trivial); omitted priority defaults to P3. `category`, `edit`, and regex `flags` accept one value or a nonempty array. The domain model normalizes these for display without altering the raw Clank representation. All twelve edit actions and text, pattern, and line needles are represented. Suggested changes and regexes are never applied to files or executed against content.

Mapping keys must be strings. Quote numeric finding IDs. Duplicate keys, unknown tags, multiple YAML documents, cyclic aliases, unsafe numbers, and unsupported YAML value types produce diagnostics instead of silently losing information.

## Exports and fidelity

| Export | Guarantee |
| --- | --- |
| Input YAML/JSON | Exact current source text, including comments and whitespace. |
| Clank | Original safely parsed data. Omitted defaults remain omitted and scalar arrayable values stay scalar. |
| Markdown | All findings and human-readable edits, plus fenced change-data YAML preserving exact paths and edit contents. Schema defaults are part of this interpreted report. |
| HTML | Self-contained sanitized rendering of the complete Markdown report with trusted inline CSS and no remote assets. |

Formatting is a deliberate reserialization of the **raw** value. It does not insert Zod defaults, but it removes source comments and spelling choices such as anchor syntax. Undo replacement retains the pre-format draft. Text copied through an operating-system clipboard may have platform-normalized newlines; use file downloads for exact bytes.

Report titles and descriptions are treated as literal data. They cannot insert arbitrary HTML or Markdown structure. Raw HTML is escaped, image URLs are not loaded, and the Markdown renderer applies DOMPurify with an explicit allowlist. Downloads include a restrictive content security policy.

While the current input is invalid or being parsed, the last valid visualization may remain as context. Its banner is explicit, and its report-export controls and source navigation are disabled. Clank never silently substitutes an older document.

## Draft recovery and privacy

Draft text, a replacement-recovery copy, theme, selected tab, and pane layout are stored in this browser. Storage is not encrypted and should not be treated as a vault for credentials. Download important work before clearing site data or using shared devices.

Open, New, Example, incoming share links, and Format create a recovery checkpoint. Undo replacement swaps back to that checkpoint. Storage failures are shown in the footer rather than crashing the app. If another tab changes the saved draft, autosave pauses in this tab; the user can download it, reload, or explicitly choose **Save this tab**. That action preserves the other tab's saved text as the recovery copy.

Sharing is opt-in. A generated link contains the **entire editor text** in a compressed URL fragment. Anyone holding it can read the report. New links never put report data in the query string, and consumed links are removed from the address bar. Original Claude fragment links and Grok `?yaml=` links are accepted for migration. Malformed or oversized links leave the saved draft intact. No analytics, third-party scripts, or report-upload calls are implemented.

## Safety budgets

| Resource | Limit |
| --- | ---: |
| Input UTF-8 bytes | 2,000,000 |
| Findings | 5,000 |
| Data nesting | 64 levels |
| Traversed expanded values | 100,000 |
| Estimated expanded rendering data | 8 MB |
| YAML alias expansion | 100, plus the separate traversal budgets |
| Parser-worker deadline | 6 seconds |
| Generated share fragment | 64,000 characters |

Parsing runs in a dedicated worker and stale responses are discarded. Decompression is streamed into a bounded buffer. Extremely large reports should be split; rejected input remains editable and downloadable.

Monacozen 0.5.1 guards recursive YAML aliases across its document-based language-service operations, so Aubit no longer needs a recursive-alias editor fallback or a downstream dependency patch. Anchors and aliases remain in normal schema-aware YAML mode; the application's bounded parser remains authoritative. Only oversized input falls back to the syntax-only editor as a resource guard. See `docs/monaco-yaml-guard.md` for the regression boundary.

## Keyboard

Focus the divider and use arrow keys to resize. The output tab strip supports Left, Right, Home, and End. Priority/category/file grouping supports arrow keys as a radio group. Alt+1 through Alt+4 select views; AltGr combinations are ignored. Escape closes Help. Monaco supports its normal editor shortcuts, including Ctrl+Space for schema completion and Ctrl+F for search.

## Validation

```sh
bun run typecheck
bun run lint:style
bun run test
bun run test-live
# Or all of the above:
bun run check
```

The component tests isolate Monaco for deterministic UI-unit checks. **Production browser checks use real Chrome, real Monaco, real workers, native paste, completed downloads, and production static serving.** They check page/console errors, outbound requests, source navigation, all views, raw-data fidelity, malicious input, storage/clipboard failure paths, recovery, responsive resizing, and dark/light screenshots.

The browser runner finds Chrome/Chromium in common Windows, macOS, and Linux locations. Set `BROWSER_PATH` for another installation:

```powershell
$env:BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
bun run test-live
```

Results are written to `out/test/browser/results.json`; screenshots, DOM captures, and completed exports are stored beside it. `TEST_FILTER` can run a focused browser check during debugging. The full verification is the unfiltered run.

The supported target is current desktop Chromium with responsive narrow layouts. Browser emulation of 360/432-pixel screens is covered; it is not a claim of testing on physical phones or Safari. Browser clipboard access requires HTTPS or localhost.

## Implementation lineage

Claude Opus 5.5's Aubit Viewer is the visual/domain-model base. GPT-6.1 Sol's ideas informed bounded parsing, raw-data fidelity, literal-safe exports, production serving, lazy chunk preservation, Oxc builds, and broader acceptance checks. Additional engineering includes worker isolation, streaming-bounded share links, cross-tab recovery, progressive rendering, source-order preservation for numeric-looking IDs, and the Monaco YAML guard.

Detailed decisions and provenance: `docs/implementation.md`. Latest locally recorded verification: `docs/verification.md`.

## License

MIT. The existing repository history and license are preserved. Third-party dependencies retain their respective licenses.
