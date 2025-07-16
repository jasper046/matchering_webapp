document.addEventListener('DOMContentLoaded', () => {
    const createPresetForm = document.getElementById('create-preset-form');
    const createPresetStatus = document.getElementById('create-preset-status');

    const blendPresetsForm = document.getElementById('blend-presets-form');
    const blendPresetsStatus = document.getElementById('blend-presets-status');

    const processSingleForm = document.getElementById('process-single-form');
    const processSingleStatus = document.getElementById('process-single-status');
    const singleConversionResults = document.getElementById('single-conversion-results');
    const referenceTypeSelect = document.getElementById('reference-type');
    const referenceFileSingle = document.getElementById('reference-file-single');
    const presetFileSingle = document.getElementById('preset-file-single');
    const blendSlider = document.getElementById('blend-slider');
    const blendedPlayer = document.getElementById('blended-player');
    const saveBlendButton = document.getElementById('save-blend-button');
    const saveBlendStatus = document.getElementById('save-blend-status');

    const processBatchForm = document.getElementById('process-batch-form');
    const processBatchStatus = document.getElementById('process-batch-status');
    const batchProgress = document.getElementById('batch-progress');
    const processedCountSpan = document.getElementById('processed-count');
    const totalCountSpan = document.getElementById('total-count');
    const progressBar = document.querySelector('.progress-bar');
    const batchOutputLinks = document.getElementById('batch-output-links');

    let audioContext;
    let originalSource;
    let processedSource;
    let gainOriginal;
    let gainProcessed;
    let originalBuffer;
    let processedBuffer;

    // Helper function to display status messages
    function showStatus(element, message, isError = false) {
        element.textContent = message;
        element.className = `status-message ${isError ? 'error' : 'success'}`;
    }

    // Toggle reference/preset file input for single conversion
    referenceTypeSelect.addEventListener('change', () => {
        if (referenceTypeSelect.value === 'reference') {
            referenceFileSingle.style.display = 'block';
            referenceFileSingle.setAttribute('required', 'true');
            presetFileSingle.style.display = 'none';
            presetFileSingle.removeAttribute('required');
        } else {
            referenceFileSingle.style.display = 'none';
            referenceFileSingle.removeAttribute('required');
            presetFileSingle.style.display = 'block';
            presetFileSingle.setAttribute('required', 'true');
        }
    });

    // Create Preset Form Submission
    createPresetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(createPresetStatus, 'Creating preset...');

        const formData = new FormData();
        formData.append('reference_file', document.getElementById('reference-file-preset').files[0]);

        try {
            const response = await fetch('/api/create_preset', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(createPresetStatus, `Preset created: ${data.preset_path}`);
            } else {
                showStatus(createPresetStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(createPresetStatus, `Network error: ${error.message}`, true);
        }
    });

    // Blend Presets Form Submission
    blendPresetsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(blendPresetsStatus, 'Blending presets...');

        const formData = new FormData();
        const presetFiles = document.getElementById('preset-files').files;
        for (let i = 0; i < presetFiles.length; i++) {
            formData.append('preset_files', presetFiles[i]);
        }
        formData.append('new_preset_name', document.getElementById('new-preset-name').value);

        try {
            const response = await fetch('/api/blend_presets', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(blendPresetsStatus, `Blended preset saved: ${data.blended_preset_path}`);
            } else {
                showStatus(blendPresetsStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(blendPresetsStatus, `Network error: ${error.message}`, true);
        }
    });

    // Process Single File Form Submission
    processSingleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(processSingleStatus, 'Processing single file...');
        singleConversionResults.style.display = 'none';
        saveBlendStatus.textContent = '';

        const formData = new FormData();
        formData.append('target_file', document.getElementById('target-file-single').files[0]);

        if (referenceTypeSelect.value === 'reference') {
            formData.append('reference_file', referenceFileSingle.files[0]);
        } else {
            formData.append('preset_file', presetFileSingle.files[0]);
        }

        try {
            const response = await fetch('/api/process_single', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(processSingleStatus, 'File processed. Adjust blend below.');
                singleConversionResults.style.display = 'block';
                setupAudioPlayers(data.original_file_path, data.processed_file_path);
            } else {
                showStatus(processSingleStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processSingleStatus, `Network error: ${error.message}`, true);
        }
    });

    // Setup Web Audio API for blending
    async function setupAudioPlayers(originalPath, processedPath) {
        if (audioContext) {
            audioContext.close();
        }
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Fetch audio files
        const fetchAudio = async (path) => {
            const response = await fetch(path);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        };

        originalBuffer = await fetchAudio(originalPath);
        processedBuffer = await fetchAudio(processedPath);

        // Create sources and gain nodes
        originalSource = audioContext.createBufferSource();
        originalSource.buffer = originalBuffer;
        gainOriginal = audioContext.createGain();
        originalSource.connect(gainOriginal);
        gainOriginal.connect(audioContext.destination);

        processedSource = audioContext.createBufferSource();
        processedSource.buffer = processedBuffer;
        gainProcessed = audioContext.createGain();
        processedSource.connect(gainProcessed);
        gainProcessed.connect(audioContext.destination);

        // Connect to blended player for playback control (optional, can be removed if only Web Audio API is used for playback)
        // This part is tricky. We want to control playback of the blended output, not individual sources.
        // For simplicity, we'll just start/stop the Web Audio API sources directly.
        // The <audio> element will be used as a visual cue/control, but its source will be empty.
        blendedPlayer.src = ''; // Clear any previous source

        // Initial blend setting
        updateBlend();

        // Start playback (looping for testing, remove loop for production)
        originalSource.loop = true;
        processedSource.loop = true;
        originalSource.start(0);
        processedSource.start(0);

        // Draw waveforms (placeholder - requires a library like wavesurfer.js for real implementation)
        drawWaveform(document.getElementById('original-waveform'), originalBuffer, 'blue');
        drawWaveform(document.getElementById('processed-waveform'), processedBuffer, 'red');
    }

    function updateBlend() {
        if (!audioContext || !gainOriginal || !gainProcessed) return;

        const blendValue = blendSlider.value / 100; // 0 to 1
        gainOriginal.gain.value = 1 - blendValue;
        gainProcessed.gain.value = blendValue;
    }

    blendSlider.addEventListener('input', updateBlend);

    // Save Blended Audio
    saveBlendButton.addEventListener('click', async () => {
        showStatus(saveBlendStatus, 'Saving blended audio...');

        const originalPath = document.getElementById('target-file-single').files[0].name; // This is not the full path, need to pass from backend
        const processedPath = document.getElementById('process-single-status').dataset.processedPath; // Need to store this from backend response

        // For now, we'll use the paths returned by the initial process_single endpoint
        // In a real app, you'd pass these paths from the backend response to the frontend
        const originalFilePathFromBackend = processSingleStatus.dataset.originalFilePath;
        const processedFilePathFromBackend = processSingleStatus.dataset.processedFilePath;

        const formData = new FormData();
        formData.append('original_path', originalFilePathFromBackend);
        formData.append('processed_path', processedFilePathFromBackend);
        formData.append('blend_ratio', blendSlider.value / 100);

        try {
            const response = await fetch('/api/blend_and_save', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(saveBlendStatus, `Blended audio saved: <a href="/download/output/${data.blended_file_path.split('/').pop()}" target="_blank">Download</a>`);
            } else {
                showStatus(saveBlendStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(saveBlendStatus, `Network error: ${error.message}`, true);
        }
    });

    // Placeholder for waveform drawing (requires a library like wavesurfer.js for proper implementation)
    function drawWaveform(canvas, buffer, color) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const data = buffer.getChannelData(0); // Get data from the first channel
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = color;

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) {
                    min = datum;
                } else if (datum > max) {
                    max = datum;
                }
            }
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
    }

    // Batch Processing Form Submission
    processBatchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(processBatchStatus, 'Starting batch processing...');
        batchProgress.style.display = 'none';
        batchOutputLinks.innerHTML = '';

        const formData = new FormData();
        formData.append('preset_file', document.getElementById('batch-preset-file').files[0]);
        const targetFiles = document.getElementById('batch-target-files').files;
        for (let i = 0; i < targetFiles.length; i++) {
            formData.append('target_files', targetFiles[i]);
        }

        try {
            const response = await fetch('/api/process_batch', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(processBatchStatus, `Batch processing started. Job ID: ${data.batch_id}`);
                batchProgress.style.display = 'block';
                pollBatchStatus(data.batch_id);
            } else {
                showStatus(processBatchStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processBatchStatus, `Network error: ${error.message}`, true);
        }
    });

    // Poll Batch Status
    async function pollBatchStatus(batchId) {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/api/batch_status/${batchId}`);
                const data = await response.json();

                processedCountSpan.textContent = data.processed_count;
                totalCountSpan.textContent = data.total_count;
                const progress = (data.processed_count / data.total_count) * 100;
                progressBar.style.width = `${progress}%`;
                progressBar.textContent = `${Math.round(progress)}%`;

                if (data.status === 'completed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, 'Batch processing completed!');
                    data.output_files.forEach(filePath => {
                        const filename = filePath.split('/').pop();
                        const link = `<a href="/download/output/${filename}" target="_blank">${filename}</a><br>`;
                        batchOutputLinks.innerHTML += link;
                    });
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, `Batch processing failed: ${data.error}`, true);
                }
            } catch (error) {
                clearInterval(interval);
                showStatus(processBatchStatus, `Error polling batch status: ${error.message}`, true);
            }
        }, 3000); // Poll every 3 seconds
    }

    // Store original and processed file paths from backend response for blend_and_save
    processSingleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // ... (existing code)
        try {
            const response = await fetch('/api/process_single', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(processSingleStatus, 'File processed. Adjust blend below.');
                singleConversionResults.style.display = 'block';
                // Store paths in dataset attributes for later use by saveBlendButton
                processSingleStatus.dataset.originalFilePath = data.original_file_path;
                processSingleStatus.dataset.processedFilePath = data.processed_file_path;
                setupAudioPlayers(data.original_file_path, data.processed_file_path);
            } else {
                showStatus(processSingleStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processSingleStatus, `Network error: ${error.message}`, true);
        }
    });
});
