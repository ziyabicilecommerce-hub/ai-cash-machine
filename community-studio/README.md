# Purivelle & DeskRebel Community Studio

Static, dependency-free content studio integrated into the existing GitHub Pages site.
Uses ten actual product records and their existing Shopify images for each shop. DeskRebel products were read from the public catalog on 2026-09-27.

## Delivered

- Separate 35-post German plans for Purivelle and DeskRebel, five slots per day, Europe/Berlin; image/video/mixed modes.
- PNG export and 12/20/30-second vertical UGC editing with creator footage supplied by the user, timed captions, product cutaway, and browser MediaRecorder.
- The editor does not generate a talking person, voice, or original creator footage. It refuses to export a still-image-only clip as UGC.
- Local draft persistence, JSON backup, general planning CSV, and a two-column image-only Metricool Autolist CSV.
- Service worker for cached app resources and images already accessed. Initial loading requires internet.
- No tokens, subscriptions, generation APIs or analytics trackers in the app. Browser APIs are used.

## Limits and honest state

The app does not generate new creator footage or schedule posts. The only connected Metricool brand is `futureflowxx`, which currently has anime content; this studio does not repurpose it. Connect dedicated Purivelle and DeskRebel social brands before scheduling shop posts. `publishing-status.json` records the current confirmed shop-post count. No paid ads are launched.

Video rendering is real-time; keep the tab visible. Tab hiding cancels instead of reporting a damaged export as successful. MP4 is selected when supported, otherwise WebM. Uploaded clip audio is captured when the browser supports it. Metricool may require conversion to MP4. Images are loaded with CORS; failed loads block export.

Autolist CSV is headerless, UTF-8, two columns (caption, original image URL), per Metricool documentation. It contains image posts only. Import under Metricool Autolists and assign a suitable shop channel and schedule. Account limits still apply. Calendar CSV is a general planning file, not the Metricool calendar template.

Five posts per day is the requested planning capacity, not a growth guarantee. Adjust to actual audience response; answer comments personally. A 12-second creator-style edit needs real creator/product footage. A free, unlimited AI video-generation and auto-posting pipeline is not provided by Metricool alone.

## Run and test

Serve this repository with any static HTTP server, open `/community-studio/`.
`node --test community-studio/plan.test.mjs`

## Sources checked

- https://help.metricool.com/how-to-schedule-posts-in-batch-with-a-csv-file-in-metricool-3zwxj
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- https://support.google.com/youtube/answer/1311392

The product facts come from https://purivelle.store/products.json?limit=30; no cure, efficacy, testimonial, discount or sales claims were generated.
