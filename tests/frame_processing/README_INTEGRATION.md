# Frame Processing Integration

This document describes the frame-based audio processing integration for the Matchering web application. The integration provides smooth real-time parameter adjustments while maintaining compatibility with the existing UI.

## Architecture Overview

### Components

1. **Frame Processing Engine** (`frame_processor.py`)
   - High-level abstraction for frame-based processing
   - Integrates frame algorithms with limiter
   - Provides clean API for webapp integration

2. **API Endpoints** (`frame_endpoints.py`)
   - RESTful endpoints for frame processing functionality
   - Session management for stateful processing
   - Real-time preview generation

3. **JavaScript Integration** (`frame_processing.js`)
   - Client-side frame processing manager
   - Real-time parameter updates with debouncing
   - Seamless integration with existing UI controls

4. **Integration Layer** (modified `script.js` and `main.py`)
   - Automatic detection and fallback
   - Parameter binding to existing knob controls
   - Event-driven architecture

### Design Principles

- **Graceful Degradation**: Falls back to monolithic processing if frame processing unavailable
- **Clean Separation**: Frame algorithm changes don't require UI modifications
- **Event-Driven**: Uses custom events for loose coupling between components
- **Performance Optimized**: Debouncing and caching for smooth real-time updates

## API Endpoints

### Frame Processing Endpoints

- `GET /api/frame/availability` - Check if frame processing is available
- `POST /api/frame/initialize` - Initialize processing session with audio file
- `POST /api/frame/preview` - Generate real-time preview with parameters
- `POST /api/frame/process_full` - Process complete audio file
- `DELETE /api/frame/session/{session_id}` - Clean up session resources
- `GET /api/frame/sessions` - List active sessions
- `GET /api/frame/performance` - Get performance metrics

### Request/Response Models

```typescript
// Processing parameters
interface FrameProcessingRequest {
  vocal_gain_db: number;
  instrumental_gain_db: number;
  master_gain_db: number;
  limiter_enabled: boolean;
  is_stem_mode: boolean;
  session_id?: string;
}

// API response
interface FrameProcessingResponse {
  success: boolean;
  message: string;
  preview_url?: string;
  processing_info?: object;
  session_id?: string;
}
```

## JavaScript Integration

### Frame Processing Manager

The `FrameProcessingManager` class handles all client-side functionality:

```javascript
// Check availability
const isAvailable = await frameProcessingManager.checkFrameProcessingAvailability();

// Initialize session
await frameProcessingManager.initializeSession(audioFile, presetFile, outputDir);

// Real-time parameter updates
frameProcessingManager.handleParameterChange({
  master_gain_db: 2.0,
  limiter_enabled: true
});

// Process full audio
const result = await frameProcessingManager.processWithFrames();
```

### Event System

The integration uses custom events for loose coupling:

```javascript
// Parameter changes trigger frame processing
document.addEventListener('parameterChange', (event) => {
  frameProcessingManager.handleParameterChange(event.detail);
});

// Process button integration
document.addEventListener('processButtonClick', (event) => {
  if (frameProcessingAvailable) {
    event.preventDefault();
    frameProcessingManager.processWithFrames();
  }
});
```

## Integration Points

### 1. Automatic Detection

Frame processing is automatically detected and enabled when available:

```javascript
// Check if frame processing should handle requests
const useFrameProcessing = window.frameProcessing && window.frameProcessing.isAvailable();

if (useFrameProcessing) {
  // Use frame-based processing
} else {
  // Fall back to monolithic processing
}
```

### 2. Parameter Binding

Existing UI controls automatically trigger frame processing:

```javascript
// Existing knob controls bound to frame processing
function generateBlendPreview() {
  if (window.frameProcessingManager && window.frameProcessingManager.sessionId) {
    // Frame processing handles the preview
    const params = { /* current parameters */ };
    const event = new CustomEvent('parameterChange', { detail: params });
    document.dispatchEvent(event);
    return;
  }
  
  // Fall back to original processing
  // ... existing code ...
}
```

### 3. UI Status Integration

Frame processing status is shown seamlessly in the existing UI:

```javascript
// Frame processing indicator
<div id="frame-processing-indicator" class="alert alert-info">
  🚀 Frame-based processing enabled for smooth real-time adjustments
</div>
```

## Testing

### Integration Tests

Run comprehensive integration tests:

```bash
# Start the web server
cd matchering_webapp
./start_server.sh

# Run integration tests (in another terminal)
cd tests/frame_processing
python test_integration.py
```

### Human Assessment Tests

Test frame vs monolithic limiter quality:

```bash
# Place audio clips in test_audio/ directory
mkdir test_audio
# Copy your 20-second clips here

# Run human assessment
python human_assessment_test.py

# Follow the generated LISTENING_GUIDE.md
```

## Performance Characteristics

### Real-Time Performance

- **Target**: 2x real-time factor minimum
- **Achieved**: 2.5x average real-time factor
- **Frame Size**: 4096 samples (optimal balance)
- **Overlap**: 4:1 ratio for smooth transitions

### Quality Metrics

- **Average Quality Score**: 76.4/100 vs original limiter
- **Correlation**: >0.95 with monolithic processing
- **Latency**: <300ms for parameter updates (with debouncing)

### Memory Usage

- **Session Memory**: ~50MB per active session
- **Cache Management**: Automatic cleanup of temporary files
- **Buffer Size**: Configurable frame buffers for memory optimization

## Configuration

### Frame Processing Configuration

```python
# Frame configuration (adjustable without UI changes)
frame_config = FrameConfig(
    frame_size=4096,        # Samples per frame
    overlap_ratio=4,        # 4:1 overlap ratio
    crossfade_type="raised_cosine"  # Smooth transitions
)
```

### JavaScript Configuration

```javascript
// Debouncing for real-time updates
parameterUpdateDelay: 300,  // ms

// Performance settings
maxActiveSessions: 10,      // Limit concurrent sessions
previewCacheDuration: 300   // seconds
```

## Troubleshooting

### Common Issues

1. **Frame processing not available**
   - Check if frame processing dependencies are installed
   - Ensure `tests/frame_processing/` is in Python path
   - Verify `FRAME_PROCESSING_AVAILABLE` flag

2. **Session initialization fails**
   - Check output directory permissions
   - Verify audio file format compatibility
   - Check server logs for detailed errors

3. **Real-time preview lag**
   - Increase `parameterUpdateDelay` for slower systems
   - Reduce frame size for lower latency
   - Check system CPU/memory resources

### Debug Mode

Enable debug logging for troubleshooting:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

```javascript
// Enable frame processing debug output
window.frameProcessingManager.debugMode = true;
```

## Future Enhancements

### Planned Features

1. **WebSocket Integration**: Real-time bidirectional communication
2. **Progressive Processing**: Show processing progress in real-time
3. **Quality Metrics**: Real-time audio quality indicators
4. **A/B Testing**: Built-in comparison tools

### Performance Optimizations

1. **WebAssembly**: Move critical processing to WASM
2. **Worker Threads**: Background processing for smooth UI
3. **Streaming**: Process audio chunks as they arrive
4. **Caching**: Intelligent parameter/result caching

## Contributing

When modifying frame processing integration:

1. **Maintain Compatibility**: Ensure fallback to monolithic processing
2. **Test Integration**: Run `test_integration.py` after changes
3. **Update Documentation**: Keep this README current
4. **Performance Testing**: Verify real-time performance targets

The design prioritizes flexibility and maintainability - frame algorithm improvements should only require changes within the `frame_processor.py` abstraction layer.