# Matchering Web App

This is a web-based application that provides a user-friendly interface for the `matchering` audio mastering library. It allows you to create and blend audio presets, perform single and batch audio conversions, and interactively blend original and mastered tracks.

## Features

*   **Create Presets:** Generate reusable audio characteristic presets from reference audio files.
*   **Blend Presets:** Combine up to 5 existing presets into a new, blended preset.
*   **Single File Conversion with Interactive Blending:**
    *   Master a single target audio file using either a reference track or a saved preset.
    *   Visually compare original and processed waveforms.
    *   Interact with a real-time blend slider to mix the original and mastered audio.
    *   Save the blended audio at your desired mix ratio.
*   **Batch Conversion:** Process multiple target audio files using a single preset, with progress tracking.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   **Python 3.8+**
*   **Git**

## Setup

Follow these steps to set up and run the Matchering Web App:

1.  **Clone the Repository:**
    ```bash
    git clone git@github.com:jasper046/matchering_webapp.git
    cd matchering_webapp
    ```

2.  **Initialize and Update Git Submodules:**
    This project uses a Git submodule for the `matchering` library. You need to initialize and update it:
    ```bash
    git submodule update --init --recursive
    ```

3.  **Create and Activate a Virtual Environment:**
    It's highly recommended to use a virtual environment to manage project dependencies.
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

4.  **Install Dependencies:**
    Install the required Python packages for the web app and the `matchering` library (in editable mode).
    ```bash
    pip install -r requirements.txt
    pip install -e ./matchering-fork
    ```
    *(Note: A `requirements.txt` will be generated/updated in a future step if not already present.)*

## Running the Application

Once setup is complete, you can start the web server using the provided script:

1.  **Make the script executable:**
    ```bash
    chmod +x start_server.sh
    ```
2.  **Run the server:**
    ```bash
    ./start_server.sh
    ```

*   The server will typically run on `http://0.0.0.0:8000`.
*   Open your web browser and navigate to `http://<YOUR_SERVER_IP>:8000` (replace `<YOUR_SERVER_IP>` with the actual IP address of the machine running the server).

## Usage

The web interface is divided into several sections:

### Create Preset

1.  Upload a **Reference Audio File** (e.g., a `.wav` file).
2.  Click "Create Preset".
3.  The server will analyze the reference and save a `.pkl` preset file. A link to download the preset will appear.

### Blend Presets

1.  Upload **2 to 5 Preset Files** (e.g., `.pkl` files).
2.  Provide a **New Preset Name**.
3.  Click "Blend Presets".
4.  The server will blend the selected presets into a new `.pkl` file. A link to download the blended preset will appear.

### Single File Conversion

1.  Upload a **Target Audio File**.
2.  Choose whether to use a **Reference Track** or a **Preset File** and upload the corresponding file.
3.  Click "Process Single File".
4.  After processing, the interface will display:
    *   Waveforms for the original and processed audio.
    *   A **Blend Slider** (0-100) to interactively mix the original and processed audio in real-time.
    *   A single audio player for the blended output.
5.  Adjust the slider to find your desired mix. The audio player will update in real-time.
6.  Click "Save Blended Audio" to save the current blend as a new `.wav` file. A download link will appear.

### Batch Conversion

1.  Upload a **Preset File** (e.g., a `.pkl` file).
2.  Upload **1 to 20 Target Audio Files**.
3.  Click "Start Batch Conversion".
4.  The server will process the files in the background. You can monitor the progress via the progress bar and status updates.
5.  Once completed, download links for all processed audio files will appear.

## Project Structure

*   `app/`: Contains the FastAPI application code.
    *   `main.py`: The main FastAPI application file, defining API endpoints.
    *   `static/`: Static assets (CSS, JavaScript).
    *   `templates/`: HTML templates (e.g., `index.html`).
*   `matchering-fork/`: Git submodule containing your forked `matchering` library.
*   `uploads/`: Temporary storage for uploaded files.
*   `presets/`: Stores generated `.pkl` preset files.
*   `outputs/`: Stores generated `.wav` output audio files.
*   `venv/`: Python virtual environment (created during setup).

## Limitations

*   **Single-Client Use Only:** This application is designed for single-user environments. Multiple concurrent users may experience conflicts with file operations, batch job tracking, and shared storage directories. For multi-user deployment, session isolation and per-user file management would need to be implemented.

## Troubleshooting

*   **`ModuleNotFoundError` or `ImportError`:** Ensure your virtual environment is activated (`source venv/bin/activate`) and all dependencies are installed (`pip install -r requirements.txt` and `pip install -e ./matchering-fork`).
*   **File Upload Issues:** Check file sizes and types. Ensure your browser and server have sufficient resources.
*   **Audio Playback/Blending Issues:** Ensure your browser supports the Web Audio API. Check the browser's developer console for JavaScript errors.