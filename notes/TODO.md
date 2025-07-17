# TODO

- **Add visualization of presets**
  - **Description:** Create a graphical representation of the data stored within a preset file. This would likely involve:
    - A **frequency spectrum plot** to visualize the tonal balance (e.g., bass, mids, treble).
    - An **RMS level indicator** to show the target loudness.
  - **Benefits:**
    - Allows for quick visual comparison and selection of presets.
    - Leads to more informed decisions when blending presets.

- **Add a simple gain reduction control to prevent clipping**
  - **Description:** Implement a simple and effective way to prevent clipping when blending presets.
    - **UI Control:** Add a "Gain Reduction" slider or input field (e.g., 0 dB to -6 dB).
    - **Process:** Apply this gain reduction to the audio *before* it enters the main `matchering` processing stage.
    - **Limiter:** Rely on the built-in `matchering` limiter to automatically compensate for the gain loss, effectively providing a transparent anti-clipping mechanism.
  - **Benefits:**
    - Simple and intuitive for the user.
    - Prevents digital clipping and distortion.
    - Leverages the existing, high-quality limiter already in the library.

- **Add multi-track/sound separation option** (e.g. using https://github.com/nomadkaraoke/python-audio-separator/tree/main)
  - **Description:** Integrate an AI-powered source separation tool to enable advanced workflows.
    - **Process stems individually:** Separate a song into vocals and instrumentals (or more stems like drums, bass, etc.) and apply different mastering settings to each before recombining them.
    - **Create presets from stems:** Generate a preset from just the instrumental or vocal part of a reference track to create more targeted sound profiles.
  - **Benefits:**
    - Can lead to cleaner, more professional masters with better separation.
    - Opens up powerful new creative possibilities for sound design and mastering.

- **Optimize preset blending**
  - **Analysis:** The current preset blending implementation averages the raw audio samples of the `loudest_pieces`. This is suboptimal as it can lead to phase cancellation and other artifacts. A better approach is to concatenate the `loudest_pieces` from the selected presets, as the matchering algorithm's use of STFT allows it to handle variable data lengths.
  - **How to move forward:**
    1.  **Modify blending logic:** Instead of averaging the `reference_mid_loudest_pieces` and `reference_side_loudest_pieces` arrays, concatenate them. The other scalar values (like `reference_match_rms`) can still be averaged.
    2.  **Consider data length:** It may be wise to cap the total length of the concatenated data to avoid excessive processing times, perhaps by taking a random or sequential subset of pieces from each preset.
    3.  **Test the new method:** Create blended presets using both methods and compare the audible results and frequency spectrums to verify that the new method produces a more desirable and accurate blend.