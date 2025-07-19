#!/usr/bin/env python3
"""
Frame-Based Audio Processing Test Application

This application tests and compares frame-based audio processing approaches
against monolithic processing to optimize for real-time parameter adjustments
in the web application.

Usage:
    python test_frame_processor.py --help
    python test_frame_processor.py --test-all
    python test_frame_processor.py --frame-config A --audio test_audio/short_stereo.wav
"""

import os
import sys
import argparse
import json
import time
import numpy as np
import soundfile as sf
import matplotlib.pyplot as plt
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass
from pathlib import Path

# Add project paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../app'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../matchering-fork'))

from app.audio.channel_processor import process_channel
from app.audio.master_limiter import process_limiter
import matchering as mg

# Local imports
from frame_algorithms import FrameProcessor, FrameConfig
from quality_metrics import AudioQualityAnalyzer
from performance_benchmarks import PerformanceBenchmark


@dataclass
class TestResult:
    """Container for test results."""
    config_name: str
    audio_file: str
    quality_metrics: Dict[str, float]
    performance_metrics: Dict[str, float]
    processing_time: float
    memory_usage: float
    artifacts_detected: List[str]


class FrameProcessingTester:
    """Main test application for frame-based audio processing."""
    
    def __init__(self, output_dir: str = "results"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Initialize test components
        self.quality_analyzer = AudioQualityAnalyzer()
        self.performance_benchmark = PerformanceBenchmark()
        
        # Define test configurations
        self.frame_configs = {
            'A': FrameConfig(
                name="4:1 Ratio (Recommended)",
                full_frame_size=16384,  # 4 * 4096
                overlap_size=4096,      # 1 * 4096
                crossfade_type="raised_cosine",
                description="25% overlap, good balance of quality and responsiveness"
            ),
            'B': FrameConfig(
                name="2:1 Ratio (More Responsive)", 
                full_frame_size=8192,   # 2 * 4096
                overlap_size=4096,      # 1 * 4096
                crossfade_type="raised_cosine",
                description="50% overlap, prioritizes responsiveness"
            ),
            'C': FrameConfig(
                name="8:1 Ratio (Higher Quality)",
                full_frame_size=32768,  # 8 * 4096
                overlap_size=4096,      # 1 * 4096  
                crossfade_type="raised_cosine",
                description="12.5% overlap, prioritizes quality"
            ),
            'D': FrameConfig(
                name="No Overlap (Baseline)",
                full_frame_size=4096,   # 1 * 4096
                overlap_size=0,         # No overlap
                crossfade_type="none",
                description="No overlap, fastest but may have artifacts"
            )
        }
        
        # Test parameters for parameter sweeping
        self.test_parameters = {
            'blend_ratios': [0.0, 0.25, 0.5, 0.75, 1.0],
            'volume_adjusts': [-6.0, -3.0, 0.0, 3.0, 6.0],
            'master_gains': [-1.5, 0.0, 1.5]
        }
    
    def generate_test_audio(self, duration: float = 5.0, sample_rate: int = 44100) -> str:
        """Generate test audio file with known characteristics."""
        output_path = self.output_dir / "generated_test_audio.wav"
        
        # Generate complex test signal
        t = np.linspace(0, duration, int(duration * sample_rate), False)
        
        # Multiple frequency components
        frequencies = [440, 880, 1320, 2200]  # A4, A5, E6, C#7
        signal = np.zeros_like(t)
        
        for i, freq in enumerate(frequencies):
            amplitude = 0.2 * (0.8 ** i)  # Decreasing amplitude
            signal += amplitude * np.sin(2 * np.pi * freq * t)
        
        # Add some pink noise for realistic content
        pink_noise = self._generate_pink_noise(len(t)) * 0.1
        signal += pink_noise
        
        # Normalize to prevent clipping
        signal = signal / np.max(np.abs(signal)) * 0.8
        
        # Convert to stereo
        stereo_signal = np.column_stack([signal, signal])
        
        sf.write(output_path, stereo_signal, sample_rate)
        print(f"Generated test audio: {output_path}")
        return str(output_path)
    
    def _generate_pink_noise(self, num_samples: int) -> np.ndarray:
        """Generate pink noise using the Voss-McCartney algorithm."""
        # Simple pink noise approximation
        white_noise = np.random.randn(num_samples)
        # Apply first-order IIR filter to approximate pink noise
        pink_noise = np.zeros_like(white_noise)
        pink_noise[0] = white_noise[0]
        
        for i in range(1, len(white_noise)):
            pink_noise[i] = 0.99 * pink_noise[i-1] + 0.1 * white_noise[i]
        
        return pink_noise / np.std(pink_noise)
    
    def test_single_configuration(self, config_key: str, audio_file: str) -> TestResult:
        """Test a single frame configuration against monolithic processing."""
        print(f"\\nTesting configuration {config_key}: {self.frame_configs[config_key].name}")
        
        config = self.frame_configs[config_key]
        frame_processor = FrameProcessor(config)
        
        # Load test audio
        audio_data, sample_rate = sf.read(audio_file)
        print(f"Loaded audio: {audio_data.shape}, {sample_rate}Hz")
        
        # Test parameters (using middle values for initial test)
        test_params = {
            'blend_ratio': 0.5,
            'volume_adjust_db': 0.0,
            'master_gain_db': 0.0,
            'enable_limiter': True
        }
        
        # Create temporary files for comparison
        temp_dir = self.output_dir / "temp"
        temp_dir.mkdir(exist_ok=True)
        
        original_path = temp_dir / "original.wav"
        processed_path = temp_dir / "processed.wav"
        monolithic_output = temp_dir / f"monolithic_{config_key}.wav"
        frame_output = temp_dir / f"frame_{config_key}.wav"
        
        # Create test files (using original as both original and processed for this test)
        sf.write(original_path, audio_data, sample_rate)
        sf.write(processed_path, audio_data * 0.8, sample_rate)  # Simulate processing
        
        # Benchmark monolithic processing
        start_time = time.time()
        try:
            # Simulate current webapp pipeline
            temp_blend = temp_dir / f"temp_blend_{config_key}.wav"
            process_channel(
                str(original_path),
                str(processed_path), 
                str(temp_blend),
                test_params['blend_ratio'],
                test_params['volume_adjust_db']
            )
            
            process_limiter(
                [str(temp_blend)],
                str(monolithic_output),
                test_params['master_gain_db'],
                test_params['enable_limiter']
            )
            
            monolithic_time = time.time() - start_time
            monolithic_success = True
            
        except Exception as e:
            print(f"Monolithic processing failed: {e}")
            monolithic_time = float('inf')
            monolithic_success = False
            # Create dummy file for comparison
            sf.write(monolithic_output, audio_data, sample_rate)
        
        # Benchmark frame-based processing
        start_time = time.time()
        try:
            frame_result = frame_processor.process_audio_with_parameters(
                str(original_path),
                str(processed_path),
                str(frame_output),
                test_params
            )
            frame_time = time.time() - start_time
            frame_success = True
            
        except Exception as e:
            print(f"Frame processing failed: {e}")
            frame_time = float('inf')
            frame_success = False
            frame_result = None
            # Create dummy file for comparison
            sf.write(frame_output, audio_data, sample_rate)
        
        # Analyze quality if both succeeded
        quality_metrics = {}
        if monolithic_success and frame_success:
            quality_metrics = self.quality_analyzer.compare_audio_files(
                str(monolithic_output),
                str(frame_output)
            )
        else:
            quality_metrics = {"error": "One or both processing methods failed"}
        
        # Performance metrics
        performance_metrics = {
            'monolithic_time': monolithic_time,
            'frame_time': frame_time,
            'speedup_factor': monolithic_time / frame_time if frame_time > 0 else 0,
            'frame_processing_overhead': frame_result.get('overhead_ms', 0) if frame_result else 0
        }
        
        # Detect artifacts
        artifacts = []
        if frame_success:
            artifacts = self.quality_analyzer.detect_artifacts(str(frame_output))
        
        return TestResult(
            config_name=config_key,
            audio_file=audio_file,
            quality_metrics=quality_metrics,
            performance_metrics=performance_metrics,
            processing_time=frame_time,
            memory_usage=0,  # TODO: Implement memory tracking
            artifacts_detected=artifacts
        )
    
    def test_parameter_sensitivity(self, config_key: str, audio_file: str) -> Dict[str, Any]:
        """Test how frame processing handles parameter changes."""
        print(f"\\nTesting parameter sensitivity for config {config_key}")
        
        config = self.frame_configs[config_key]
        frame_processor = FrameProcessor(config)
        
        results = {}
        
        # Test blend ratio sensitivity
        for blend_ratio in self.test_parameters['blend_ratios']:
            test_params = {
                'blend_ratio': blend_ratio,
                'volume_adjust_db': 0.0,
                'master_gain_db': 0.0,
                'enable_limiter': True
            }
            
            start_time = time.time()
            output_path = self.output_dir / f"param_test_{config_key}_blend_{blend_ratio}.wav"
            
            try:
                frame_processor.process_audio_with_parameters(
                    audio_file, audio_file, str(output_path), test_params
                )
                processing_time = time.time() - start_time
                results[f'blend_{blend_ratio}'] = {
                    'success': True,
                    'time': processing_time
                }
            except Exception as e:
                results[f'blend_{blend_ratio}'] = {
                    'success': False,
                    'error': str(e)
                }
        
        return results
    
    def generate_report(self, results: List[TestResult]) -> str:
        """Generate comprehensive test report."""
        report_path = self.output_dir / "frame_processing_test_report.md"
        
        with open(report_path, 'w') as f:
            f.write("# Frame-Based Audio Processing Test Report\\n\\n")
            f.write(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\\n\\n")
            
            # Summary table
            f.write("## Configuration Comparison\\n\\n")
            f.write("| Config | Frame Size | Overlap % | Processing Time | Quality Score | Artifacts |\\n")
            f.write("|--------|------------|-----------|----------------|---------------|-----------|\\n")
            
            for result in results:
                config = self.frame_configs[result.config_name]
                overlap_pct = (config.overlap_size / config.full_frame_size) * 100
                quality_score = result.quality_metrics.get('overall_score', 'N/A')
                artifact_count = len(result.artifacts_detected)
                
                f.write(f"| {result.config_name} | {config.full_frame_size} | {overlap_pct:.1f}% | "
                       f"{result.processing_time:.3f}s | {quality_score} | {artifact_count} |\\n")
            
            # Detailed results for each configuration
            for result in results:
                f.write(f"\\n## Configuration {result.config_name}: {self.frame_configs[result.config_name].name}\\n\\n")
                f.write(f"**Description**: {self.frame_configs[result.config_name].description}\\n\\n")
                
                f.write("### Quality Metrics\\n")
                for metric, value in result.quality_metrics.items():
                    f.write(f"- **{metric}**: {value}\\n")
                
                f.write("\\n### Performance Metrics\\n")
                for metric, value in result.performance_metrics.items():
                    f.write(f"- **{metric}**: {value}\\n")
                
                if result.artifacts_detected:
                    f.write("\\n### Detected Artifacts\\n")
                    for artifact in result.artifacts_detected:
                        f.write(f"- {artifact}\\n")
        
        print(f"Report generated: {report_path}")
        return str(report_path)
    
    def run_comprehensive_test(self, audio_files: List[str]) -> List[TestResult]:
        """Run comprehensive tests on all configurations and audio files."""
        all_results = []
        
        for audio_file in audio_files:
            print(f"\\n{'='*60}")
            print(f"Testing audio file: {audio_file}")
            print(f"{'='*60}")
            
            for config_key in self.frame_configs.keys():
                try:
                    result = self.test_single_configuration(config_key, audio_file)
                    all_results.append(result)
                    
                    # Also test parameter sensitivity for key configurations
                    if config_key in ['A', 'B']:  # Test key configurations only
                        param_results = self.test_parameter_sensitivity(config_key, audio_file)
                        # Store parameter results separately if needed
                        
                except Exception as e:
                    print(f"Test failed for config {config_key}: {e}")
                    continue
        
        return all_results


def main():
    parser = argparse.ArgumentParser(description="Frame-based audio processing tester")
    parser.add_argument('--test-all', action='store_true', help='Run all test configurations')
    parser.add_argument('--frame-config', choices=['A', 'B', 'C', 'D'], help='Test specific frame configuration')
    parser.add_argument('--audio', help='Path to audio file to test')
    parser.add_argument('--generate-test-audio', action='store_true', help='Generate test audio file')
    parser.add_argument('--output-dir', default='results', help='Output directory for results')
    
    args = parser.parse_args()
    
    # Create tester instance
    tester = FrameProcessingTester(args.output_dir)
    
    if args.generate_test_audio:
        test_audio = tester.generate_test_audio()
        print(f"Test audio generated: {test_audio}")
        return
    
    if args.test_all:
        # Generate test audio if no audio files provided
        test_audio_files = []
        if not args.audio:
            test_audio_files.append(tester.generate_test_audio())
        else:
            test_audio_files.append(args.audio)
        
        # Run comprehensive tests
        results = tester.run_comprehensive_test(test_audio_files)
        
        # Generate report
        tester.generate_report(results)
        
        # Save raw results as JSON
        results_json = []
        for result in results:
            results_json.append({
                'config_name': result.config_name,
                'audio_file': result.audio_file,
                'quality_metrics': result.quality_metrics,
                'performance_metrics': result.performance_metrics,
                'processing_time': result.processing_time,
                'artifacts_detected': result.artifacts_detected
            })
        
        with open(f"{args.output_dir}/test_results.json", 'w') as f:
            json.dump(results_json, f, indent=2)
        
        print(f"\\nTesting complete. Results saved to {args.output_dir}/")
    
    elif args.frame_config and args.audio:
        # Test single configuration
        result = tester.test_single_configuration(args.frame_config, args.audio)
        print(f"\\nTest completed for configuration {args.frame_config}")
        print(f"Quality metrics: {result.quality_metrics}")
        print(f"Performance metrics: {result.performance_metrics}")
        
    else:
        parser.print_help()


if __name__ == '__main__':
    main()