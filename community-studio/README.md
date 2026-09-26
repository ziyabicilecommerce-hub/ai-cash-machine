# Purivelle Community Studio

Static, dependency-free content studio integrated into the existing GitHub Pages site.
Uses ten actual Purivelle product records and unchanged Shopify CDN images, retrieved 2026-09-26.

## Delivered

- 35 editable German draft posts, five slots per day, Europe/Berlin; image/video/mixed modes.
- Three canvas layouts, PNG export, 20/30/60/600-second silent video export using browser MediaRecorder.
- 600 seconds is a ten-chapter pause timer, not generative video or a medical demonstration.
- Local draft persistence, JSON backup, general planning CSV, and a two-column image-only Metricool Autolist CSV.
- Service worker for cached app resources and images already accessed. Initial loading requires internet.
- No tokens, subscriptions, generation APIs or analytics trackers in the app. Browser APIs are used.

## Limits and honest state

The app does not schedule posts or buy subscriptions. The existing connected channel has anime content, so this studio does not repurpose it. `publishing-status.json` records only confirmed Purivelle scheduling, not fictional activity. No paid ads are launched.

Video rendering is real-time; keep the tab visible. Tab hiding cancels instead of reporting a damaged export as successful. MP4 is selected when supported, otherwise WebM. Metricool may require conversion to MP4. Images are loaded with CORS; failed loads block export. Videos have no soundtrack. Ten-minute videos are not Shorts.

Autolist CSV is headerless, UTF-8, two columns (caption, original image URL), per Metricool documentation. It contains image posts only, not unrendered video ideas. Import under Metricool Autolists and assign a suitable shop channel and schedule. Account limits still apply. Calendar CSV is a general planning file, not the Metricool calendar template.

Five posts per day is the requested planning capacity, not a growth guarantee. Adjust to actual audience response; answer comments personally. Public posting and permanently free hosting cannot be guaranteed.

## Run and test

Serve this repository with any static HTTP server, open `/community-studio/`.
`node --test community-studio/plan.test.mjs`

## Sources checked

- https://help.metricool.com/how-to-schedule-posts-in-batch-with-a-csv-file-in-metricool-3zwxj
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- https://support.google.com/youtube/answer/1311392

The product facts come from https://purivelle.store/products.json?limit=30; no cure, efficacy, testimonial, discount or sales claims were generated.
