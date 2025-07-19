# Frame-Based Audio Processing Gameplan

## Problem Statement

Currently, the web app regenerates entire audio files when users adjust parameters (blend ratios, gains, etc.) during preview playback, causing choppy user experience. We need to implement frame-based processing to enable smooth real-time parameter adjustments.

## Current System Analysis

### Matchering STFT Parameters
- **FFT Size**: 4096 samples 
- **Hop Size**: 4096 samples (no overlap)
- **Window Function**: Boxcar (rectangular) for analysis, Hann for synthesis
- **Sample Rate**: 44100 Hz internally
- **Frame Duration**: ~92.9ms per frame
- **Processing Segments**: Up to 15 seconds for RMS analysis

### Current Processing Pipeline
1. **Channel Processing** (`app/audio/channel_processor.py`):
   - Loads full audio files
   - Applies blending (dry/wet mix)
   - Applies volume adjustment
   - Handles muting
   - Monolithic processing

2. **Master Limiter** (`app/audio/master_limiter.py`):
   - Combines channels (for stem mode)
   - Applies master gain adjustment
   - Applies Hyrax limiter (if enabled)
   - Monolithic processing

## Proposed Frame-Based Architecture

### Frame Design Strategy
Based on matchering's 4096-sample STFT window, we propose testing multiple configurations:

**Option A: 4:1 Ratio (Recommended Starting Point)**
- Full Frame Size: 4 × 4096 = 16,384 samples (~371ms)
- Overlap Size: 1 × 4096 = 4,096 samples (~93ms)
- Overlap Percentage: 25%
- Crossfade: Raised cosine

**Option B: 2:1 Ratio (More Responsive)**
- Full Frame Size: 2 × 4096 = 8,192 samples (~186ms)
- Overlap Size: 1 × 4096 = 4,096 samples (~93ms)
- Overlap Percentage: 50%
- Crossfade: Raised cosine

**Option C: 8:1 Ratio (Higher Quality)**
- Full Frame Size: 8 × 4096 = 32,768 samples (~743ms)
- Overlap Size: 1 × 4096 = 4,096 samples (~93ms)
- Overlap Percentage: 12.5%
- Crossfade: Raised cosine

### Algorithm Design

#### 1. Frame Segmentation
```python
def segment_audio_into_frames(audio, frame_size, overlap_size):
    """Split audio into overlapping frames with metadata."""
    hop_size = frame_size - overlap_size
    frames = []
    for start in range(0, len(audio) - overlap_size, hop_size):
        end = min(start + frame_size, len(audio))
        frame_data = audio[start:end]
        frame_info = {
            'start': start,
            'end': end,
            'needs_crossfade_start': start > 0,
            'needs_crossfade_end': end < len(audio)
        }
        frames.append((frame_data, frame_info))
    return frames
```

#### 2. Frame Processing
```python
def process_frame(frame_data, parameters):
    """Process individual frame with given parameters."""
    # Apply channel blending
    # Apply volume adjustment  
    # Apply master gain
    # Apply limiting (with special handling for state)
    return processed_frame
```

#### 3. Crossfading and Reconstruction
```python
def apply_raised_cosine_crossfade(frame1, frame2, overlap_size):
    """Apply smooth crossfade between overlapping regions."""
    # Generate raised cosine window
    # Apply complementary fades
    # Blend overlapping regions
    return blended_region
```

## Testing Framework Design

### Test Application Structure
```
tests/frame_processing/
├── test_frame_processor.py          # Main test application
├── frame_algorithms.py              # Frame processing implementations
├── quality_metrics.py               # Audio quality assessment
├── performance_benchmarks.py        # Timing and efficiency tests
├── test_audio/                      # Sample audio files
│   ├── short_mono.wav               # 5s test file
│   ├── short_stereo.wav             # 5s test file
│   ├── medium_song.wav              # 30s test file
│   └── test_presets/                # Test preset files
└── results/                         # Output analysis
    ├── quality_comparison.png       # Visual analysis
    ├── performance_results.json     # Benchmark data
    └── processed_samples/           # Output audio files
```

### Quality Metrics to Test

#### 1. Accuracy Metrics
- **RMS Difference**: Compare RMS levels between frame-based and monolithic
- **Frequency Response**: FFT comparison across frequency bands
- **Phase Coherence**: Cross-correlation analysis
- **THD+N**: Total Harmonic Distortion + Noise
- **Peak Level Accuracy**: Maximum sample value comparison

#### 2. Perceptual Metrics
- **A-weighted RMS**: Perceptually weighted loudness
- **Spectral Centroid**: Brightness comparison
- **Zero Crossing Rate**: Transient preservation
- **Spectral Rolloff**: High-frequency content preservation

