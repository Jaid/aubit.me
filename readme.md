# Aubit Viewer

A local-first workbench for Aubit code-audit reports. Edit YAML or JSON, navigate findings and suggested changes, and export complete Markdown, HTML, or Clank reports. Report processing runs in the browser; there is no report-upload service.

## Run

Use the Bun version pinned in `package.json`. The production browser checks also require Chrome or Chromium.

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

The workspace has a Monacozen editor on the left, a resizable divider and six views on the right. Panes stack on narrow screens.

| View | Purpose |
| --- | --- |
| Render | Explore enabled findings by priority, category or file, search the report and preview suggested edits. |
| Edit | The same dashboard with a switch that writes `visible` into the entry. Turn a finding off to omit it from Render, Markdown, HTML and Clank, or turn it back on to include it again. Visibility travels with the document. |
| Markdown | Generated Markdown for all enabled findings in a read-only editor. |
| Preview | The generated Markdown rendered as sanitized HTML. |
| Clank | All reports with hidden entries omitted, before schema defaults and presentation normalization. |
| Prompt | Review instructions followed by the current Clank output, ready to copy or download as `aubit-prompt.txt`. |

Click a finding in the visualization to briefly highlight its source entry and place the caret at whichever edge of the entry is nearest: the end of the entry's last contentful line or the start of its first contentful line (right of the indentation). Nearness is measured from the current caret, from the center of all carets if there are several, or from the center of the visible editor area if no caret has been placed yet. Clicking the same finding again toggles the caret between both edges; nothing gets selected. Moving the caret, editing or revealing another finding starts over at the nearest edge. Click an input diagnostic to select its original source range. Moving the editor cursor into a finding highlights its card. Filters remain in place when switching views and affect only the visualization, never complete exports. Large reports initially render 100 findings; the remaining findings can be loaded incrementally. Inline code previews show at most 200 lines while downloads retain all content.

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

The editor takes an Aubit **document**. Only `entries` is required, so a standalone report can be opened directly. To collect multiple reports, map report IDs under the optional `collection` field to objects with their own `entries`. Use the report selector to choose which entries to render, edit or export as Markdown/HTML. Input downloads and share links contain the entire document, including hidden entries.

Review fields on an entry are optional: `state` (`open`, `resolved` or `rejected`), `visible` and `comment`. Only `visible: false` hides a finding. Shared YAML anchors and aliases can be edited directly in the source. Validation, editor completion and the JSON Schema download in Help use the document schema from `aubit-schema`.

Priorities range from P0 (critical) through P4 (trivial); omitted priority defaults to P3. `category`, `edit`, and regex `flags` accept one value or a nonempty array. The domain model normalizes these for display without altering the raw Clank representation. All twelve edit actions and text, pattern, and line needles are represented. Suggested changes and regexes are never applied to files or executed against content.

Mapping keys must be strings. Quote numeric finding IDs. Duplicate keys, unknown tags, multiple YAML documents, cyclic aliases, unsafe numbers, and unsupported YAML value types produce diagnostics instead of silently losing information.

## Exports and fidelity

| Export | Guarantee |
| --- | --- |
| Input YAML/JSON | Exact current source text, including comments and whitespace. |
| Clank | Omits hidden entries and strips the `visible` field from included entries in every report. Omitted defaults remain omitted and scalar arrayable values stay scalar. |
| Markdown | All enabled findings and their human-readable edits, plus fenced change-data YAML preserving exact paths and edit contents. Schema defaults are part of this interpreted report. |
| HTML | Self-contained sanitized rendering of the complete Markdown report with trusted inline CSS and no remote assets. |

Formatting is a deliberate reserialization of the **raw** value. It does not insert Zod defaults, but it removes source comments and spelling choices such as anchor syntax. Undo replacement retains the pre-format draft. Text copied through an operating-system clipboard may have platform-normalized newlines; use file downloads for exact bytes.

Report titles and descriptions are treated as literal data. They cannot insert arbitrary HTML or Markdown structure. Raw HTML is escaped, image URLs are not loaded, and the Markdown renderer applies DOMPurify with an explicit allowlist. Downloads include a restrictive content security policy.

A spinner beside Copy indicates that the current input is being parsed. If validation fails, a banner identifies the last valid report when it is shown. Report exports and source navigation pause until validation succeeds. Clank never silently substitutes an older document.

## Draft recovery and privacy

Draft text, a replacement-recovery copy, theme, selected tab, and pane layout are stored in this browser. Storage is not encrypted and should not be treated as a vault for credentials. Download important work before clearing site data or using shared devices.

Open, New, Example, incoming share links, and Format create a recovery checkpoint. Undo replacement swaps back to that checkpoint. Storage failures are shown in the footer rather than crashing the app. If another tab changes the saved draft, autosave pauses in this tab; the user can download it, reload, or explicitly choose **Save this tab**. That action preserves the other tab's saved text as the recovery copy.

Sharing is opt-in. A share link contains the **entire editor text** in a compressed, versioned URL fragment. Anyone holding it can read the report. After the report opens, the viewer removes the fragment from the address bar. Malformed or oversized links leave the saved draft intact. The viewer does not read reports from query parameters.

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

Anchors and aliases remain in schema-aware YAML mode; the application’s bounded parser remains authoritative. Only oversized input falls back to the syntax-only editor.

## Keyboard

Focus the divider and use arrow keys to resize. The output tab strip supports Left, Right, Home and End. Priority/category/file grouping supports arrow keys as a radio group. Alt+1 through Alt+6 select Render, Edit, Markdown, Preview, Clank and Prompt respectively; AltGr combinations are ignored. Escape closes Help. Monaco supports its normal editor shortcuts, including Ctrl+Space for schema completion and Ctrl+F for search.

## Validation

```sh
bun run typecheck
bun run lint:style
bun run test
bun run test-live
# Or all of the above:
bun run check
```

`bun run test` runs unit tests for parsing, source mapping, caret placement, exports and sharing. `bun run test-live` serves the production build and exercises the UI in Chromium with real Monaco workers, native paste and completed downloads. The checks cover source navigation, all views, export fidelity, storage and clipboard failures, recovery and responsive layouts. Each check also fails on browser errors or unexpected outbound requests.

Type checking uses TypeScript 7. Typed ESLint rules use TypeScript Classic because the current `@typescript-eslint/parser` requires the classic compiler API.

The browser runner finds Chrome/Chromium in common Windows, macOS, and Linux locations. Set `BROWSER_PATH` for another installation:

```powershell
$env:BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
bun run test-live
```

Results are written to `out/test/browser/results.json`; screenshots, DOM captures, and completed exports are stored beside it. `TEST_FILTER` can run a focused browser check during debugging. The full verification is the unfiltered run.

The supported target is current desktop Chromium with responsive narrow layouts. Browser emulation of 360/432-pixel screens is covered; it is not a claim of testing on physical phones or Safari. Browser clipboard access requires HTTPS or localhost.

## License

MIT. The existing repository history and license are preserved. Third-party dependencies retain their respective licenses.
