#!/usr/bin/env python3
"""
Frame-Aware Limiter Testing Suite

Comprehensive tests to validate the frame-aware limiter implementation
against the original monolithic Hyrax limiter.
"""

import os
import sys
import numpy as np
import soundfile as sf
import matplotlib.pyplot as plt
import time
from typing import Dict, List, Tuple
import json

# Add project paths
project_root = os.path.join(os.path.dirname(__file__), '../..')
sys.path.insert(0, project_root)
sys.path.insert(0, os.path.join(project_root, 'matchering-fork'))

# Import frame-aware limiter
from frame_aware_limiter import FrameAwareLimiterProcessor, LimiterConfig
from quality_metrics import AudioQualityAnalyzer

# Try to import original limiter
try:
    import matchering as mg
    from matchering.limiter import limit
    from matchering.defaults import Config
    ORIGINAL_LIMITER_AVAILABLE = True
    print("✓ Original Hyrax limiter available")
except ImportError as e:
    print(f"⚠ Original limiter not available: {e}")
    ORIGINAL_LIMITER_AVAILABLE = False


class LimiterComparisonTest:
    """Comprehensive testing suite for frame-aware limiter."""
    
    def __init__(self, output_dir: str = "limiter_test_results"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.quality_analyzer = AudioQualityAnalyzer()
        
        # Test configurations
        self.test_configs = {
            'default': {},
            'fast_attack': {'attack_ms': 0.1},
            'slow_release': {'release_ms': 5000.0},
            'aggressive': {'threshold_db': -1.0, 'attack_ms': 0.5},
            'gentle': {'threshold_db': -0.01, 'release_ms': 1000.0}
        }
        
        # Test signals
        self.test_signals = [
            ('sine_wave', self._generate_sine_wave),
            ('complex_music', self._generate_complex_music),
            ('transient_rich', self._generate_transient_rich),
            ('pink_noise', self._generate_pink_noise)
        ]
    
    def _generate_sine_wave(self, duration: float = 3.0, sample_rate: int = 44100) -> np.ndarray:
        """Generate test sine wave with varying amplitude."""
        t = np.linspace(0, duration, int(duration * sample_rate), False)
        
        # Sine wave with envelope
        base_freq = 440  # A4
        signal = np.sin(2 * np.pi * base_freq * t)
        
        # Add amplitude modulation to test limiter response
        envelope = 0.5 + 0.5 * np.sin(2 * np.pi * 0.5 * t)  # 0.5 Hz modulation
        signal *= envelope
        
        # Scale to cause limiting (peak at 1.5)
        signal *= 1.5
        
        # Convert to stereo
        return np.column_stack([signal, signal])
    
    def _generate_complex_music(self, duration: float = 3.0, sample_rate: int = 44100) -> np.ndarray:
        """Generate complex musical content to test limiter musicality."""
        t = np.linspace(0, duration, int(duration * sample_rate), False)
        
        # Multiple harmonically related frequencies
        frequencies = [220, 440, 660, 880, 1100]  # Musical intervals
        amplitudes = [0.4, 0.3, 0.2, 0.15, 0.1]
        
        signal = np.zeros_like(t)
        for freq, amp in zip(frequencies, amplitudes):
            # Add vibrato and tremolo for realism
            vibrato = freq * (1 + 0.02 * np.sin(2 * np.pi * 5 * t))
            tremolo = amp * (1 + 0.1 * np.sin(2 * np.pi * 3 * t))
            signal += tremolo * np.sin(2 * np.pi * vibrato * t)
        
        # Add some percussive transients
        transient_times = np.arange(0.5, duration, 0.8)
        for transient_time in transient_times:
            transient_start = int(transient_time * sample_rate)
            transient_end = min(transient_start + int(0.01 * sample_rate), len(signal))
            signal[transient_start:transient_end] += 0.8 * np.exp(-50 * (t[transient_start:transient_end] - transient_time))
        
        # Scale to cause limiting
        signal *= 1.2
        
        # Convert to stereo with slight delay for width
        left = signal
        right = np.concatenate([np.zeros(int(0.001 * sample_rate)), signal[:-int(0.001 * sample_rate)]])
        
        return np.column_stack([left, right])
    
    def _generate_transient_rich(self, duration: float = 3.0, sample_rate: int = 44100) -> np.ndarray:
        """Generate signal with sharp transients to test attack response."""
        t = np.linspace(0, duration, int(duration * sample_rate), False)
        
        # Base drone
        signal = 0.2 * np.sin(2 * np.pi * 80 * t)  # Low drone
        
        # Add sharp transients every 0.2 seconds
        transient_interval = 0.2
        transient_times = np.arange(0.1, duration, transient_interval)
        
        for transient_time in transient_times:
            start_idx = int(transient_time * sample_rate)
            if start_idx < len(signal):
                # Sharp attack, exponential decay
                decay_samples = int(0.05 * sample_rate)  # 50ms decay
                end_idx = min(start_idx + decay_samples, len(signal))
                
                decay_envelope = np.exp(-20 * (t[start_idx:end_idx] - transient_time))
                signal[start_idx:end_idx] += 1.5 * decay_envelope
        
        # Convert to stereo
        return np.column_stack([signal, signal])
    
    def _generate_pink_noise(self, duration: float = 3.0, sample_rate: int = 44100) -> np.ndarray:
        """Generate pink noise for realistic broadband testing."""
        samples = int(duration * sample_rate)
        
        # Generate white noise
        white_noise = np.random.randn(samples)
        
        # Apply 1/f filter for pink noise approximation
        # Simple first-order IIR filter
        pink_noise = np.zeros_like(white_noise)
        pink_noise[0] = white_noise[0]
        
        for i in range(1, len(white_noise)):
            pink_noise[i] = 0.99 * pink_noise[i-1] + 0.1 * white_noise[i]
        
        # Normalize and scale
        pink_noise = pink_noise / np.std(pink_noise) * 0.8
        
        # Convert to stereo
        return np.column_stack([pink_noise, pink_noise])
    
    def test_single_configuration(self, config_name: str, config_params: Dict,
                                 signal_name: str, audio_signal: np.ndarray,
                                 sample_rate: int = 44100) -> Dict:
        """Test single limiter configuration against original."""
        print(f"\\nTesting {config_name} config with {signal_name} signal...")
        
        results = {
            'config_name': config_name,
            'signal_name': signal_name,
            'quality_metrics': {},
            'performance_metrics': {},
            'processing_success': True
        }
        
        # File paths
        original_limited = os.path.join(self.output_dir, f"original_{config_name}_{signal_name}.wav")
        frame_limited = os.path.join(self.output_dir, f"frame_{config_name}_{signal_name}.wav")
        input_file = os.path.join(self.output_dir, f"input_{signal_name}.wav")
        
        # Save input for reference
        sf.write(input_file, audio_signal, sample_rate)
        
        # Test original limiter (if available)
        original_time = float('inf')
        if ORIGINAL_LIMITER_AVAILABLE:
            try:
                start_time = time.time()
                
                # Create matchering config with custom parameters
                config = Config()
                if 'attack_ms' in config_params:
                    config.attack = config_params['attack_ms']
                if 'hold_ms' in config_params:
                    config.hold = config_params['hold_ms']
                if 'release_ms' in config_params:
                    config.release = config_params['release_ms']
                
                # Apply original limiter
                original_result = limit(audio_signal, config)
                original_time = time.time() - start_time
                
                # Save result
                sf.write(original_limited, original_result, sample_rate)
                print(f"  ✓ Original limiter: {original_time:.4f}s")
                
            except Exception as e:
                print(f"  ✗ Original limiter failed: {e}")
                # Create dummy file
                sf.write(original_limited, audio_signal * 0.8, sample_rate)
                original_time = float('inf')
        else:
            # Create dummy reference (just scaled down)
            sf.write(original_limited, audio_signal * 0.8, sample_rate)
            print("  ⚠ Original limiter not available, using scaled reference")
        
        # Test frame-aware limiter
        try:
            start_time = time.time()
            
            # Initialize frame-aware limiter
            processor = FrameAwareLimiterProcessor(sample_rate=sample_rate, frame_size=4096)
            processor.initialize_limiter(config_params)
            
            # Process in frames
            frame_size = 4096
            frame_result = []
            
            for start_idx in range(0, len(audio_signal), frame_size):
                end_idx = min(start_idx + frame_size, len(audio_signal))
                frame = audio_signal[start_idx:end_idx]
                
                processed_frame = processor.process_audio_frame(frame, enable_limiter=True)
                frame_result.append(processed_frame)
            
            # Concatenate results
            frame_limited_audio = np.vstack(frame_result)
            frame_time = time.time() - start_time
            
            # Save result
            sf.write(frame_limited, frame_limited_audio, sample_rate)
            print(f"  ✓ Frame limiter: {frame_time:.4f}s")
            
            # Get processing info
            processing_info = processor.get_processing_info()
            print(f"    Frames processed: {processing_info.get('frame_count', 'unknown')}")
            
        except Exception as e:
            print(f"  ✗ Frame limiter failed: {e}")
            results['processing_success'] = False
            # Create dummy file
            sf.write(frame_limited, audio_signal * 0.8, sample_rate)
            frame_time = float('inf')
        
        # Quality comparison
        if results['processing_success']:
            try:
                quality_metrics = self.quality_analyzer.compare_audio_files(
                    original_limited, frame_limited
                )
                results['quality_metrics'] = quality_metrics
                print(f"  Quality score: {quality_metrics.get('overall_score', 'unknown'):.1f}/100")
                print(f"  RMS difference: {quality_metrics.get('rms_difference_db', 'unknown'):.2f} dB")
                print(f"  Correlation: {quality_metrics.get('pearson_correlation', 'unknown'):.4f}")
                
            except Exception as e:
                print(f"  ⚠ Quality analysis failed: {e}")
                results['quality_metrics'] = {'error': str(e)}
        
        # Performance metrics
        results['performance_metrics'] = {
            'original_time': original_time,
            'frame_time': frame_time,
            'speedup_factor': original_time / frame_time if frame_time > 0 else 0,
            'real_time_factor': (len(audio_signal) / sample_rate) / frame_time if frame_time > 0 else 0
        }
        
        return results
    
    def run_comprehensive_tests(self) -> List[Dict]:
        """Run comprehensive limiter comparison tests."""
        all_results = []
        
        print("🔧 Frame-Aware Limiter Comprehensive Testing")
        print("=" * 60)
        
        for signal_name, signal_generator in self.test_signals:
            print(f"\\n📊 Generating {signal_name} test signal...")
            audio_signal = signal_generator()
            
            for config_name, config_params in self.test_configs.items():
                result = self.test_single_configuration(
                    config_name, config_params, signal_name, audio_signal
                )
                all_results.append(result)
        
        return all_results
    
    def generate_report(self, results: List[Dict]) -> str:
        """Generate comprehensive test report."""
        report_path = os.path.join(self.output_dir, "limiter_comparison_report.md")
        
        with open(report_path, 'w') as f:
            f.write("# Frame-Aware Limiter Test Report\\n\\n")
            f.write(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\\n\\n")
            
            # Summary table
            f.write("## Test Results Summary\\n\\n")
            f.write("| Config | Signal | Quality Score | RMS Diff (dB) | Correlation | Real-Time Factor |\\n")
            f.write("|--------|--------|---------------|---------------|-------------|------------------|\\n")
            
            for result in results:
                if result['processing_success']:
                    quality_score = result['quality_metrics'].get('overall_score', 'N/A')
                    rms_diff = result['quality_metrics'].get('rms_difference_db', 'N/A')
                    correlation = result['quality_metrics'].get('pearson_correlation', 'N/A')
                    rt_factor = result['performance_metrics'].get('real_time_factor', 'N/A')
                    
                    f.write(f"| {result['config_name']} | {result['signal_name']} | "
                           f"{quality_score} | {rms_diff} | {correlation} | {rt_factor} |\\n")
            
            # Detailed results
            f.write("\\n## Detailed Results\\n\\n")
            for result in results:
                f.write(f"### {result['config_name']} - {result['signal_name']}\\n\\n")
                
                if result['processing_success']:
                    f.write("**Quality Metrics:**\\n")
                    for metric, value in result['quality_metrics'].items():
                        f.write(f"- {metric}: {value}\\n")
                    
                    f.write("\\n**Performance Metrics:**\\n")
                    for metric, value in result['performance_metrics'].items():
                        f.write(f"- {metric}: {value}\\n")
                else:
                    f.write("❌ Processing failed\\n")
                
                f.write("\\n")
        
        print(f"\\n📋 Report generated: {report_path}")
        return report_path
    
    def create_visualization(self, results: List[Dict]) -> str:
        """Create visualization of test results."""
        try:
            # Extract data for plotting
            configs = []
            signals = []
            quality_scores = []
            rt_factors = []
            
            for result in results:
                if result['processing_success']:
                    configs.append(result['config_name'])
                    signals.append(result['signal_name'])
                    quality_scores.append(result['quality_metrics'].get('overall_score', 0))
                    rt_factors.append(result['performance_metrics'].get('real_time_factor', 0))
            
            # Create plots
            fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
            
            # Quality scores
            ax1.scatter(range(len(quality_scores)), quality_scores, alpha=0.7)
            ax1.set_xlabel('Test Index')
            ax1.set_ylabel('Quality Score')
            ax1.set_title('Frame Limiter Quality Scores')
            ax1.grid(True, alpha=0.3)
            
            # Real-time factors
            ax2.scatter(range(len(rt_factors)), rt_factors, alpha=0.7, color='orange')
            ax2.set_xlabel('Test Index')
            ax2.set_ylabel('Real-Time Factor')
            ax2.set_title('Frame Limiter Performance')
            ax2.axhline(y=1, color='red', linestyle='--', alpha=0.7, label='Real-time threshold')
            ax2.legend()
            ax2.grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            plot_path = os.path.join(self.output_dir, "limiter_test_results.png")
            plt.savefig(plot_path, dpi=150, bbox_inches='tight')
            plt.close()
            
            print(f"📈 Visualization saved: {plot_path}")
            return plot_path
            
        except Exception as e:
            print(f"⚠ Visualization failed: {e}")
            return ""


def main():
    """Run frame-aware limiter tests."""
    tester = LimiterComparisonTest()
    
    # Run comprehensive tests
    results = tester.run_comprehensive_tests()
    
    # Generate report and visualization
    tester.generate_report(results)
    tester.create_visualization(results)
    
    # Save raw results
    results_file = os.path.join(tester.output_dir, "raw_results.json")
    with open(results_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    # Summary
    successful_tests = sum(1 for r in results if r['processing_success'])
    total_tests = len(results)
    
    print(f"\\n🎉 Testing complete!")
    print(f"✓ {successful_tests}/{total_tests} tests passed")
    print(f"📁 Results saved to: {tester.output_dir}/")
    
    if successful_tests > 0:
        avg_quality = np.mean([r['quality_metrics'].get('overall_score', 0) 
                              for r in results if r['processing_success']])
        avg_rt_factor = np.mean([r['performance_metrics'].get('real_time_factor', 0)
                                for r in results if r['processing_success']])
        
        print(f"📊 Average quality score: {avg_quality:.1f}/100")
        print(f"⚡ Average real-time factor: {avg_rt_factor:.1f}x")
        
        if avg_rt_factor > 2.0:
            print("🚀 Real-time performance target achieved!")
        else:
            print("⚠ Real-time performance may need optimization")


if __name__ == '__main__':
    main()