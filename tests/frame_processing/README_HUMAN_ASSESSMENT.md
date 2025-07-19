# Human Assessment Test

This application processes your audio clips with both frame-aware and monolithic limiters for subjective quality comparison.

## Quick Start

1. **Place your audio files** in the `test_audio/` directory:
   ```bash
   mkdir test_audio
   # Copy your 20-second audio clips here
   ```

2. **Run the assessment**:
   ```bash
   cd /home/jasper/Music/matchering/matchering_webapp/tests/frame_processing
   python human_assessment_test.py
   ```

3. **Listen and compare** using the generated `LISTENING_GUIDE.md`

## Supported Formats

- `.wav` (recommended)
- `.flac`
- `.aiff`
- `.mp3`
- `.m4a`

## Output Structure

For each input file, the application generates:

```
human_assessment_results/
├── LISTENING_GUIDE.md          # Your assessment guide
├── song_input.wav              # Original input file
├── song_default_original.wav   # Monolithic limiter (default settings)
├── song_default_frame.wav      # Frame limiter (default settings)
├── song_gentle_original.wav    # Monolithic limiter (gentle settings)
├── song_gentle_frame.wav       # Frame limiter (gentle settings)
├── song_aggressive_original.wav # Monolithic limiter (aggressive settings)
└── song_aggressive_frame.wav   # Frame limiter (aggressive settings)
```

## Test Configurations

### Default Settings
- Standard Hyrax limiter parameters
- Threshold: -0.1 dB
- Attack: 1.0 ms
- Release: 3000 ms

### Gentle Limiting
- Threshold: -0.01 dB (very close to 0dB)
- Attack: 2.0 ms (slower)
- Release: 1000 ms (faster)

### Aggressive Limiting
- Threshold: -1.0 dB (more headroom)
- Attack: 0.5 ms (faster)
- Release: 500 ms (much faster)

## What to Listen For

1. **Overall Quality**: Which version sounds better?
2. **Loudness**: Similar perceived volume?
3. **Dynamics**: Are musical dynamics preserved?
4. **Transients**: How do drums/percussion sound?
5. **Artifacts**: Any pumping or distortion?
6. **Musical Character**: Which maintains the original feel?

## Usage Examples

### Basic usage (default directories):
```bash
python human_assessment_test.py
```

### Custom directories:
```bash
python human_assessment_test.py /path/to/your/audio /path/to/output
```

### After processing:
1. Open `human_assessment_results/LISTENING_GUIDE.md`
2. Use your favorite audio player or DAW
3. A/B compare the file pairs
4. Note your preferences and observations

## Tips for Assessment

- Use high-quality headphones or studio monitors
- Listen at moderate, consistent volume
- Take breaks to avoid ear fatigue
- Focus on one aspect at a time (dynamics, transients, etc.)
- Try different types of music (electronic, acoustic, vocal, etc.)

The goal is to determine if the frame-aware limiter maintains the quality and character of the original monolithic limiter while enabling real-time processing capabilities.