#### 3. Artifacts Detection
- **Boundary Discontinuities**: Check for clicks/pops at frame boundaries
- **Amplitude Modulation**: Unintended volume fluctuations
- **Frequency Artifacts**: Spectral leakage or aliasing
- **Limiter State Issues**: Pumping or inconsistent limiting behavior

### Performance Benchmarks

#### 1. Processing Speed Tests
- Time to process single frame vs. full file
- Memory usage comparison
- CPU utilization patterns
- Cache efficiency

#### 2. Real-time Viability Tests
- Parameter change response time
- Buffer underrun probability
- Sustained real-time factor

## Implementation Phases

### Phase 1: Research and Foundation (Days 1-2)
1. **Deep dive into matchering limiter implementation**
   - Understand state management
   - Identify lookahead requirements
   - Document internal buffers and delays

2. **Create test framework structure**
   - Set up testing environment
   - Implement quality metrics
   - Create reference audio generation

3. **Implement basic frame segmentation**
   - Audio splitting algorithms
   - Metadata tracking
   - Memory-efficient frame handling

### Phase 2: Channel Processing Frame Implementation (Days 3-4)
1. **Frame-based channel blending**
   - Stateless blending operations
   - Volume adjustment per frame
   - Muting implementation

2. **Quality validation for channel processing**
   - Compare against monolithic implementation
   - Measure artifacts at boundaries
   - Optimize crossfading parameters

### Phase 3: Master Limiter Frame Implementation (Days 5-7)
1. **Limiter state management research**
   - Understand Hyrax limiter internal state
   - Design state preservation strategy
   - Handle lookahead across frame boundaries

2. **Frame-based limiter implementation**
   - State-aware frame processing
   - Boundary condition handling
   - Gain reduction smoothing

3. **Advanced testing and optimization**
   - Stress test with complex audio
   - Performance optimization
   - Parameter tuning

### Phase 4: Integration and Optimization (Days 8-9)
1. **Combined pipeline testing**
   - End-to-end frame processing
   - Multi-parameter change scenarios
   - Edge case handling

2. **Performance optimization**
   - Memory pooling
   - SIMD optimization opportunities
   - Parallel processing options

3. **Final validation and documentation**
   - Comprehensive quality assessment
   - Performance benchmarking
   - Integration recommendations

## Technical Challenges and Solutions

### Challenge 1: Limiter State Management
**Problem**: Audio limiters maintain internal state (gain reduction history, lookahead buffers)
**Solution**: 
- Implement state preservation between frames
- Use overlapping processing regions for state continuity
- Consider frame-aware limiter modifications

### Challenge 2: Boundary Artifacts
**Problem**: Processing discontinuities at frame boundaries
**Solution**:
- Generous overlap regions with smooth crossfading
- Raised cosine windows for natural transitions
- Adaptive overlap based on audio content

### Challenge 3: Memory Efficiency
**Problem**: Storing multiple processed frame versions for different parameters
**Solution**:
- Implement smart caching strategies
- Use difference-based storage
- Lazy evaluation of unchanged frames

### Challenge 4: Real-time Constraints
**Problem**: Processing must be faster than playback for real-time use
**Solution**:
- Target <10ms processing time per frame
- Implement parallel processing
- Use optimized DSP libraries

## Success Criteria

### Primary Goals
1. **Smooth Parameter Changes**: Sub-50ms response to parameter adjustments
2. **High Audio Quality**: <-60dB artifacts, <1% RMS deviation from monolithic
3. **Real-time Performance**: Sustained real-time factor >2x on target hardware

### Secondary Goals
1. **Memory Efficiency**: <100MB RAM usage for 3-minute songs
2. **Scalability**: Support for multiple simultaneous parameter streams
3. **Maintainability**: Clean, documented code ready for webapp integration

## Risk Assessment

### High Risk
- **Limiter state complexity**: May require significant matchering modifications
- **Quality degradation**: Frame processing might introduce unacceptable artifacts

### Medium Risk
- **Performance targets**: Real-time constraints may be challenging
- **Integration complexity**: Webapp changes may be extensive

### Low Risk
- **Channel processing**: Mostly stateless, should be straightforward
- **Testing framework**: Well-defined metrics and approaches

## Next Steps

1. **Start with Phase 1**: Set up testing framework and understand limiter internals
2. **Create proof of concept**: Simple frame-based channel processing
3. **Validate approach**: Early quality and performance testing
4. **Iterate design**: Refine based on initial results
5. **Scale implementation**: Move to complete pipeline

This gameplan provides a structured approach to implementing frame-based processing while maintaining audio quality and achieving real-time performance targets.