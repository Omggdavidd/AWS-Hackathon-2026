# Architecture diagram

`openloop-architecture.png` is the submission architecture diagram (SPEC §18). `openloop-architecture.svg` is its source: hand-written SVG with no build step and no dependency on a drawing tool or account, so anyone on the team can edit it.

It is a view of [`../architecture.md`](../architecture.md), which stays the authority. When a component, boundary, invariant or deployment target changes there, change the diagram in the same PR.

## Editing

Edit the SVG by hand: the coordinates are plain numbers and each block is commented (`<!-- runtime -->`, `<!-- ledger -->`). The canvas is 1640 x 1160.

Re-export the PNG by screenshotting the SVG with any headless Chromium. On Windows:

```
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --hide-scrollbars --force-device-scale-factor=2 --window-size=1640,1160 \
  --screenshot="$(pwd -W)/openloop-architecture.png" \
  "file:///$(pwd -W)/openloop-architecture.svg"
```

`--force-device-scale-factor=2` is what makes the export 3280 x 2320 and legible when a judge zooms in. Keep the window size equal to the SVG canvas, or the export will be cropped or letterboxed.

Fonts are a system stack (Segoe UI, then `system-ui`); the PNG is what ships, so a machine without Segoe UI will re-export at slightly different text widths. Check the render for overflow before committing it.

## Other diagrams

`../hackathon/state-lifecycle.png` covers the loop state machine. `../hackathon/architecture-proposal.png` is the original playbook sketch, kept as a record of the proposal only — it does not describe what was built.
