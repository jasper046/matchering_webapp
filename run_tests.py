#!/usr/bin/env python3
"""
Test runner for the Matchering webapp audio processing modules.

This script runs the unit tests for the audio processing modules and provides
a summary of the results.
"""

import sys
import os
import subprocess
from pathlib import Path

# Add the app directory to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

def run_tests():
    """Run the unit tests and return the exit code."""
    
    print("🧪 Running Matchering Webapp Audio Processing Tests\n")
    
    # Test command
    cmd = [
        sys.executable, "-m", "pytest",
        "tests/",
        "-v",  # Verbose output
        "--tb=short",  # Short traceback format
        "--cov=app.audio",  # Coverage for audio modules
        "--cov-report=term-missing",  # Show missing lines in coverage
        "--color=yes"  # Colored output
    ]
    
    try:
        # Run tests
        result = subprocess.run(cmd, cwd=PROJECT_ROOT)
        return result.returncode
        
    except FileNotFoundError:
        print("❌ Error: pytest not found. Please install test dependencies:")
        print("   pip install pytest pytest-cov")
        return 1
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        return 1


def main():
    """Main entry point."""
    
    # Check if we're in the right directory
    if not (PROJECT_ROOT / "app" / "audio").exists():
        print("❌ Error: Run this script from the matchering_webapp directory")
        print(f"   Current directory: {PROJECT_ROOT}")
        return 1
    
    # Check if test directory exists
    if not (PROJECT_ROOT / "tests").exists():
        print("❌ Error: tests/ directory not found")
        return 1
    
    # Run tests
    exit_code = run_tests()
    
    # Print summary
    if exit_code == 0:
        print("\n✅ All tests passed! Audio processing modules are ready for use.")
    else:
        print(f"\n❌ Tests failed with exit code {exit_code}")
        print("   Please fix the failing tests before proceeding.")
    
    return exit_code


if __name__ == "__main__":
    sys.exit(main())