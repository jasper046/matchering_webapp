# Frame Processing Test Framework

This directory contains a comprehensive testing framework for developing and validating frame-based audio processing algorithms to enable smooth real-time parameter adjustments in the web application.

## Setup

### 1. Install Dependencies

From the project root directory:

```bash
# Activate the main virtual environment
source venv/bin/activate

# Install frame processing test dependencies
pip install -r tests/frame_processing/requirements.txt
```

### 2. Validate Installation

```bash
cd tests/frame_processing
python run_basic_test.py
```

This will run 4 validation tests to ensure the framework is working correctly.

## Usage

### Phase 1: Framework Validation
```bash
python run_basic_test.py
```

### Phase 2: Generate Test Audio
```bash
python test_frame_processor.py --generate-test-audio
```

### Phase 3: Comprehensive Testing
```bash
python test_frame_processor.py --test-all
```

### Phase 4: Test Specific Configuration
```bash
python test_frame_processor.py --frame-config A --audio your_audio.wav
```

## Dependencies

The test framework requires additional dependencies beyond the main application:

- **psutil**: System resource monitoring (CPU, memory)
- **scipy**: Advanced signal processing and statistical analysis
- **matplotlib**: Plotting and visualization of results
- **soundfile**: Audio file I/O (should already be available)
- **numpy**: Numerical computing (should already be available)

These are kept separate from the main application requirements to avoid bloating the production environment with development/testing tools.

## Output

The framework generates:

- **Markdown reports**: `results/frame_processing_test_report.md`
- **JSON data**: `results/test_results.json`
- **Audio samples**: `results/processed_samples/`
- **Analysis plots**: `results/quality_comparison.png`

## Next Steps

1. ✅ Phase 1: Framework validation complete
2. 🔄 Phase 2: Generate test audio
3. ⏳ Phase 3: Run comprehensive tests  
4. ⏳ Phase 4: Implement findings in webapp