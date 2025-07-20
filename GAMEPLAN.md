# Audio Processing Architecture Refactor - GAMEPLAN

## Current Problems
- Audio processing logic scattered between JavaScript (Web Audio API) and Python backend
- Inconsistent stem separation behavior between dedicated tab vs single file conversion
- Real-time audio adjustments cause artifacts and poor user experience
- Complex coupling between UI state and audio processing logic
- Difficult to maintain and extend audio features

## Proposed Modular Architecture

### 1. Channel Processing Module (Python)
**Location**: `app/audio/channel_processor.py`

**Function**: `process_channel(original_path, processed_path, output_path, blend_ratio, volume_adjust_db, mute)`

**Inputs**:
- `original_path`: Path to original/dry audio file (.wav)
- `processed_path`: Path to processed/wet audio file (.wav)
- `output_path`: Path for output blended audio file (.wav)

**Parameters**:
- `blend_ratio`: Float 0.0-1.0 (0=dry, 1=wet)
- `volume_adjust_db`: Float -12.0 to +12.0 (dB adjustment)
- `mute`: Boolean (if True, output silence)

**Responsibilities**:
- Load and validate input audio files
- Handle sample rate matching and audio alignment
- Apply blend ratio mixing
- Apply volume adjustment (linear gain conversion)
- Apply mute functionality
- Save processed output
- Handle mono/stereo conversion as needed

### 2. Master Limiter Module (Python)
**Location**: `app/audio/master_limiter.py`

**Function**: `process_limiter(input_paths, output_path, gain_adjust_db, enable_limiter)`

**Inputs**:
- `input_paths`: List of 1-2 audio file paths (.wav)
  - Single file mode: `[blended_audio.wav]`
  - Stem mode: `[vocal_channel.wav, instrumental_channel.wav]`
- `output_path`: Path for final master output (.wav)

**Parameters**:
- `gain_adjust_db`: Float -12.0 to +12.0 (master gain before limiter)
- `enable_limiter`: Boolean (apply Hyrax limiter or not)

**Responsibilities**:
- Load input audio files
- Sum multiple inputs if in stem mode
- Apply master gain adjustment
- Apply Hyrax limiter if enabled
- Save final master output
- Handle proper bit depth (16/24-bit) output

### 3. Frontend Route Mapping (FastAPI)
**Location**: `app/main.py` - New endpoints

#### `/api/process_channel`
```python
async def process_channel(
    original_file: UploadFile,
    processed_file: UploadFile,
    blend_ratio: float = Form(...),
    volume_adjust_db: float = Form(0.0),
    mute: bool = Form(False)
) -> {"channel_output_path": str}
```

#### `/api/process_limiter`
```python
async def process_limiter(
    input_files: List[UploadFile],
    gain_adjust_db: float = Form(0.0),
    enable_limiter: bool = Form(True)
) -> {"master_output_path": str}
```

#### `/api/process_stem_channels`
```python
async def process_stem_channels(
    vocal_original: UploadFile,
    vocal_processed: UploadFile,
    instrumental_original: UploadFile,
    instrumental_processed: UploadFile,
    vocal_blend_ratio: float = Form(...),
    vocal_volume_db: float = Form(0.0),
    vocal_mute: bool = Form(False),
    instrumental_blend_ratio: float = Form(...),
    instrumental_volume_db: float = Form(0.0),
    instrumental_mute: bool = Form(False)
) -> {"vocal_output_path": str, "instrumental_output_path": str}
```

### 4. Frontend Simplification (JavaScript)
**Location**: `app/static/script.js` - Simplified audio handling

**Responsibilities**:
- UI state management only
- Parameter collection from knobs/controls
- API calls to backend with parameters
- Audio playback of returned processed files
- No audio processing or blending in frontend
- Clean separation between UI and audio logic

**Removed**:
- Web Audio API blending/mixing logic
- Complex buffer management
- Real-time audio manipulation
- `updateBlend()` processing functions

## Implementation Plan

### Phase 1: Core Modules (1-2 days)
1. **Create Channel Processing Module**
   - Implement `channel_processor.py` with full audio handling
   - Add comprehensive input validation and error handling
   - Unit tests for various audio formats and edge cases

2. **Create Master Limiter Module**
   - Implement `master_limiter.py` with summing and limiting
   - Integrate existing Hyrax limiter properly
   - Support both single and dual input modes

3. **Add Backend API Endpoints**
   - Implement new FastAPI endpoints
   - Add proper file handling and cleanup
   - Add parameter validation

### Phase 2: Frontend Refactor (1 day)
4. **Simplify Frontend Logic**
   - Remove Web Audio API processing code
   - Implement simple parameter -> API call -> playback flow
   - Update UI to use new backend endpoints
   - Clean up JavaScript audio processing functions

5. **Update Single File Conversion Flow**
   - Standard mode: Use channel processor + limiter
   - Stem mode: Use stem channel processor + limiter
   - Ensure consistent behavior across all flows

### Phase 3: Testing & Optimization (1 day)
6. **Comprehensive Testing**
   - Test stem separation consistency between tabs
   - Verify audio quality and processing accuracy
   - Test edge cases (different sample rates, mono/stereo, etc.)
   - Performance testing with various file sizes

7. **UI/UX Polish**
   - Improve progress feedback during processing
   - Add better error handling and user feedback
   - Optimize file caching and cleanup

### Phase 4: Future Enhancements (Future)
8. **Real-time Processing Improvements**
   - Implement overlap-add/overlap-save processing
   - Add audio segment caching for smoother adjustments
   - Implement progressive audio loading for large files

9. **Advanced Features**
   - Support for additional audio formats
   - Advanced limiter controls and metering
   - Real-time parameter automation

## Expected Benefits

### Immediate Benefits
- **Consistency**: Identical audio processing logic across all flows
- **Maintainability**: Clear separation of concerns, easier debugging
- **Reliability**: Robust error handling and input validation
- **Performance**: Optimized Python audio processing vs JavaScript

### Future Benefits
- **Extensibility**: Easy to add new audio processors and effects
- **Testability**: Each module can be unit tested independently
- **Scalability**: Backend processing can be optimized/parallelized
- **User Experience**: Foundation for smooth real-time adjustments

## File Structure
```
matchering_webapp/
├── app/
│   ├── audio/                    # New audio processing modules
│   │   ├── __init__.py
│   │   ├── channel_processor.py  # Channel blending/mixing
│   │   ├── master_limiter.py     # Final limiting and mastering
│   │   └── utils.py              # Shared audio utilities
│   ├── main.py                   # Updated with new endpoints
│   └── static/script.js          # Simplified frontend logic
├── tests/                        # Unit tests for audio modules
│   ├── test_channel_processor.py
│   └── test_master_limiter.py
└── requirements.txt              # Updated dependencies
```

## Migration Strategy
1. **Parallel Development**: Build new modules alongside existing code
2. **Gradual Migration**: Start with single file conversion, then stems
3. **Feature Parity**: Ensure new system matches current functionality
4. **Cleanup**: Remove old audio processing code once verified working
5. **Documentation**: Update CLAUDE.md with new architecture

This architecture will solve the current stem separation inconsistencies and provide a solid foundation for future audio processing improvements.