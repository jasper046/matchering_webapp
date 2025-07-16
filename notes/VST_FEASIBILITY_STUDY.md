# VST Plugin Feasibility Study for Matchering Library

## Executive Summary

This document analyzes the feasibility of converting the Matchering audio mastering library into a real-time VST plugin. While direct conversion is not feasible due to fundamental architectural differences, adaptation is possible with significant modifications using a preset-based approach.

## Current Processing Architecture

The Matchering library uses a **batch-processing approach** that operates on complete audio files:

### Processing Method:
- **Piece-based analysis**: Audio is divided into chunks (default 15 seconds) for RMS analysis
- **Whole-file operations**: Critical operations like FFT convolution work on entire audio arrays loaded into memory
- **Multi-pass processing**: Iterative correction steps (default 4 passes) for level matching

### Key Processing Steps:
1. **Reference Analysis**: Analyzes complete reference track to extract frequency/level characteristics
2. **Level Matching**: Finds "loudest pieces" across entire target track for RMS matching
3. **Frequency Matching**: Uses FFT/STFT analysis and FIR filtering on complete audio
4. **Iterative Correction**: Multiple passes over the entire audio for refinement

## Technical Analysis

### Core Processing Pipeline

The Matchering library follows a batch-processing architecture with the following key stages:

1. **Audio Loading & Validation** (`loader.py`, `checker.py`)
   - Loads entire audio files into memory using soundfile
   - Validates sample rates, channels, and file formats
   - Resamples to internal sample rate (44100 Hz by default)
   - Converts mono to stereo if needed

2. **Reference Analysis** (`stages.py:analyze_reference`)
   - Analyzes the complete reference track to extract characteristics
   - Calculates loudest pieces for frequency matching
   - Generates amplitude coefficients and RMS values

3. **Main Processing Pipeline** (`stages.py:main_with_preset`)
   - **Level Matching**: Analyzes target audio in pieces, matches RMS levels
   - **Frequency Matching**: Uses FFT/STFT analysis and FIR filtering
   - **Level Correction**: Iterative RMS correction steps
   - **Limiting**: Optional brickwall limiting using custom Hyrax limiter

4. **Output Generation** (`saver.py`)
   - Saves processed audio to files

### Key Processing Characteristics

#### **1. Block-Based Processing (Not Streaming)**
- **Piece-based Analysis**: Audio is divided into pieces (default 15 seconds each) for RMS analysis
- **Whole-file Operations**: Critical operations like FFT convolution work on entire audio arrays
- **Memory-intensive**: Entire audio files are loaded into memory as numpy arrays

#### **2. FFT-Based Frequency Matching**
- **STFT Analysis**: Uses `scipy.signal.stft` with configurable FFT size (default 4096)
- **Frequency Response Matching**: Calculates matching FIR filters from FFT analysis
- **Full-length Convolution**: Uses `scipy.signal.fftconvolve` on entire audio arrays

#### **3. Multi-Pass Processing**
- **Iterative RMS Correction**: Multiple passes (default 4 steps) for level matching
- **Smoothing**: LOWESS smoothing of frequency response curves
- **Sequential Processing**: Each stage depends on complete results from previous stages

### Critical Dependencies and Constraints

#### **Dependencies That Impact Real-Time Processing:**
```python
# Core dependencies from requirements.txt
numpy>=1.23.4          # Array operations
scipy>=1.9.2           # Signal processing, FFT operations
soundfile>=0.11.0      # Audio I/O (file-based)
resampy>=0.4.2         # High-quality resampling
statsmodels>=0.13.2    # LOWESS smoothing
```

#### **Processing Constraints:**
1. **Memory Requirements**: Entire audio files must fit in memory
2. **Lookback Requirements**: Algorithm needs to analyze "loudest pieces" across entire track
3. **Global Analysis**: Frequency matching requires analyzing complete audio segments
4. **File I/O Dependency**: Built around file-based audio I/O, not streaming buffers

### Architecture Barriers to Real-Time Processing

#### **1. Whole-File Analysis Requirements**
```python
# From match_levels.py - requires complete audio for piece analysis
def analyze_levels(array: np.ndarray, name: str, config: Config):
    # Divides entire audio into pieces for analysis
    array_size, divisions, piece_size = __calculate_piece_sizes(...)
    # Needs complete audio to find "loudest pieces"
    mid_loudest_pieces, side_loudest_pieces, match_rms = __extract_loudest_pieces(...)
```

#### **2. FFT Convolution Operations**
```python
# From match_frequencies.py - operates on complete audio arrays
def convolve(target_mid, mid_fir, target_side, side_fir):
    # Full-length convolution - not suitable for streaming
    result_mid = signal.fftconvolve(target_mid, mid_fir, "same")
    result_side = signal.fftconvolve(target_side, side_fir, "same")
```

#### **3. Iterative Global Processing**
```python
# From stages.py - multiple passes over complete audio
def __correct_levels(result, result_mid, ...):
    for step in range(1, config.rms_correction_steps + 1):
        # Each step requires complete audio analysis
        _, clipped_rmses, clipped_average_rms = get_average_rms(...)
```

