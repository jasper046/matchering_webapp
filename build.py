

import os
import sys
import subprocess
import requests
from urllib.parse import urlparse

# --- Configuration ---
APP_NAME = "MatcheringWebApp"
ENTRY_POINT = "app/main.py"
MODEL_URL = "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Voc_FT.onnx"
MODEL_DIR = "models"
DIST_DIR = "dist"
BUILD_DIR = "build"

# --- Helper Functions ---
def install_pyinstaller():
    """Checks if PyInstaller is installed and installs it if not."""
    try:
        import PyInstaller
        print("PyInstaller is already installed.")
    except ImportError:
        print("PyInstaller not found. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
            print("PyInstaller installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Failed to install PyInstaller: {e}")
            sys.exit(1)

def download_file(url, dest_folder):
    """Downloads a file from a URL to a destination folder."""
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)
    
    filename = os.path.basename(urlparse(url).path)
    dest_path = os.path.join(dest_folder, filename)

    if os.path.exists(dest_path):
        print(f"Model already exists at {dest_path}. Skipping download.")
        return dest_path

    print(f"Downloading model from {url} to {dest_path}...")
    try:
        with requests.get(url, stream=True) as r:
            r.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        print("Model downloaded successfully.")
        return dest_path
    except requests.exceptions.RequestException as e:
        print(f"Error downloading model: {e}")
        sys.exit(1)

def run_pyinstaller(model_path):
    """Runs the PyInstaller command to build the executable."""
    pyinstaller_command = [
        sys.executable, "-m", "PyInstaller",
        "--name", APP_NAME,
        "--onefile",
        "--windowed",
        f"--add-data", f"{model_path}{os.pathsep}{MODEL_DIR}",
        f"--add-data", f"app/static{os.pathsep}app/static",
        f"--add-data", f"app/templates{os.pathsep}app/templates",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.protocols.websockets",
        "--hidden-import", "uvicorn.protocols.websockets.auto",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",
        "--hidden-import", "uvicorn.lifespan.off",
        "--additional-hooks-dir", ".",
        ENTRY_POINT,
        "--distpath", DIST_DIR,
        "--workpath", BUILD_DIR,
    ]
    
    print("Running PyInstaller...")
    print(" ".join(pyinstaller_command))
    
    try:
        subprocess.run(pyinstaller_command, check=True)
        print("PyInstaller build completed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"PyInstaller build failed: {e}")
        sys.exit(1)

# --- Main Execution ---
if __name__ == "__main__":
    # 1. Install PyInstaller if not present
    install_pyinstaller()

    # 2. Download the model
    model_path = download_file(MODEL_URL, MODEL_DIR)
    
    # 3. Run PyInstaller
    run_pyinstaller(model_path)
    
    print(f"\nBuild process finished. The executable is located in the '{DIST_DIR}' directory.")
