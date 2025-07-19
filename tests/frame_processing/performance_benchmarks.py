"""
Performance Benchmarking Module

This module provides comprehensive performance analysis tools for comparing
frame-based and monolithic audio processing approaches.
"""

import time
import psutil
import numpy as np
import threading
from typing import Dict, List, Tuple, Optional, Callable
from dataclasses import dataclass
from contextlib import contextmanager
import gc


@dataclass
class PerformanceMetric:
    """Container for individual performance measurements."""
    name: str
    value: float
    unit: str
    description: str


@dataclass
class BenchmarkResult:
    """Container for benchmark results."""
    test_name: str
    metrics: List[PerformanceMetric]
    timestamp: float
    duration_seconds: float


class MemoryProfiler:
    """Tracks memory usage during processing."""
    
    def __init__(self):
        self.process = psutil.Process()
        self.baseline_memory = 0
        self.peak_memory = 0
        self.memory_samples = []
        self.monitoring = False
        self.monitor_thread = None
    
    def start_monitoring(self, sample_interval: float = 0.1):
        """Start continuous memory monitoring."""
        self.baseline_memory = self.process.memory_info().rss / 1024 / 1024  # MB
        self.peak_memory = self.baseline_memory
        self.memory_samples = []
        self.monitoring = True
        
        self.monitor_thread = threading.Thread(target=self._monitor_loop, args=(sample_interval,))
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
    
    def stop_monitoring(self) -> Dict[str, float]:
        """Stop monitoring and return memory statistics."""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=1.0)
        
        current_memory = self.process.memory_info().rss / 1024 / 1024  # MB
        
        if self.memory_samples:
            avg_memory = np.mean(self.memory_samples)
            memory_variance = np.var(self.memory_samples)
        else:
            avg_memory = current_memory
            memory_variance = 0
        
        return {
            'baseline_mb': self.baseline_memory,
            'peak_mb': self.peak_memory,
            'current_mb': current_memory,
            'average_mb': avg_memory,
            'variance_mb': memory_variance,
            'peak_increase_mb': self.peak_memory - self.baseline_memory
        }
    
    def _monitor_loop(self, sample_interval: float):
        """Internal monitoring loop."""
        while self.monitoring:
            try:
                current_memory = self.process.memory_info().rss / 1024 / 1024  # MB
                self.memory_samples.append(current_memory)
                self.peak_memory = max(self.peak_memory, current_memory)
                time.sleep(sample_interval)
            except Exception:
                break


class CPUProfiler:
    """Tracks CPU usage during processing."""
    
    def __init__(self):
        self.cpu_samples = []
        self.monitoring = False
        self.monitor_thread = None
    
    def start_monitoring(self, sample_interval: float = 0.1):
        """Start CPU monitoring."""
        self.cpu_samples = []
        self.monitoring = True
        
        # Get baseline CPU usage
        psutil.cpu_percent(interval=None)  # Initialize
        
        self.monitor_thread = threading.Thread(target=self._monitor_loop, args=(sample_interval,))
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
    
    def stop_monitoring(self) -> Dict[str, float]:
        """Stop monitoring and return CPU statistics."""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=1.0)
        
        if self.cpu_samples:
            return {
                'average_percent': np.mean(self.cpu_samples),
                'peak_percent': np.max(self.cpu_samples),
                'variance_percent': np.var(self.cpu_samples),
                'samples_count': len(self.cpu_samples)
            }
        else:
            return {
                'average_percent': 0,
                'peak_percent': 0,
                'variance_percent': 0,
                'samples_count': 0
            }
    
    def _monitor_loop(self, sample_interval: float):
        """Internal monitoring loop."""
        while self.monitoring:
            try:
                cpu_percent = psutil.cpu_percent(interval=sample_interval)
                self.cpu_samples.append(cpu_percent)
            except Exception:
                break


@contextmanager
def timer():
    """Context manager for precise timing."""
    start_time = time.perf_counter()
    yield
    end_time = time.perf_counter()
    return end_time - start_time


