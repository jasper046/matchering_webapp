# TODO
- add visualization of presets
- add headroom and end-limiter settings to file processing
- add multi-track/sound separation option (e.g. using https://github.com/nomadkaraoke/python-audio-separator/tree/main)
  - add option to separate vocals from instrumentals and process them individually
  - add option to distill vocal and instrumental and generate presets
- optimize preset blending

  The current preset blending implementation averages the raw audio samples of the loudest pieces. This is suboptimal as it can lead to phase cancellation and other artifacts.

  A better approach would be to concatenate the loudest pieces from the selected presets. The matchering algorithm can handle variable lengths of audio data, as it uses the Short-Time Fourier Transform (STFT) to analyze the audio in small chunks and then averages the resulting spectrums.

  **How to move forward:**

  1.  **Modify the preset blending logic:**
      - Instead of averaging the `reference_mid_loudest_pieces` and `reference_side_loudest_pieces` arrays, concatenate them.
      - The other values in the preset dictionary (like `reference_match_rms` and `final_amplitude_coefficient`) can still be averaged.

  2.  **Consider the length of the concatenated data:**
      - While the algorithm can handle variable lengths, it might be wise to introduce a maximum length for the concatenated data to avoid excessive processing times. This can be achieved by taking a random or sequential subset of the pieces from each preset.

  3.  **Test the new blending method:**
      - Create a few blended presets using the new method and compare the results with the old method.
      - Listen to the results and analyze the frequency spectrums to ensure that the new method produces a more desirable and accurate blend of the source presets.