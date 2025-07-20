# TODO

## 🎯 Priority Summary

1. **🚨 HIGH PRIORITY:** Fix preset blending quality issues (potential audio artifacts)
2. **🔶 MEDIUM PRIORITY:** Complete batch processing with stem separation + master limiter
3. **📋 LOW PRIORITY:** Add visualization of presets
4. **📋 FUTURE:** Multi-instance GPU sharing

---

- **✅ COMPLETED: Optimize preview playback and output generation**
  - **Status:** ✅ COMPLETED (January 2025)
  - **Description:** Real-time frame-based processing system implemented to eliminate choppy response during parameter adjustments.
  - **Implementation Details:**
    - JIT (Just-In-Time) audio processing using AudioWorklet/ScriptProcessorNode
    - Frame-based processing with 25% overlap and raised cosine crossfading
    - Real-time parameter updates for blend ratios, gains, mute states, and limiter
    - Support for both stem and non-stem modes
    - Fallback to file-based processing when JIT unavailable
    - Comprehensive state management and cleanup system
  - **Result:** Smooth, responsive UI with real-time audio parameter adjustments

- **Batch processing with stem separation and master limiter setting**
  - **Description:** Batch processing is still only available for non-stem matchering without master limiting. This functionality should be added.
    
- **Add visualization of presets (low prio) **
  - **Description:** Create a graphical representation of the data stored within a preset file. This would likely involve:
    - A **frequency spectrum plot** to visualize the tonal balance (e.g., bass, mids, treble).
    - An **RMS level indicator** to show the target loudness.
  - **Benefits:**
    - Allows for quick visual comparison and selection of presets.
    - Leads to more informed decisions when blending presets.

- **❌ REJECTED: Add Inflator to Master Stage**
  - **Status:** ❌ REJECTED (Decision Final)
  - **Description:** Integrate an inflator effect into the master processing chain, similar to the RCInflator2_Oxford.jsfx.
  - **Reason for Rejection:** Detailed feasibility study revealed that direct porting of .jsfx is not possible, and re-implementation in C++ with Python bindings, while technically feasible, is a high-effort task requiring significant DSP expertise and development time, exceeding current project scope.
  - **Action:** Remove from active TODO considerations

- **🚨 HIGH PRIORITY: Fix preset blending quality issues**
  - **Status:** 🚨 CRITICAL - Potential audio quality degradation
  - **Analysis:** The current preset blending implementation averages the raw audio samples of the `loudest_pieces`. This is suboptimal as it can lead to phase cancellation and other artifacts. A better approach is to concatenate the `loudest_pieces` from the selected presets, as the matchering algorithm's use of STFT allows it to handle variable data lengths.
  - **Current Risk:** Users may be experiencing unintended audio artifacts from preset blending
  - **How to move forward:**
    - **Option 1:** Remove preset blending tab entirely (safest short-term solution)
    - **Option 2:** Implement proper concatenation-based blending instead of averaging
    - **Option 3:** Add warning about potential artifacts and user education
  - **Recommendation:** Investigate current usage and implement Option 1 or 2 based on findings

- **Multi-instance GPU sharing**
  - **Context:** Running multiple instances of the application on a single GPU will lead to conflicts, primarily due to VRAM limitations and compute resource contention. This will result in out-of-memory errors and slower processing times.
  - **Solution:** Implement a job queue system (e.g., using Celery with Redis or RabbitMQ).
    - A single, dedicated worker process should have exclusive control over the GPU.
    - Web app instances should add separation tasks as "jobs" to a queue.
    - The worker process will execute jobs from the queue sequentially, ensuring efficient and conflict-free GPU usage.