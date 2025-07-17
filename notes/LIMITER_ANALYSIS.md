# Limiter Analysis in Matchering Library

This document analyzes the behavior of the `matchering` library's internal limiter, particularly concerning gain compensation and the order of operations within the processing chain.

## Limiter's Gain Compensation

The `matchering` library's `limit` function (found in `matchering/limiter/hyrax.py`) inherently includes automatic makeup gain. This is a common design in professional limiters, where the primary goal is to prevent peaks from exceeding a certain threshold while maintaining or increasing the overall perceived loudness.

The process within the `limit` function can be summarized as follows:

1.  **Rectification and Thresholding**: The input audio `array` is first `rectify`-ed against a `config.threshold`. This threshold is typically set very close to 0 dBFS (e.g., `(2**15 - 61) / 2**15`, which is approximately -0.01 dBFS). This step effectively determines how much the audio's peaks are exceeding or falling short of this target maximum level.
2.  **Gain Calculation**: A `gain_hard_clip` value is calculated as `1.0 / rectified`.
    *   If the audio is clipping (i.e., `rectified` is greater than 1), `1.0 / rectified` will be less than 1, indicating a gain *reduction*.
    *   If the audio is below the threshold (i.e., `rectified` is less than 1), `1.0 / rectified` will be greater than 1, indicating a gain *increase* (makeup gain).
    *   The `flip` function is then used, likely to correctly scale or invert the gain value for application.
3.  **Gain Envelope Smoothing**: The calculated `gain` envelope is then smoothed over time using `__process_attack` and `__process_release` functions, which apply the limiter's attack, hold, and release time constants.
4.  **Application of Gain**: Finally, the input audio `array` is multiplied by this dynamically calculated `gain` envelope (`array * gain[:, None]`).

**Conclusion on Gain Compensation**: When a signal is reduced by a fixed amount (e.g., -6dB by multiplying by 0.5) before being fed into this `limit` function, the limiter will detect that the peaks are now lower relative to its internal `config.threshold`. Consequently, it will automatically apply a higher makeup gain to bring those peaks back up to the `config.threshold`, effectively compensating for the initial reduction and preventing clipping at the output.

## Order of Operations: Limiting vs. Gain Matching

A point of concern was raised regarding the order of operations within the `matchering` library's `__finalize` function (in `matchering/stages.py`):

```python
    if need_default:
        result = limit(result_no_limiter, config)
        result = amplify(result, final_amplitude_coefficient)
```

Here, the `limit` function is applied first, followed by an `amplify` function using `final_amplitude_coefficient`.

**Analysis of the Order**:
From a strict mastering perspective, a brickwall limiter is almost universally the *final* process in the signal chain to ensure no digital clipping occurs. Applying a subsequent `amplify` stage *after* the limiter carries a risk: if `final_amplitude_coefficient` is greater than 1 (meaning the reference track was louder than the processed target), this amplification could push samples above 0 dBFS, potentially introducing inter-sample peaks or true peaks that result in clipping.

However, it's important to consider `matchering`'s core purpose: "audio matching." The `final_amplitude_coefficient` is crucial for matching the *overall perceived loudness* of the target audio to that of the reference track. The library's design might prioritize this loudness matching, assuming that:
*   The `final_amplitude_coefficient` is often less than or equal to 1, thus not causing further clipping.
*   The `limit` function itself might incorporate some internal oversampling or provide a small amount of "true peak" headroom, or the `config.threshold` (being slightly below 0 dBFS) offers sufficient buffer for minor post-limiter amplifications.

**Relevance to Current Implementation**:
For the current task of implementing headroom and limiting on the *blended output* within `app/main.py`, the chosen approach is robust:

```python
            if apply_limiter:
                # Apply -6dB gain reduction for headroom
                blended_audio = blended_audio * 0.5
                # Use the matchering limiter to compensate and prevent clipping
                blended_audio = limit(blended_audio, mg.Config())
```

In this sequence, the `limit` function is indeed the *final* process applied to the `blended_audio` before it is saved. There is no subsequent `amplify` step using `final_amplitude_coefficient` in this specific part of the code. This ensures that the blended output, when the limiter is applied, will be properly limited and free of clipping, regardless of the internal processing order within the `matchering` library's core `__finalize` function.
