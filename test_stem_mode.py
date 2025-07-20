#!/usr/bin/env python3
"""
Test script for debugging stem mode functionality
"""

import requests
import time
import os
import json

# Server base URL
BASE_URL = "http://localhost:8000"

def test_stem_separation():
    """Test the basic stem separation endpoint"""
    print("🔧 Testing stem separation...")
    
    # Use one of the test audio files
    audio_file = "audio/payback.wav"
    
    if not os.path.exists(audio_file):
        print(f"❌ Audio file not found: {audio_file}")
        return None
    
    try:
        # Submit stem separation request
        with open(audio_file, 'rb') as f:
            files = {'audio_file': f}
            response = requests.post(f"{BASE_URL}/api/separate_stems", files=files)
        
        if response.status_code == 200:
            data = response.json()
            job_id = data.get('job_id')
            print(f"✓ Stem separation started with job_id: {job_id}")
            return job_id
        else:
            print(f"❌ Stem separation failed: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during stem separation: {e}")
        return None

def monitor_progress(job_id):
    """Monitor the progress of a processing job"""
    print(f"📊 Monitoring progress for job {job_id}...")
    
    max_attempts = 60  # 5 minutes max
    attempt = 0
    
    while attempt < max_attempts:
        try:
            response = requests.get(f"{BASE_URL}/api/progress/{job_id}")
            
            if response.status_code == 200:
                data = response.json()
                stage = data.get('stage', 'unknown')
                progress = data.get('progress', 0)
                message = data.get('message', '')
                
                print(f"  [{progress:3d}%] {stage}: {message}")
                
                if stage == "completed":
                    print("✓ Processing completed!")
                    return data
                elif stage == "error":
                    print(f"❌ Processing failed: {message}")
                    return None
                
            else:
                print(f"❌ Progress check failed: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error checking progress: {e}")
        
        attempt += 1
        time.sleep(5)  # Wait 5 seconds between checks
    
    print("❌ Timeout waiting for processing to complete")
    return None

def test_stem_processing_with_preset():
    """Test stem processing using preset files"""
    print("🔧 Testing stem processing with preset...")
    
    # We'll need some preset files for this test
    # For now, just check the endpoint exists
    try:
        response = requests.get(f"{BASE_URL}/api/progress/test")
        print(f"✓ Server responding to API calls")
    except Exception as e:
        print(f"❌ Server not responding: {e}")

def test_jit_playback():
    """Test if JIT playback components are accessible"""
    print("🔧 Testing JIT playback components...")
    
    try:
        # Check if the JIT processor files are accessible
        jit_files = [
            "/static/jit-playback-manager.js",
            "/static/jit-audio-processor.js", 
            "/static/jit-fallback-processor.js"
        ]
        
        for jit_file in jit_files:
            response = requests.get(f"{BASE_URL}{jit_file}")
            if response.status_code == 200:
                print(f"✓ {jit_file} accessible")
            else:
                print(f"❌ {jit_file} not accessible: {response.status_code}")
                
    except Exception as e:
        print(f"❌ Error testing JIT components: {e}")

def main():
    print("🧪 Starting stem mode debugging tests...")
    print("=" * 50)
    
    # Test 1: Basic connectivity
    try:
        response = requests.get(BASE_URL)
        if response.status_code == 200:
            print("✓ Server is running and accessible")
        else:
            print(f"❌ Server returned {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        return
    
    # Test 2: JIT playback components
    test_jit_playback()
    print()
    
    # Test 3: Stem separation
    job_id = test_stem_separation()
    if job_id:
        print()
        # Test 4: Monitor progress
        result = monitor_progress(job_id)
        if result:
            print("\n📋 Final result:")
            print(json.dumps(result, indent=2))
    
    print("\n🧪 Testing complete!")

if __name__ == "__main__":
    main()