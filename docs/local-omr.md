# Browser-local sheet music recognition

Piano Coach's OMR path runs in the visitor's browser. It does not send page images to an OMR API or require an OMR API key.

## Flow

1. The student opens the original PDF, EPUB, or sheet image in Sheet Music.
2. They choose the page numbers to recognise (up to 25 pages per run).
3. PDF pages are rasterised by PDF.js; EPUB page images and uploaded sheet images are rasterised locally.
4. The HOMR engine runs in a module Web Worker using Pyodide and ONNX Runtime Web. It uses WebGPU for the larger models when available and falls back to WebAssembly.
5. The recognised MusicXML is merged across selected pages, converted into a versioned .musiccoach analysis document, and stored as a hidden linked file.
6. The original PDF/EPUB/image remains the practice display. The linked .musiccoach timeline powers Assisted Practice and score-aware Standard Practice.

## First use and privacy

- The first recognition downloads approximately 151 MB of model weights and caches them in the browser. Later sessions reuse the cached weights.
- Downloads are chunked and cached so interrupted downloads can resume.
- Recognition runs locally. Original score pages are not uploaded to a third-party recognition service.
- The small .musiccoach analysis document is stored in the user's Piano Coach library storage and is hidden from the visible sheet list.
- Recognition results must be checked against the original page before relying on them.

## Compatibility

The bundled HOMR browser bridge uses WebAssembly JSPI and currently requires a recent JSPI-capable browser (Chrome/Edge 137+). Devices without JSPI can still read the original book and use Standard Practice, but cannot run this local OMR build.

## Licensing

The browser integration is adapted from HOMR and Partsong and is distributed under AGPL-3.0 / AGPL-3.0-or-later. See OMR-LICENSES.md and the generated third-party notices. AGPL network-use source obligations must be reviewed before enabling this feature for production users.
