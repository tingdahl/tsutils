# @tingdahl/tsutils

Generic, product-agnostic TypeScript utilities for web applications.

## Modules

- **`@tingdahl/tsutils/cache`**: Generic cross-tab cache invalidation service powered by `BroadcastChannel` with tab isolation and pub-sub listener dispatch.
- **`@tingdahl/tsutils/proto`**: Generic protobuf inspection and logging interceptor that hooks `.encode()` and `.decode()` across namespace hierarchies.
- **`@tingdahl/tsutils/ui`**: Single-Page Application (SPA) panel/page management lifecycle handler (`PageManager`, `PanelHandler`, `PanelLoader`).
- **`@tingdahl/tsutils/zip`**: Zero-dependency standard ZIP archive writer and reader (`ZipWriter`, `unzipEntries`, `calculateCrc32`).

## Installation

```bash
npm install @tingdahl/tsutils
```

Or for local sibling development:
```json
{
  "dependencies": {
    "@tingdahl/tsutils": "file:../../tsutils"
  }
}
```

## License

ISC
