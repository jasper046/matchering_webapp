### Game Plan: Server-Centric Audio Handling

Our strategy is to incrementally replace client-side processing with server-side operations, starting with the non-stem mode as a proof of concept.

**Very First Step: Refactor `script.js`**

Split `app/static/script.js` into smaller, more logical files to improve maintainability and reduce the complexity of future modifications.

**Target 1: Server-Side Waveform Image Generation**

The first goal is to stop sending the entire WAV file to the browser just to display a waveform.

1.  **Create a Waveform Image API Endpoint:** I will add a new endpoint to the Python server that takes an audio file path, reads it, generates a PNG image of its waveform (or a flatline placeholder), and returns the image.
2.  **Refactor Frontend Waveform Display:** I will modify the JavaScript code to simply display this image in an `<img>` tag, removing all canvas-related waveform drawing logic.
3.  **Initial "Flatline" Image:** The frontend will initially display a placeholder "flatline" waveform image, which the server can also generate.

**Target 2: Implement Audio Streaming**

Next, we'll replace the sluggish file transfer and complex JavaScript playback with efficient streaming.

1.  **Build an Audio Streaming Endpoint:** I will create another new endpoint on the server. This endpoint will take an audio file, transcode it on-the-fly to a high-quality compressed format (like Ogg Vorbis or MP3), and stream it directly.
2.  **Simplify Frontend Playback:** I will replace the custom `AudioWorklet`-based player with a standard HTML5 `<audio>` element. Its source will be our new streaming endpoint.

**Target 3: Adapt for Stem Mode**

Once the new system is proven with single files, I will extend it to the more complex stem-separation mode.

1.  **Extend Server-Side Logic:** The waveform and streaming endpoints will be updated to handle multiple audio stems, generating and streaming them efficiently.
2.  **Update Stem UI:** The frontend will be adapted to display waveforms for all stems and manage the playback of the streamed audio, ensuring they play in sync.

This plan will significantly reduce the load on the browser, fix the underlying fragility, and create a much smoother, more responsive user experience.