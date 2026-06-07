# Handoff: deep-link "open file by URL" for mzPeakIV

Port the deep-link feature already shipped in **mzPeak Explorer** so mzPeakIV can
be started directly on an external `.mzpeak` file via a URL — e.g. a link emitted
by the mzML2mzPeak converter, or one embedded in another page.

```
https://okohlbacher.github.io/mzPeakIV/?file=<percent-encoded URL to a .mzpeak>
```

When that link is opened, the viewer loads the file immediately (no clicks). It
also offers a **Copy link** button that builds such a URL for whatever file is
currently open, so links can be created from the UI as well.

mzPeakIV already has everything needed under the hood — `store.openUrl(url)`
(which even rewrites `s3://bucket/key` → HTTPS via `resolveLoadUrl`). This handoff
is mostly wiring: read the query param on load, remember the source URL, add a
button.

---

## How it behaves (match this)

- **On app load**, if `?file=<url>` (alias `?url=`) is present, auto-open it.
  Accept `http(s)://…` and `s3://…` (mzPeakIV's `resolveLoadUrl` already maps
  `s3://` to the configured BL-S3 HTTPS endpoint). Reject anything else.
- The viewer reads the file over **HTTP range requests** (the existing URL path),
  so only the ZIP footer + the parts actually viewed are fetched — a 145 MB file
  starts in a couple of seconds, not after a full download.
- **Copy link** appears once a file is open *from a URL*; clicking it copies
  `${origin}${pathname}?file=${encodeURIComponent(sourceUrl)}` to the clipboard.
- A failed open (bad URL, or a host without CORS) must stay **recoverable** —
  show the error *and* the file picker so the user can choose another file
  without a manual reload.

## Hard requirement on the hosted file (call this out to users)

The deep-linked object must be served with:
1. **HTTP Range requests** — `Accept-Ranges: bytes`, `206 Partial Content`.
2. **CORS** allowing the viewer origin (`https://okohlbacher.github.io`, or `*`),
   with the `Range` request header allowed and `Content-Range` / `Accept-Ranges`
   exposed.

Files lacking these fail to open cross-origin (the viewer shows a clear error).
The StackIT demo bucket is already configured this way; see the mzML2mzPeak
`docs/deep-links.md` guide for the exact bucket CORS/policy.

---

## Reference implementation (from mzPeak Explorer)

These are the exact changes in mzPeak Explorer (`src/state/store.ts`,
`src/ui/App.tsx`). mzPeakIV's store/components differ slightly (Worker-based
loader, different `LoadStage` values), so adapt symbol names — the logic is the
same.

### 1) Track the source URL in the store

`State` gains a nullable `sourceUrl`; set it when opening from a URL, clear it
when opening a local file.

```ts
// state — add to the State type + initial state
sourceUrl: string | null;   // init: null

// openUrl(url): record the URL so the UI can rebuild a shareable link
openUrl(url) {
  const resolved = resolveLoadUrl(url);     // mzPeakIV already has this
  set({ ...initialState, ...settingsSlice(), stage: "zip-index", sourceUrl: url });
  // …existing worker.postMessage({ type: "loadUrl", url: resolved })…
},

// openFile(file): NOT from a URL
async openFile(file) {
  set({ ...initialState, ...settingsSlice(), stage: "zip-index", sourceUrl: null });
  // …existing…
},
```

> Store the **original** `url` (not the `resolved` one) in `sourceUrl`, so a
> copied link round-trips back through `resolveLoadUrl` for the next visitor
> (i.e. an `s3://` link stays an `s3://` link).

### 2) Read the deep-link param on mount (App.tsx)

```tsx
import { useEffect, useRef } from "react";

const openUrl = useStore((s) => s.openUrl);
const deepLinkDone = useRef(false);
useEffect(() => {
  if (deepLinkDone.current) return;           // run once (StrictMode-safe)
  deepLinkDone.current = true;
  const p = new URLSearchParams(window.location.search);
  const fileUrl = p.get("file") ?? p.get("url");
  if (fileUrl && /^(https?|s3):\/\//i.test(fileUrl)) void openUrl(fileUrl);
}, [openUrl]);
```

`URLSearchParams.get` already percent-decodes, so the value is the plain URL.

### 3) Copy-link button (header)

```tsx
const sourceUrl = useStore((s) => s.sourceUrl);
const [copied, setCopied] = useState(false);
function copyDeepLink() {
  if (!sourceUrl) return;
  const link = `${location.origin}${location.pathname}?file=${encodeURIComponent(sourceUrl)}`;
  void navigator.clipboard?.writeText(link).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  });
}

// render only when a URL-sourced file is open:
{ready && sourceUrl && (
  <Button variant="ghost" size="sm"
    iconLeft={copied ? <Check size={15}/> : <Link2 size={15}/>}
    onClick={copyDeepLink}
    title="Copy a shareable link that opens this file directly">
    {copied ? "Copied" : "Copy link"}
  </Button>
)}
```

### 4) Error recovery

Render the file-picker / idle loader on the **error** stage too, not only on
`idle`, so a bad deep link doesn't strand the user on a blank error screen:

```tsx
{(stage === "idle" || stage === "error") && <FileLoader />}
```

(In mzPeakIV, `stage` is the `LoadStage` union — render the loader for both the
initial empty state and `"error"`.)

---

## Security / privacy notes

- Accept only `http(s)://` (and `s3://`, which `resolveLoadUrl` maps to HTTPS) —
  this blocks `javascript:`/`data:` URLs in the param.
- The URL is only ever passed to `fetch`/range reads and rendered as React **text**
  (filename); there is no `eval`/`innerHTML`, so no XSS surface from the param.
- This does not change the privacy story: the viewer fetches the URL the link
  names (a public object) and never uploads the user's own local files.

## Test checklist

- `?file=<https url>` on the deployed site → auto-opens, reaches the ready view.
- `?file=<s3://…>` → resolves via BL-S3 and opens.
- Open a file by URL → **Copy link** appears → pasted link reopens the same file.
- `?file=<bad/CORS-less url>` → error shown + picker available to recover.
- No param → normal idle screen, unchanged.

## Reference commit

mzPeak Explorer: `071e1a5` — "Deep links: ?file=<url> auto-opens an external
mzPeak; add Copy-link button" (repo `github.com/okohlbacher/mzPeakExplorer`).
