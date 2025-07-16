document.addEventListener('DOMContentLoaded', () => {
    // Helper function to display status messages
    function showStatus(element, message, isError = false) {
        element.innerHTML = message;
        element.className = `mt-3 alert ${isError ? 'alert-danger' : 'alert-success'}`;
    }

    // --- Create Preset Section ---
    const createPresetForm = document.getElementById('create-preset-form');
    const createPresetStatus = document.getElementById('create-preset-status');
    const createPresetDownloadDiv = document.getElementById('create-preset-download');
    const presetDownloadLinkContainer = document.getElementById('preset-download-link-container');

    let generatedPresetPath = '';
    let suggestedPresetFilename = ''; // New variable to store suggested filename

    createPresetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(createPresetStatus, 'Creating preset...');
        createPresetDownloadDiv.style.display = 'none';
        presetDownloadLinkContainer.innerHTML = ''; // Clear previous link

        const referenceFile = document.getElementById('reference-file-preset').files[0];

        const formData = new FormData();
        formData.append('reference_file', referenceFile);

        try {
            const response = await fetch('/api/create_preset', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(createPresetStatus, `Preset created.`);
                generatedPresetPath = data.preset_path;
                suggestedPresetFilename = data.suggested_filename; // Store suggested filename

                // Generate and display the download link
                const link = document.createElement('a');
                link.href = `/download/preset/${generatedPresetPath.split('/').pop()}?download_name=${encodeURIComponent(suggestedPresetFilename)}`;
                link.download = suggestedPresetFilename; // Suggest filename for download
                link.textContent = suggestedPresetFilename; // Only filename as link text
                link.className = 'alert-link'; // Apply Bootstrap link styling
                
                const instructionText = document.createTextNode(' (Right Click to Save As)');

                presetDownloadLinkContainer.appendChild(link);
                presetDownloadLinkContainer.appendChild(instructionText);
                createPresetDownloadDiv.style.display = 'block';

            } else {
                showStatus(createPresetStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(createPresetStatus, `Network error: ${error.message}`, true);
        }
    });

    // --- Blend Presets Section ---
    const blendPresetsForm = document.getElementById('blend-presets-form');
    const blendPresetsStatus = document.getElementById('blend-presets-status');
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
                showStatus(blendPresetsStatus, `Blended preset saved: <a href="/download/preset/${data.blended_preset_path.split('/').pop()}" target="_blank">${data.blended_preset_path.split('/').pop()}</a>`);
            } else {
                showStatus(blendPresetsStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(blendPresetsStatus, `Network error: ${error.message}`, true);
        }
    });

    // --- Single File Conversion Section ---
    const processSingleForm = document.getElementById('process-single-form');
    const processSingleStatus = document.getElementById('process-single-status');
    const singleConversionResults = document.getElementById('single-conversion-results');
    const radioReference = document.getElementById('radioReference');
    const radioPreset = document.getElementById('radioPreset');
    const referenceFileSingleDiv = document.getElementById('reference-file-single-div');
    const referenceFileSingle = document.getElementById('reference-file-single');
    const presetFileSingleDiv = document.getElementById('preset-file-single-div');
    const presetFileSingle = document.getElementById('preset-file-single');
    const blendSlider = document.getElementById('blend-slider');
    const blendedPlayer = document.getElementById('blended-player');
    const saveBlendButton = document.getElementById('save-blend-button');
    const saveBlendStatus = document.getElementById('save-blend-status');

    let audioContext;
    let originalSourceNode;
    let processedSourceNode;
    let gainOriginal;
    let gainProcessed;
    let originalBuffer;
    let processedBuffer;

    // Toggle reference/preset file input for single conversion
    function toggleReferenceInput() {
        if (radioReference.checked) {
            referenceFileSingleDiv.style.display = 'block';
            referenceFileSingle.setAttribute('required', 'true');
            presetFileSingleDiv.style.display = 'none';
            presetFileSingle.removeAttribute('required');
        } else {
            referenceFileSingleDiv.style.display = 'none';
            referenceFileSingle.removeAttribute('required');
            presetFileSingleDiv.style.display = 'block';
            presetFileSingle.setAttribute('required', 'true');
        }
    }
    radioReference.addEventListener('change', toggleReferenceInput);
    radioPreset.addEventListener('change', toggleReferenceInput);
    toggleReferenceInput(); // Call on load to set initial state

    // Process Single File Form Submission
    processSingleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(processSingleStatus, 'Processing single file...');
        singleConversionResults.style.display = 'none';
        saveBlendStatus.textContent = '';

        const formData = new FormData();
        formData.append('target_file', document.getElementById('target-file-single').files[0]);

        if (radioReference.checked) {
            formData.append('reference_file', referenceFileSingle.files[0]);
        }
        else if (radioPreset.checked) {
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
                // Store paths in dataset attributes for later use by saveBlendButton
                processSingleStatus.dataset.originalFilePath = data.original_file_path;
                processSingleStatus.dataset.processedFilePath = data.processed_file_path;
                setupAudioContext(data.original_file_path, data.processed_file_path);
            } else {
                showStatus(processSingleStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processSingleStatus, `Network error: ${error.message}`, true);
        }
    });

    // Setup Web Audio API for blending
    async function setupAudioContext(originalPath, processedPath) {
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
        originalSourceNode = audioContext.createBufferSource();
        originalSourceNode.buffer = originalBuffer;
        gainOriginal = audioContext.createGain();
        originalSourceNode.connect(gainOriginal);

        processedSourceNode = audioContext.createBufferSource();
        processedSourceNode.buffer = processedBuffer;
        gainProcessed = audioContext.createGain();
        processedSourceNode.connect(gainProcessed);

        // Connect gain nodes to a single destination (the audio context's speakers)
        gainOriginal.connect(audioContext.destination);
        gainProcessed.connect(audioContext.destination);

        // Initial blend setting
        updateBlend();

        // Start playback (looping for continuous blending)
        originalSourceNode.loop = true;
        processedSourceNode.loop = true;
        originalSourceNode.start(0);
        processedSourceNode.start(0);

        // Draw waveforms
        drawWaveform(document.getElementById('original-waveform'), originalBuffer, '#007bff');
        drawWaveform(document.getElementById('processed-waveform'), processedBuffer, '#28a745');
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

    // Waveform drawing function
    function drawWaveform(canvas, buffer, color) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth; // Set canvas width to its display width
        const height = canvas.height = canvas.offsetHeight; // Set canvas height to its display height
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

    // --- Batch Processing Section ---
    const processBatchForm = document.getElementById('process-batch-form');
    const processBatchStatus = document.getElementById('process-batch-status');
    const batchProgress = document.getElementById('batch-progress');
    const processedCountSpan = document.getElementById('processed-count');
    const totalCountSpan = document.getElementById('total-count');
    const progressBar = document.querySelector('.progress-bar');
    const batchOutputLinks = document.getElementById('batch-output-links');

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
                progressBar.setAttribute('aria-valuenow', progress);
                progressBar.textContent = `${Math.round(progress)}%`;

                if (data.status === 'completed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, 'Batch processing completed!');
                    data.output_files.forEach(filePath => {
                        const filename = filePath.split('/').pop();
                        const link = `<a href="/download/output/${filename}" target="_blank" class="alert-link">${filename}</a><br>`;
                        batchOutputLinks.innerHTML += link;
                    });
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, `Batch processing failed: ${data.error}`, true);
                }
            } catch (error) {
                clearInterval(interval);
                showStatus(processBatchStatus, `Network error: ${error.message}`, true);
            }
        }, 3000); // Poll every 3 seconds
    }
});