## Barriers to Real-Time/Streaming Processing

### Major Challenges:
1. **Whole-file dependency**: The algorithm needs to analyze complete audio to find "loudest pieces" and optimal matching parameters
2. **Memory-intensive**: Entire audio files are loaded as numpy arrays
3. **Lookback requirements**: Processing decisions depend on analyzing the full track context
4. **FFT convolution**: Uses full-length convolution operations, not suitable for small buffers

## VST Plugin Feasibility Assessment

### Direct Conversion: **Not Feasible**
The current architecture is fundamentally incompatible with real-time constraints due to:
- VST plugins process 64-2048 sample buffers with <10ms latency requirements
- Matchering requires complete audio analysis for optimal results
- Multi-pass iterative processing would introduce unacceptable latency

### Major Challenges for VST Adaptation:

1. **Fundamental Architecture Mismatch**
   - VST plugins process audio in small buffers (64-2048 samples)
   - Matchering requires complete audio analysis for optimal results

2. **Memory and Latency Constraints**
   - Real-time processing requires low latency (<10ms)
   - Matchering's iterative analysis would introduce significant latency

3. **Reference Track Integration**
   - VST plugins can't easily access reference tracks during performance
   - Would require pre-analysis and parameter extraction

## Possible Adaptation Strategies

### 1. **Preset-Based Approach** (Most Promising)
- Pre-analyze reference tracks offline to generate processing presets
- Use the existing `process_with_preset()` functionality as a starting point
- Adapt the FIR filtering for block-based real-time processing
- This would work similarly to current preset workflow but in real-time

**Implementation Steps:**
1. Extract preset generation logic from current codebase
2. Create real-time FIR filter processor for small buffers
3. Implement parameter interpolation for smooth transitions
4. Build VST wrapper around core processing engine

### 2. **Simplified Real-Time Implementation**
- Extract core DSP algorithms (MS processing, FIR filtering, RMS matching)
- Use sliding window analysis with shorter time constants
- Pre-compute matching filters from reference analysis
- Accept some quality trade-offs for real-time capability

**Trade-offs:**
- Reduced accuracy compared to full offline processing
- Simplified level matching without iterative correction
- Shorter analysis windows may miss some frequency content

### 3. **Hybrid Approach**
- Offline reference analysis to extract EQ curves and level targets
- Real-time application of simplified matching algorithms
- Use parameter interpolation to smooth changes and avoid artifacts

**Benefits:**
- Maintains core matching quality for frequency response
- Reduces computational complexity for real-time processing
- Allows for user adjustment of matching intensity

## Recommended Implementation Strategy

### Phase 1: Preset-Based Real-Time Processor
1. **Offline Reference Analysis**: Pre-process reference tracks to extract matching parameters
2. **Real-Time FIR Processing**: Implement block-based FIR filtering for EQ matching
3. **Simplified Level Matching**: Use real-time RMS analysis and gain control
4. **Parameter Smoothing**: Implement interpolation to avoid artifacts

### Phase 2: Enhanced Real-Time Features
1. **Adaptive Processing**: Implement sliding window analysis for dynamic adjustment
2. **User Controls**: Add blend/intensity controls for matching strength
3. **Multiple Presets**: Allow switching between different reference analyses
4. **Visual Feedback**: Add spectrum analysis and matching visualization

### Phase 3: Advanced Features
1. **Dynamic Reference**: Implement real-time reference track analysis with buffering
2. **Machine Learning**: Use ML models to predict optimal matching parameters
3. **Surround Processing**: Extend to multi-channel processing

## Technical Requirements for VST Implementation

### Core Components Needed:
1. **Real-time FIR Filter Engine**: Block-based convolution processing
2. **Parameter Management**: Smooth parameter changes and preset loading
3. **Audio Buffer Management**: Efficient handling of small audio buffers
4. **VST SDK Integration**: Plugin wrapper and host communication

### Performance Considerations:
- Target latency: <10ms for real-time performance
- Buffer sizes: Support 64-2048 sample buffers
- CPU usage: Optimize for real-time constraints
- Memory usage: Minimize memory footprint compared to current implementation

## Conclusion

While the **current Matchering library cannot be directly converted** to streaming/VST format, **adaptation is possible** with significant architectural changes. The most viable approach would be a **preset-based real-time processor** that:

1. Pre-analyzes reference tracks offline
2. Generates real-time processing parameters
3. Applies simplified versions of the core algorithms in small buffers
4. Trades some accuracy for real-time performance

The core DSP concepts (MS processing, FIR filtering, RMS matching) are sound and could work in real-time, but it would essentially require rebuilding the processing engine from scratch with real-time constraints in mind.

### Success Probability: **Moderate to High**
With proper planning and implementation, a VST plugin based on Matchering concepts is achievable, though it would be a substantial development effort requiring:
- Real-time DSP expertise
- VST plugin development experience
- Significant code refactoring and optimization
- Quality testing across different DAWs and systems

The resulting plugin would offer unique value in the market by providing automated mastering capabilities based on reference tracks, filling a gap in current plugin offerings.