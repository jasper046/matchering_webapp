# TODO

- **Optimize preview playback and output generation**
  - **Description:** When making adjustments of blend ratios and volumes the app response can become choppy, because there is too much processing going on. The full output wav file is being regenerated for every adjusment. Frame based processing could fix the user experience considerably.
  - **How to move forward:**
    - Create a test to compare frame-by-frame processing to full wav processing, e.g. frames with 25% overlap with raised cosine crossings.
    - After finding optimal frame based processing, apply it in the webapp

- **Batch processing with stem separation and master limiter setting**
  - **Description:** Batch processing is still only available for non-stem matchering without master limiting. This functionality should be added.
    
- **Add visualization of presets (low prio) **
  - **Description:** Create a graphical representation of the data stored within a preset file. This would likely involve:
    - A **frequency spectrum plot** to visualize the tonal balance (e.g., bass, mids, treble).
    - An **RMS level indicator** to show the target loudness.
  - **Benefits:**
    - Allows for quick visual comparison and selection of presets.
    - Leads to more informed decisions when blending presets.

- **Remove preset blending**
  - **Analysis:** The current preset blending implementation averages the raw audio samples of the `loudest_pieces`. This is suboptimal as it can lead to phase cancellation and other artifacts. A better approach is to concatenate the `loudest_pieces` from the selected presets, as the matchering algorithm's use of STFT allows it to handle variable data lengths.
  - **How to move forward:**
    - Remove preset blending tab as we don't know exactly what the effect is of the way we blend presets tpgether
    - Create an option to apply multiple presets sequentially or in parallel (TBD)

