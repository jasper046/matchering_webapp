
// batch_processing.js

// --- Batch Processing Section ---
const processBatchForm = document.getElementById('process-batch-form');
const processBatchStatus = document.getElementById('process-batch-status');
const batchFileList = document.getElementById('batch-file-list');
const batchFilesContainer = document.getElementById('batch-files-container');
const batchBlendRatio = document.getElementById('batch-blend-ratio');

let batchProcessingJobId = null;
let batchProcessingInterval = null;

// Add validation for batch blend ratio input
batchBlendRatio.addEventListener('input', function() {
    // Remove any non-numeric characters except for temporary input states
    let value = this.value.replace(/[^0-9]/g, '');
    
    // Convert to number and clamp between 0-100
    if (value !== '') {
        let numValue = parseInt(value);
        if (numValue < 0) numValue = 0;
        if (numValue > 100) numValue = 100;
        this.value = numValue;
    }
});

// Also validate on blur to handle edge cases
batchBlendRatio.addEventListener('blur', function() {
    if (this.value === '' || isNaN(this.value)) {
        this.value = 100; // Default to 100 if invalid
    } else {
        let numValue = parseInt(this.value);
        if (numValue < 0) numValue = 0;
        if (numValue > 100) numValue = 100;
        this.value = numValue;
    }
});

// Add event listener to show file list when files are selected
document.getElementById('batch-target-files').addEventListener('change', function() {
    const targetFiles = this.files;
    if (targetFiles.length > 0) {
        createFileList(targetFiles);
        batchFileList.style.display = 'block';
    } else {
        batchFileList.style.display = 'none';
    }
});

processBatchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    window.showStatus(processBatchStatus, 'Starting batch processing...');
    batchResultsDiv.style.display = 'none';
    batchProgressBar.style.width = '0%';
    batchProgressText.textContent = '0%';

    const formData = new FormData();
    const targetFiles = document.getElementById('batch-target-files').files;
    for (let i = 0; i < targetFiles.length; i++) {
        formData.append('target_files', targetFiles[i]);
    }
    formData.append('use_stem_separation', document.getElementById('batch-use-stem-separation').checked);
    formData.append('limiter_enabled', window.batchLimiterEnabled); // Use global batchLimiterEnabled

    if (document.getElementById('batch-use-stem-separation').checked && document.getElementById('batchRadioPreset').checked) {
        formData.append('vocal_preset_file', document.getElementById('batch-vocal-preset-file').files[0]);
        formData.append('instrumental_preset_file', document.getElementById('batch-instrumental-preset-file').files[0]);
    }

    if (document.getElementById('batchRadioReference').checked) {
        formData.append('reference_file', document.getElementById('batch-reference-file').files[0]);
    } else if (document.getElementById('batchRadioPreset').checked) {
        if (!document.getElementById('batch-use-stem-separation').checked) {
            formData.append('preset_file', document.getElementById('batch-preset-file').files[0]);
        }
    }

    try {
        const response = await fetch('/api/process_batch', {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();

        if (response.ok) {
            batchProcessingJobId = data.job_id;
            window.showStatus(processBatchStatus, 'Batch processing started. Monitoring progress...');
            batchProcessingInterval = setInterval(() => pollBatchProgress(batchProcessingJobId), 1000);
        } else {
            window.showStatus(processBatchStatus, `Error: ${data.detail}`, true);
        }
    } catch (error) {
        window.showStatus(processBatchStatus, `Network error: ${error.message}`, true);
    }
});

