// stem_separation.js

// Ensure the form handler is attached when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const stemForm = document.getElementById('stem-separation-form');
    if (stemForm) {
        console.log('Direct attachment: Found stem form');
        stemForm.addEventListener('submit', function(event) {
            console.log('Direct handler: Stem form submitted');
            if (window.handleStemSeparationFormSubmit) {
                window.handleStemSeparationFormSubmit(event);
            } else {
                console.error('handleStemSeparationFormSubmit not found');
                event.preventDefault();
            }
        });
    } else {
        console.warn('Direct attachment: stem-separation-form not found');
    }
});

// Handle stem separation form submission
window.handleStemSeparationFormSubmit = async (event) => {
    console.log('Stem separation form submitted');
    event.preventDefault(); // Prevent default form submission and page navigation
    
    const statusDiv = document.getElementById('stem-separation-status');
    const resultsDiv = document.getElementById('stem-separation-results');
    const stemForm = document.getElementById('stem-separation-form');
    
    // Hide previous results
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
    
    // Get form data
    const formData = new FormData(stemForm);
    const audioFile = document.getElementById('stem-audio-file').files[0];
    
    if (!audioFile) {
        statusDiv.innerHTML = '<div class="alert alert-danger">Please select an audio file.</div>';
        return;
    }
    
    try {
        // Show processing status
        statusDiv.innerHTML = '<div class="alert alert-info">Starting stem separation...</div>';
        
        // Submit to backend
        const response = await fetch('/api/separate_stems', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Start polling for progress
            if (result.job_id) {
                pollStemSeparationProgress(result.job_id, statusDiv, resultsDiv);
            } else {
                statusDiv.innerHTML = '<div class="alert alert-danger">No job ID received from server.</div>';
            }
        } else {
            const error = await response.json();
            statusDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.detail || 'Separation failed'}</div>`;
        }
    } catch (error) {
        console.error('Error submitting stem separation:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">Error: Failed to start stem separation</div>';
    }
    
    return false; // Prevent form submission
};

// Poll for stem separation progress
async function pollStemSeparationProgress(jobId, statusDiv, resultsDiv) {
    const maxAttempts = 300; // 5 minutes max
    let attempts = 0;
    
    const poll = async () => {
        try {
            attempts++;
            const response = await fetch(`/api/progress/${jobId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const progress = await response.json();
            console.log('Stem separation progress:', progress);
            
            // Update status display
            statusDiv.innerHTML = `
                <div class="alert alert-info">
                    <div class="d-flex justify-content-between align-items-center">
                        <span>${progress.message}</span>
                        <span class="badge bg-primary">${progress.progress}%</span>
                    </div>
                    <div class="progress mt-2">
                        <div class="progress-bar" style="width: ${progress.progress}%"></div>
                    </div>
                </div>
            `;
            
            if (progress.stage === 'complete') {
                // Separation completed successfully
                statusDiv.innerHTML = '<div class="alert alert-success">Stem separation completed successfully!</div>';
                
                // Only show download links if we have the required data AND processing is complete
                if (progress.vocal_path && progress.instrumental_path && 
                    progress.vocal_filename && progress.instrumental_filename) {
                    console.log('Showing stem download links');
                    showStemDownloadLinks(progress, resultsDiv);
                } else {
                    console.warn('Missing stem download data:', progress);
                }
                
            } else if (progress.stage === 'error') {
                // Separation failed
                statusDiv.innerHTML = `<div class="alert alert-danger">Stem separation failed: ${progress.message}</div>`;
                
            } else if (attempts < maxAttempts) {
                // Continue polling
                setTimeout(poll, 1000);
            } else {
                // Timeout
                statusDiv.innerHTML = '<div class="alert alert-warning">Processing timeout. Please check server status.</div>';
            }
            
        } catch (error) {
            console.error('Error polling stem separation progress:', error);
            if (attempts < maxAttempts) {
                setTimeout(poll, 2000); // Retry with longer delay
            } else {
                statusDiv.innerHTML = '<div class="alert alert-danger">Failed to get processing status</div>';
            }
        }
    };
    
    // Start polling
    poll();
}

// Show download links for separated stems
function showStemDownloadLinks(progressData, resultsDiv) {
    if (!resultsDiv) return;
    
    const downloadLinksContainer = document.getElementById('stem-download-links');
    if (!downloadLinksContainer) return;
    
    // Clear previous links
    downloadLinksContainer.innerHTML = '';
    
    if (progressData.vocal_path && progressData.instrumental_path) {
        // Create vocal download link
        const vocalLink = document.createElement('a');
        vocalLink.href = `/download/output/${progressData.vocal_filename || 'vocal.wav'}`;
        vocalLink.className = 'btn btn-success me-2';
        vocalLink.innerHTML = '🎤 Download Vocal';
        vocalLink.download = progressData.vocal_filename || 'vocal.wav';
        
        // Create instrumental download link
        const instrumentalLink = document.createElement('a');
        instrumentalLink.href = `/download/output/${progressData.instrumental_filename || 'instrumental.wav'}`;
        instrumentalLink.className = 'btn btn-info';
        instrumentalLink.innerHTML = '🎹 Download Instrumental';
        instrumentalLink.download = progressData.instrumental_filename || 'instrumental.wav';
        
        downloadLinksContainer.appendChild(vocalLink);
        downloadLinksContainer.appendChild(instrumentalLink);
        
        // Show results section
        resultsDiv.style.display = 'block';
    } else {
        console.warn('No stem paths found in progress data:', progressData);
    }
}