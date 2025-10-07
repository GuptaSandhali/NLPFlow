Local ffmpeg.wasm assets

Place the following files in this folder if you want to run video clipping fully offline (without loading from a CDN):

Required files (matching @ffmpeg/ffmpeg 0.12.x):
- ffmpeg.min.js
- ffmpeg-core.js
- ffmpeg-core.wasm
- ffmpeg-core.worker.js

Where to get them:
- From the NPM packages:
  - @ffmpeg/ffmpeg@0.12.10 (ffmpeg.min.js)
  - @ffmpeg/core@0.12.10 (ffmpeg-core.*)

Recommended filenames/paths in this folder:
- assets/ffmpeg/ffmpeg.min.js
- assets/ffmpeg/ffmpeg-core.js
- assets/ffmpeg/ffmpeg-core.wasm
- assets/ffmpeg/ffmpeg-core.worker.js

How to configure the node:
- In the Video Clip Shorts node parameters, set:
  - ffmpegScriptUrl: assets/ffmpeg/ffmpeg.min.js
  - ffmpegCorePath: assets/ffmpeg/ffmpeg-core.js

Notes:
- ffmpeg-core.js will look for ffmpeg-core.wasm and ffmpeg-core.worker.js in the same directory as ffmpeg-core.js.
- Keep versions aligned (0.12.x for both @ffmpeg/ffmpeg and @ffmpeg/core).
- If loading fails for any reason, the node falls back to simulation and will show a warning in the UI.

