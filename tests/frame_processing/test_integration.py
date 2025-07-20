#!/usr/bin/env python3
"""
Frame Processing Integration Test

Tests the integration between frame processing components and the webapp.
This ensures the API endpoints, processing classes, and JavaScript integration
work together correctly.
"""

import os
import sys
import tempfile
import numpy as np
import soundfile as sf
import requests
import json
from pathlib import Path

# Add project paths
project_root = os.path.join(os.path.dirname(__file__), '../..')
sys.path.insert(0, project_root)

# Test configuration
TEST_AUDIO_DURATION = 5.0  # seconds
TEST_SAMPLE_RATE = 44100
BASE_URL = "http://localhost:8000"  # Assume server is running


def generate_test_audio(duration: float = TEST_AUDIO_DURATION, 
                       sample_rate: int = TEST_SAMPLE_RATE) -> np.ndarray:
    """Generate test audio signal for integration testing."""
    t = np.linspace(0, duration, int(duration * sample_rate), False)
    
    # Create a simple musical test signal
    # Fundamental + harmonics with some dynamics
    frequencies = [440, 880, 1320]  # A4 and harmonics
    amplitudes = [0.5, 0.3, 0.1]
    
    signal = np.zeros_like(t)
    for freq, amp in zip(frequencies, amplitudes):
        signal += amp * np.sin(2 * np.pi * freq * t)
    
    # Add amplitude modulation for dynamics
    envelope = 0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * t)
    signal *= envelope
    
    # Convert to stereo
    return np.column_stack([signal, signal])