class PerformanceBenchmark:
    """Main performance benchmarking class."""
    
    def __init__(self):
        self.memory_profiler = MemoryProfiler()
        self.cpu_profiler = CPUProfiler()
        self.results = []
    
    def benchmark_function(self, func: Callable, *args, test_name: str = "benchmark", 
                          monitor_resources: bool = True, **kwargs) -> BenchmarkResult:
        """
        Benchmark a function call with comprehensive metrics.
        
        Args:
            func: Function to benchmark
            *args: Function arguments
            test_name: Name for this benchmark
            monitor_resources: Whether to monitor CPU/memory
            **kwargs: Function keyword arguments
            
        Returns:
            BenchmarkResult with detailed metrics
        """
        metrics = []
        
        # Force garbage collection before benchmark
        gc.collect()
        
        # Start resource monitoring
        if monitor_resources:
            self.memory_profiler.start_monitoring()
            self.cpu_profiler.start_monitoring()
        
        # Benchmark execution time
        start_time = time.perf_counter()
        start_timestamp = time.time()
        
        try:
            result = func(*args, **kwargs)
            success = True
        except Exception as e:
            result = None
            success = False
            metrics.append(PerformanceMetric(
                "error", 1.0, "bool", f"Execution failed: {str(e)}"
            ))
        
        end_time = time.perf_counter()
        execution_time = end_time - start_time
        
        # Stop resource monitoring
        if monitor_resources:
            memory_stats = self.memory_profiler.stop_monitoring()
            cpu_stats = self.cpu_profiler.stop_monitoring()
        else:
            memory_stats = {}
            cpu_stats = {}
        
        # Collect timing metrics
        metrics.append(PerformanceMetric(
            "execution_time", execution_time, "seconds", "Total execution time"
        ))
        
        metrics.append(PerformanceMetric(
            "success", 1.0 if success else 0.0, "bool", "Execution success"
        ))
        
        # Collect resource metrics
        if monitor_resources:
            for key, value in memory_stats.items():
                metrics.append(PerformanceMetric(
                    f"memory_{key}", value, "MB", f"Memory: {key}"
                ))
            
            for key, value in cpu_stats.items():
                metrics.append(PerformanceMetric(
                    f"cpu_{key}", value, "%", f"CPU: {key}"
                ))
        
        # Create result
        benchmark_result = BenchmarkResult(
            test_name=test_name,
            metrics=metrics,
            timestamp=start_timestamp,
            duration_seconds=execution_time
        )
        
        self.results.append(benchmark_result)
        return benchmark_result
    
    def compare_implementations(self, implementations: Dict[str, Callable], 
                              test_args: List[Tuple], iterations: int = 3) -> Dict[str, any]:
        """
        Compare multiple implementations with the same test cases.
        
        Args:
            implementations: Dict of {name: function} to compare
            test_args: List of argument tuples to test with
            iterations: Number of iterations per test
            
        Returns:
            Comprehensive comparison results
        """
        comparison_results = {
            'individual_results': {},
            'summary': {},
            'recommendations': []
        }
        
        # Run all implementations with all test cases
        for impl_name, impl_func in implementations.items():
            impl_results = []
            
            for test_idx, args in enumerate(test_args):
                for iteration in range(iterations):
                    test_name = f"{impl_name}_test_{test_idx}_iter_{iteration}"
                    
                    result = self.benchmark_function(
                        impl_func, *args, test_name=test_name
                    )
                    impl_results.append(result)
            
            comparison_results['individual_results'][impl_name] = impl_results
        
        # Calculate summary statistics
        for impl_name, results in comparison_results['individual_results'].items():
            execution_times = [r.duration_seconds for r in results]
            memory_peaks = [
                next((m.value for m in r.metrics if m.name == "memory_peak_mb"), 0)
                for r in results
            ]
            cpu_averages = [
                next((m.value for m in r.metrics if m.name == "cpu_average_percent"), 0)
                for r in results
            ]
            
            comparison_results['summary'][impl_name] = {
                'avg_execution_time': np.mean(execution_times),
                'std_execution_time': np.std(execution_times),
                'min_execution_time': np.min(execution_times),
                'max_execution_time': np.max(execution_times),
                'avg_memory_peak': np.mean(memory_peaks),
                'avg_cpu_usage': np.mean(cpu_averages),
                'total_tests': len(results),
                'success_rate': sum(1 for r in results if any(m.name == "success" and m.value == 1.0 for m in r.metrics)) / len(results)
            }
        
        # Generate recommendations
        comparison_results['recommendations'] = self._generate_recommendations(
            comparison_results['summary']
        )
        
        return comparison_results
    
    def benchmark_real_time_performance(self, process_func: Callable, 
                                      audio_duration: float, 
                                      target_real_time_factor: float = 2.0) -> Dict[str, any]:
        """
        Benchmark real-time performance characteristics.
        
        Args:
            process_func: Function to benchmark for real-time use
            audio_duration: Duration of audio being processed (seconds)
            target_real_time_factor: Target real-time factor (2.0 = 2x faster than real-time)
            
        Returns:
            Real-time performance analysis
        """
        # Multiple iterations to get stable results
        iterations = 5
        processing_times = []
        
        for i in range(iterations):
            result = self.benchmark_function(
                process_func, test_name=f"realtime_test_{i}"
            )
            processing_times.append(result.duration_seconds)
        
        # Calculate real-time metrics
        avg_processing_time = np.mean(processing_times)
        real_time_factor = audio_duration / avg_processing_time if avg_processing_time > 0 else 0
        
        # Performance assessment
        meets_target = real_time_factor >= target_real_time_factor
        latency_ms = avg_processing_time * 1000
        
        # Calculate headroom
        headroom_factor = real_time_factor / target_real_time_factor if target_real_time_factor > 0 else 0
        
        return {
            'audio_duration_s': audio_duration,
            'avg_processing_time_s': avg_processing_time,
            'real_time_factor': real_time_factor,
            'target_real_time_factor': target_real_time_factor,
            'meets_target': meets_target,
            'latency_ms': latency_ms,
            'headroom_factor': headroom_factor,
            'processing_times': processing_times,
            'consistency_std': np.std(processing_times),
            'recommended_for_realtime': meets_target and np.std(processing_times) < 0.1
        }
    
    def profile_memory_efficiency(self, func: Callable, *args, **kwargs) -> Dict[str, float]:
        """
        Detailed memory profiling for a function.
        
        Returns:
            Detailed memory usage statistics
        """
        # Get initial memory state
        gc.collect()
        initial_memory = self.memory_profiler.process.memory_info().rss / 1024 / 1024
        
        # Run with detailed monitoring
        self.memory_profiler.start_monitoring(sample_interval=0.01)  # High frequency
        
        try:
            result = func(*args, **kwargs)
            success = True
        except Exception as e:
            result = None
            success = False
        
        memory_stats = self.memory_profiler.stop_monitoring()
        
        # Force cleanup and measure final state
        del result
        gc.collect()
        final_memory = self.memory_profiler.process.memory_info().rss / 1024 / 1024
        
        # Calculate efficiency metrics
        memory_stats.update({
            'initial_mb': initial_memory,
            'final_mb': final_memory,
            'net_increase_mb': final_memory - initial_memory,
            'peak_temporary_mb': memory_stats['peak_mb'] - initial_memory,
            'cleanup_efficiency': (memory_stats['peak_mb'] - final_memory) / (memory_stats['peak_mb'] - initial_memory) if memory_stats['peak_mb'] > initial_memory else 1.0,
            'success': success
        })
        
        return memory_stats
    
    def _generate_recommendations(self, summary: Dict[str, Dict]) -> List[str]:
        """Generate performance recommendations based on benchmark results."""
        recommendations = []
        
        if not summary:
            return ["No benchmark data available for recommendations"]
        
        # Find fastest implementation
        fastest_impl = min(summary.keys(), 
                          key=lambda k: summary[k]['avg_execution_time'])
        
        recommendations.append(f"Fastest implementation: {fastest_impl}")
        
        # Find most memory efficient
        memory_efficient = min(summary.keys(),
                             key=lambda k: summary[k]['avg_memory_peak'])
        
        recommendations.append(f"Most memory efficient: {memory_efficient}")
        
        # Find most reliable
        most_reliable = max(summary.keys(),
                           key=lambda k: summary[k]['success_rate'])
        
        recommendations.append(f"Most reliable: {most_reliable}")
        
        # Performance analysis
        fastest_time = summary[fastest_impl]['avg_execution_time']
        for impl_name, stats in summary.items():
            if impl_name != fastest_impl:
                slowdown = stats['avg_execution_time'] / fastest_time
                if slowdown > 2.0:
                    recommendations.append(f"{impl_name} is {slowdown:.1f}x slower than {fastest_impl}")
        
        # Memory analysis
        for impl_name, stats in summary.items():
            if stats['avg_memory_peak'] > 100:  # > 100MB
                recommendations.append(f"{impl_name} uses significant memory ({stats['avg_memory_peak']:.1f} MB)")
        
        return recommendations
    
    def export_results(self, filename: str) -> bool:
        """Export benchmark results to JSON file."""
        import json
        
        try:
            export_data = {
                'benchmark_results': [],
                'summary': {},
                'timestamp': time.time()
            }
            
            # Convert results to serializable format
            for result in self.results:
                result_data = {
                    'test_name': result.test_name,
                    'timestamp': result.timestamp,
                    'duration_seconds': result.duration_seconds,
                    'metrics': {}
                }
                
                for metric in result.metrics:
                    result_data['metrics'][metric.name] = {
                        'value': metric.value,
                        'unit': metric.unit,
                        'description': metric.description
                    }
                
                export_data['benchmark_results'].append(result_data)
            
            # Write to file
            with open(filename, 'w') as f:
                json.dump(export_data, f, indent=2)
            
            return True
            
        except Exception as e:
            print(f"Failed to export results: {e}")
            return False