// Create file list with initial pending status
function createFileList(files) {
    batchFilesContainer.innerHTML = '';
    for (let i = 0; i < files.length; i++) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'd-flex align-items-center gap-2 mb-2';
        fileDiv.id = `batch-file-${i}`;
        
        const statusIcon = document.createElement('span');
        statusIcon.className = 'batch-file-status';
        statusIcon.innerHTML = '☐'; // Empty checkbox
        statusIcon.style.fontSize = '16px';
        statusIcon.style.color = '#6c757d';
        
        const fileName = document.createElement('span');
        fileName.className = 'batch-file-name';
        fileName.textContent = files[i].name;
        fileName.style.color = '#f8f9fa';
        
        fileDiv.appendChild(statusIcon);
        fileDiv.appendChild(fileName);
        batchFilesContainer.appendChild(fileDiv);
    }
}

// Poll Batch Status
async function pollBatchProgress(batchId) {
    let lastProcessedCount = 0;
    
    const batchProgressBar = document.getElementById('batch-progress-bar');
    const batchProgressText = document.getElementById('batch-progress-text');
    const batchResultsDiv = document.getElementById('batch-results');

    const interval = setInterval(async () => {
        try {
            const response = await fetch(`/api/batch_status/${batchId}`);
            const data = await response.json();

            // Update file statuses
            if (data.processed_count > lastProcessedCount) {
                // Mark completed files
                for (let i = lastProcessedCount; i < data.processed_count; i++) {
                    updateFileStatus(i, 'completed', data.output_files[i]);
                }
                
                // Mark current file as processing (if not the last one)
                if (data.processed_count < data.total_count) {
                    updateFileStatus(data.processed_count, 'processing');
                }
                
                lastProcessedCount = data.processed_count;
            } else if (data.processed_count === 0 && lastProcessedCount === 0) {
                // Mark first file as processing when batch just started
                updateFileStatus(0, 'processing');
            }

            if (data.status === 'completed') {
                clearInterval(interval);
                window.showStatus(processBatchStatus, 'Batch processing completed: Right Click to Save As');
                batchResultsDiv.innerHTML = '';
                data.results.forEach(result => {
                    const p = document.createElement('p');
                    const link = document.createElement('a');
                    link.href = `/download/temp_file/${result.output_path.split('/').pop()}?download_name=${encodeURIComponent(result.output_filename)}`;
                    link.download = result.output_filename;
                    link.textContent = result.output_filename;
                    link.className = 'alert-link';
                    p.appendChild(document.createTextNode(`Processed: `));
                    p.appendChild(link);
                    batchResultsDiv.appendChild(p);
                });
                batchResultsDiv.style.display = 'block';
            } else if (data.status === 'failed') {
                clearInterval(interval);
                window.showStatus(processBatchStatus, `Batch processing failed: ${data.error}`, true);
            }
        } catch (error) {
            clearInterval(interval);
            window.showStatus(processBatchStatus, `Network error: ${error.message}`, true);
        }
    }, 2000); // Poll every 2 seconds
}

// Update file status in the list
function updateFileStatus(fileIndex, status, outputPath = null) {
    const fileDiv = document.getElementById(`batch-file-${fileIndex}`);
    if (!fileDiv) return;

    const statusIcon = fileDiv.querySelector('.batch-file-status');
    const fileName = fileDiv.querySelector('.batch-file-name');

    switch (status) {
        case 'processing':
            statusIcon.innerHTML = '⏳'; // Hourglass
            statusIcon.style.color = '#ffc107'; // Warning yellow
            break;
        case 'completed':
            statusIcon.innerHTML = '✅'; // Checkmark
            statusIcon.style.color = '#28a745'; // Success green
            
            if (outputPath) {
                // Convert filename to download link
                const outputFilename = outputPath.split('/').pop();
                const link = document.createElement('a');
                link.href = `/download/output/${outputFilename}`;
                link.target = '_blank';
                link.textContent = outputFilename;
                link.className = 'text-light';
                link.style.textDecoration = 'none';
                
                // Replace filename with download link
                fileName.innerHTML = '';
                fileName.appendChild(link);
            }
            break;
    }
}

// Export variables and functions that need to be accessed globally
window.batchLimiterEnabled = true; // Default to enabled