class FrameProcessingIntegrationTest:
    """Integration test suite for frame processing webapp integration."""
    
    def __init__(self):
        self.base_url = BASE_URL
        self.session_id = None
        self.temp_files = []
        
    def cleanup(self):
        """Clean up temporary files and session."""
        for temp_file in self.temp_files:
            try:
                os.unlink(temp_file)
            except FileNotFoundError:
                pass
        
        if self.session_id:
            try:
                requests.delete(f"{self.base_url}/api/frame/session/{self.session_id}")
            except:
                pass
    
    def test_frame_processing_availability(self) -> bool:
        """Test if frame processing is available."""
        try:
            response = requests.get(f"{self.base_url}/api/frame/availability")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✓ Frame processing availability: {data.get('available', False)}")
                return data.get('available', False)
            else:
                print(f"✗ Availability check failed: {response.status_code}")
                return False
                
        except requests.exceptions.ConnectionError:
            print("✗ Server not running - start with: uvicorn app.main:app --host 0.0.0.0 --port 8000")
            return False
        except Exception as e:
            print(f"✗ Availability check error: {e}")
            return False
    
    def test_session_initialization(self) -> bool:
        """Test frame processing session initialization."""
        try:
            # Generate test audio file
            audio_data = generate_test_audio()
            
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                sf.write(tmp_file.name, audio_data, TEST_SAMPLE_RATE)
                self.temp_files.append(tmp_file.name)
                
                # Initialize session
                with open(tmp_file.name, 'rb') as audio_file:
                    files = {'audio_file': audio_file}
                    data = {
                        'output_dir': tempfile.gettempdir(),
                        'sample_rate': TEST_SAMPLE_RATE
                    }
                    
                    response = requests.post(
                        f"{self.base_url}/api/frame/initialize",
                        files=files,
                        data=data
                    )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        self.session_id = result.get('session_id')
                        print(f"✓ Session initialized: {self.session_id}")
                        return True
                    else:
                        print(f"✗ Session initialization failed: {result.get('message')}")
                        return False
                else:
                    print(f"✗ Session initialization HTTP error: {response.status_code}")
                    return False
                    
        except Exception as e:
            print(f"✗ Session initialization error: {e}")
            return False
    
    def test_preview_generation(self) -> bool:
        """Test frame-based preview generation."""
        if not self.session_id:
            print("✗ No session ID available for preview test")
            return False
        
        try:
            # Test different parameter sets
            test_params = [
                {
                    'vocal_gain_db': 0.0,
                    'instrumental_gain_db': 0.0,
                    'master_gain_db': 0.0,
                    'limiter_enabled': True,
                    'is_stem_mode': False,
                    'session_id': self.session_id
                },
                {
                    'vocal_gain_db': 3.0,
                    'instrumental_gain_db': -2.0,
                    'master_gain_db': 1.0,
                    'limiter_enabled': True,
                    'is_stem_mode': True,
                    'session_id': self.session_id
                }
            ]
            
            for i, params in enumerate(test_params):
                response = requests.post(
                    f"{self.base_url}/api/frame/preview",
                    json=params
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        preview_url = result.get('preview_url')
                        print(f"✓ Preview {i+1} generated: {preview_url}")
                    else:
                        print(f"✗ Preview {i+1} failed: {result.get('message')}")
                        return False
                else:
                    print(f"✗ Preview {i+1} HTTP error: {response.status_code}")
                    return False
            
            return True
            
        except Exception as e:
            print(f"✗ Preview generation error: {e}")
            return False
    
    def test_full_processing(self) -> bool:
        """Test full frame-based audio processing."""
        if not self.session_id:
            print("✗ No session ID available for full processing test")
            return False
        
        try:
            params = {
                'vocal_gain_db': 2.0,
                'instrumental_gain_db': -1.0,
                'master_gain_db': 0.5,
                'limiter_enabled': True,
                'is_stem_mode': False,
                'session_id': self.session_id
            }
            
            response = requests.post(
                f"{self.base_url}/api/frame/process_full",
                json=params
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    output_url = result.get('preview_url')
                    processing_info = result.get('processing_info', {})
                    print(f"✓ Full processing completed: {output_url}")
                    print(f"  Processing info: {processing_info.get('frame_processing_available', 'unknown')}")
                    return True
                else:
                    print(f"✗ Full processing failed: {result.get('message')}")
                    return False
            else:
                print(f"✗ Full processing HTTP error: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"✗ Full processing error: {e}")
            return False
    
    def test_performance_metrics(self) -> bool:
        """Test performance metrics endpoint."""
        try:
            response = requests.get(f"{self.base_url}/api/frame/performance")
            
            if response.status_code == 200:
                metrics = response.json()
                print(f"✓ Performance metrics retrieved:")
                print(f"  Active sessions: {metrics.get('total_active_sessions', 0)}")
                print(f"  Frame processing available: {metrics.get('frame_processing_available', False)}")
                return True
            else:
                print(f"✗ Performance metrics HTTP error: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"✗ Performance metrics error: {e}")
            return False
    
    def test_session_cleanup(self) -> bool:
        """Test session cleanup."""
        if not self.session_id:
            print("✓ No session to cleanup")
            return True
        
        try:
            response = requests.delete(f"{self.base_url}/api/frame/session/{self.session_id}")
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    print(f"✓ Session cleanup successful")
                    self.session_id = None
                    return True
                else:
                    print(f"✗ Session cleanup failed: {result.get('message')}")
                    return False
            else:
                print(f"✗ Session cleanup HTTP error: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"✗ Session cleanup error: {e}")
            return False
    
    def run_integration_tests(self) -> bool:
        """Run complete integration test suite."""
        print("🧪 Frame Processing Integration Tests")
        print("=" * 50)
        
        try:
            tests = [
                ("Frame Processing Availability", self.test_frame_processing_availability),
                ("Session Initialization", self.test_session_initialization),
                ("Preview Generation", self.test_preview_generation),
                ("Full Processing", self.test_full_processing),
                ("Performance Metrics", self.test_performance_metrics),
                ("Session Cleanup", self.test_session_cleanup)
            ]
            
            passed = 0
            total = len(tests)
            
            for test_name, test_function in tests:
                print(f"\n🔬 {test_name}...")
                
                try:
                    if test_function():
                        passed += 1
                    else:
                        print(f"❌ {test_name} failed")
                except Exception as e:
                    print(f"❌ {test_name} error: {e}")
            
            print(f"\n📊 Test Results: {passed}/{total} passed")
            
            if passed == total:
                print("🎉 All integration tests passed!")
                return True
            else:
                print("⚠️ Some tests failed - check server setup and dependencies")
                return False
        
        finally:
            self.cleanup()


def main():
    """Run integration tests."""
    tester = FrameProcessingIntegrationTest()
    success = tester.run_integration_tests()
    
    if success:
        print("\n✅ Frame processing integration is working correctly!")
        print("🚀 Ready for production use")
    else:
        print("\n❌ Integration tests failed")
        print("🔧 Check server status and frame processing setup")
    
    return 0 if success else 1


if __name__ == '__main__':
    exit(main())