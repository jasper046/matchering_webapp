#!/usr/bin/env python3
"""
Basic Test Runner for Frame Processing

Simple test script to validate the frame processing framework is working.
"""

import os
import sys
import numpy as np
import soundfile as sf

# Add project paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../app'))

def create_simple_test_audio(duration=2.0, sample_rate=44100):
    """Create simple test audio for validation."""
    t = np.linspace(0, duration, int(duration * sample_rate), False)
    
    # Simple sine wave at 440 Hz
    audio = 0.5 * np.sin(2 * np.pi * 440 * t)
    
    # Add some harmonics
    audio += 0.2 * np.sin(2 * np.pi * 880 * t)
    audio += 0.1 * np.sin(2 * np.pi * 1320 * t)
    
    # Convert to stereo
    stereo_audio = np.column_stack([audio, audio])
    
    return stereo_audio, sample_rate

def test_basic_imports():
    """Test that all modules can be imported."""
    print("Testing imports...")
    
    try:
        from frame_algorithms import FrameProcessor, FrameConfig
        print("✓ frame_algorithms imported successfully")
    except ImportError as e:
        print(f"✗ Failed to import frame_algorithms: {e}")
        print("💡 Tip: Make sure you're running from tests/frame_processing/ directory")
        return False
    
    try:
        from quality_metrics import AudioQualityAnalyzer
        print("✓ quality_metrics imported successfully")
    except ImportError as e:
        print(f"✗ Failed to import quality_metrics: {e}")
        print("💡 Tip: Install test dependencies with: pip install -r requirements.txt")
        return False
    
    try:
        from performance_benchmarks import PerformanceBenchmark
        print("✓ performance_benchmarks imported successfully")
    except ImportError as e:
        print(f"✗ Failed to import performance_benchmarks: {e}")
        print("💡 Tip: Install test dependencies with: pip install -r requirements.txt")
        return False
    
    return True

def test_frame_segmentation():
    """Test basic frame segmentation."""
    print("\nTesting frame segmentation...")
    
    try:
        from frame_algorithms import FrameConfig, AudioFrameSegmenter
        
        # Create test configuration
        config = FrameConfig(
            name="Test Config",
            full_frame_size=8192,
            overlap_size=2048,
            crossfade_type="raised_cosine",
            description="Test configuration"
        )
        
        # Create test audio
        audio, sample_rate = create_simple_test_audio(duration=1.0)
        mono_audio = audio[:, 0]  # Use mono for simplicity
        
        # Test segmentation
        segmenter = AudioFrameSegmenter(config)
        frames = segmenter.segment_audio(mono_audio)
        
        print(f"✓ Segmented {len(mono_audio)} samples into {len(frames)} frames")
        print(f"  Frame size: {config.full_frame_size}, Overlap: {config.overlap_size}")
        
        # Test reconstruction
        reconstructed = segmenter.reconstruct_audio(frames, len(mono_audio))
        print(f"✓ Reconstructed audio: {len(reconstructed)} samples")
        
        # Basic quality check
        mse = np.mean((mono_audio - reconstructed)**2)
        print(f"  Reconstruction MSE: {mse:.6f}")
        
        if mse < 1e-10:
            print("✓ Perfect reconstruction (no overlap case)")
        elif mse < 1e-3:
            print("✓ Good reconstruction quality")
        else:
            print("⚠ Reconstruction quality may need improvement")
        
        return True
        
    except Exception as e:
        print(f"✗ Frame segmentation test failed: {e}")
        return False

def test_quality_metrics():
    """Test quality metrics on identical files."""
    print("\nTesting quality metrics...")
    
    try:
        from quality_metrics import AudioQualityAnalyzer
        
        # Create test audio files
        audio, sample_rate = create_simple_test_audio(duration=1.0)
        
        test_dir = "test_temp"
        os.makedirs(test_dir, exist_ok=True)
        
        file1 = os.path.join(test_dir, "test1.wav")
        file2 = os.path.join(test_dir, "test2.wav")
        
        sf.write(file1, audio, sample_rate)
        sf.write(file2, audio, sample_rate)  # Identical file
        
        # Test quality analysis
        analyzer = AudioQualityAnalyzer()
        metrics = analyzer.compare_audio_files(file1, file2)
        
        print(f"✓ Quality analysis completed, {len(metrics)} metrics calculated")
        
        # Check some expected results for identical files
        correlation = metrics.get('pearson_correlation', 0)
        if correlation > 0.99:
            print(f"✓ High correlation for identical files: {correlation:.6f}")
        else:
            print(f"⚠ Lower than expected correlation: {correlation:.6f}")
        
        overall_score = metrics.get('overall_score', 0)
        print(f"  Overall quality score: {overall_score:.1f}/100")
        
        # Cleanup
        os.remove(file1)
        os.remove(file2)
        os.rmdir(test_dir)
        
        return True
        
    except Exception as e:
        print(f"✗ Quality metrics test failed: {e}")
        return False

def test_performance_benchmarks():
    """Test performance benchmarking."""
    print("\nTesting performance benchmarks...")
    
    try:
        from performance_benchmarks import PerformanceBenchmark
        
        # Simple function to benchmark
        def test_function(duration):
            import time
            time.sleep(duration)
            return f"Slept for {duration}s"
        
        benchmark = PerformanceBenchmark()
        
        # Run benchmark
        result = benchmark.benchmark_function(
            test_function, 0.1, test_name="sleep_test"
        )
        
        print(f"✓ Benchmark completed: {result.test_name}")
        print(f"  Duration: {result.duration_seconds:.3f}s")
        print(f"  Metrics collected: {len(result.metrics)}")
        
        # Check timing accuracy
        expected_duration = 0.1
        actual_duration = result.duration_seconds
        timing_error = abs(actual_duration - expected_duration)
        
        if timing_error < 0.05:  # Within 50ms
            print(f"✓ Timing accuracy good: {timing_error*1000:.1f}ms error")
        else:
            print(f"⚠ Timing accuracy: {timing_error*1000:.1f}ms error")
        
        return True
        
    except Exception as e:
        print(f"✗ Performance benchmark test failed: {e}")
        return False

def main():
    """Run basic validation tests."""
    print("Frame Processing Framework - Basic Validation Tests")
    print("=" * 60)
    
    tests = [
        ("Import Test", test_basic_imports),
        ("Frame Segmentation Test", test_frame_segmentation),
        ("Quality Metrics Test", test_quality_metrics),
        ("Performance Benchmark Test", test_performance_benchmarks)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n[{passed+1}/{total}] {test_name}")
        print("-" * 40)
        
        if test_func():
            passed += 1
            print(f"✓ {test_name} PASSED")
        else:
            print(f"✗ {test_name} FAILED")
    
    print("\n" + "=" * 60)
    print(f"SUMMARY: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Framework is ready for use.")
        print("\nNext steps:")
        print("1. Run: python test_frame_processor.py --generate-test-audio")
        print("2. Run: python test_frame_processor.py --test-all")
        return True
    else:
        print("❌ Some tests failed. Please check the errors above.")
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)