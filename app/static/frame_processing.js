/**
 * Frame-Based Processing JavaScript Integration
 * 
 * Provides client-side functionality for frame-based audio processing,
 * including real-time parameter adjustments and smooth preview generation.
 * 
 * This module is designed to integrate seamlessly with the existing
 * webapp UI while providing enhanced real-time capabilities.
 */

class FrameProcessingManager {
    constructor() {
        this.sessionId = null;
        this.isFrameProcessingAvailable = false;
        this.isProcessing = false;
        this.lastPreviewUrl = null;
        
        // Debouncing for real-time parameter changes
        this.parameterUpdateTimeout = null;
        this.parameterUpdateDelay = 300; // ms
        
        // Processing parameters
        this.currentParameters = {
            vocal_gain_db: 0.0,
            instrumental_gain_db: 0.0,
            master_gain_db: 0.0,
            limiter_enabled: true,
            is_stem_mode: false
        };
        
        this.initializeEventHandlers();
    }
    
    /**
     * Initialize event handlers for frame processing controls
     */
    initializeEventHandlers() {
        // Check availability on page load
        this.checkFrameProcessingAvailability();
        
        // Parameter change handlers (will be bound to existing controls)
        document.addEventListener('parameterChange', (event) => {
            this.handleParameterChange(event.detail);
        });
        
        // Process button override for frame processing
        document.addEventListener('processButtonClick', (event) => {
            if (this.isFrameProcessingAvailable && this.sessionId) {
                event.preventDefault();
                this.processWithFrames();
            }
        });
    }
    
    /**
     * Check if frame processing is available
     */
    async checkFrameProcessingAvailability() {
        try {
            const response = await fetch('/api/frame/availability');
            const data = await response.json();
            
            this.isFrameProcessingAvailable = data.available;
            
            if (this.isFrameProcessingAvailable) {
                console.log('✓ Frame processing available');
                this.enableFrameProcessingUI();
            } else {
                console.log('⚠ Frame processing not available, using fallback');
                this.disableFrameProcessingUI();
            }
            
            return this.isFrameProcessingAvailable;
            
        } catch (error) {
            console.error('Failed to check frame processing availability:', error);
            this.isFrameProcessingAvailable = false;
            return false;
        }
    }
    
    /**
     * Initialize frame processing session
     */
    async initializeSession(audioFile, presetFile = null, outputDir = '/tmp') {
        if (!this.isFrameProcessingAvailable) {
            throw new Error('Frame processing not available');
        }
        
        try {
            const formData = new FormData();
            formData.append('audio_file', audioFile);
            formData.append('output_dir', outputDir);
            formData.append('sample_rate', '44100');
            
            if (presetFile) {
                formData.append('preset_file', presetFile);
            }
            
            const response = await fetch('/api/frame/initialize', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.sessionId = data.session_id;
                console.log(`Frame processing session initialized: ${this.sessionId}`);
                
                // Update UI to show frame processing is active
                this.showFrameProcessingStatus('Frame processing initialized');
                
                return data;
            } else {
                throw new Error(data.message);
            }
            
        } catch (error) {
            console.error('Failed to initialize frame processing session:', error);
            throw error;
        }
    }
    
    /**
     * Handle parameter changes with debouncing for real-time updates
     */
    handleParameterChange(newParameters) {
        // Update current parameters
        Object.assign(this.currentParameters, newParameters);
        
        // Clear existing timeout
        if (this.parameterUpdateTimeout) {
            clearTimeout(this.parameterUpdateTimeout);
        }
        
        // Set new timeout for debounced update
        this.parameterUpdateTimeout = setTimeout(() => {
            this.generateRealtimePreview();
        }, this.parameterUpdateDelay);
    }
    
    /**
     * Generate real-time preview with current parameters
     */
    async generateRealtimePreview() {
        if (!this.sessionId || this.isProcessing) {
            return;
        }
        
        try {
            this.isProcessing = true;
            this.showFrameProcessingStatus('Generating preview...');
            
            const response = await fetch('/api/frame/preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...this.currentParameters,
                    session_id: this.sessionId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update preview audio
                this.updatePreviewAudio(data.preview_url);
                this.showFrameProcessingStatus('Preview updated');
            } else {
                throw new Error(data.message);
            }
            
        } catch (error) {
            console.error('Failed to generate real-time preview:', error);
            this.showFrameProcessingStatus('Preview generation failed', true);
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Process full audio with frame-based approach
     */
    async processWithFrames() {
        if (!this.sessionId) {
            throw new Error('No active frame processing session');
        }
        
        try {
            this.isProcessing = true;
            this.showFrameProcessingStatus('Processing with frame-based algorithm...');
            
            const response = await fetch('/api/frame/process_full', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...this.currentParameters,
                    session_id: this.sessionId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showFrameProcessingStatus('Frame processing completed');
                
                // Update UI with final result
                this.updateFinalResult(data.preview_url);
                
                return data;
            } else {
                throw new Error(data.message);
            }
            
        } catch (error) {
            console.error('Frame processing failed:', error);
            this.showFrameProcessingStatus('Frame processing failed', true);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Update preview audio element
     */
    updatePreviewAudio(previewUrl) {
        // Use the global preview audio element that's already set up
        if (window.previewAudioElement && previewUrl) {
            // Remember if we were playing and the current time
            const wasPlaying = window.isPlaying && !window.previewAudioElement.paused;
            const currentTime = window.previewAudioElement.currentTime || 0;
            
            // Update audio source
            window.previewAudioElement.src = previewUrl;
            window.currentPreviewPath = previewUrl;
            
            // If we were playing, resume playback once the new audio loads
            if (wasPlaying) {
                window.previewAudioElement.addEventListener('canplaythrough', () => {
                    window.previewAudioElement.currentTime = currentTime;
                    window.previewAudioElement.play().then(() => {
                        if (typeof window.updatePlaybackButtons === 'function') {
                            window.updatePlaybackButtons('play');
                        }
                    }).catch(error => {
                        console.warn('Could not resume playback:', error);
                    });
                }, { once: true });
            }
            
            // Force load
            window.previewAudioElement.load();
            
            this.lastPreviewUrl = previewUrl;
            
            console.log('Frame processing preview audio updated:', previewUrl);
        }
    }
    
    /**
     * Update final processing result
     */
    updateFinalResult(resultUrl) {
        // Update download links and result display
        const resultsContainer = document.getElementById('single-conversion-results');
        
        if (resultsContainer && resultUrl) {
            // Create download link for frame-processed result
            const downloadLink = document.createElement('a');
            downloadLink.href = resultUrl;
            downloadLink.textContent = 'Download Frame-Processed Audio';
            downloadLink.className = 'btn btn-success me-2';
            downloadLink.download = 'frame_processed_audio.wav';
            
            // Add to results container
            resultsContainer.innerHTML = ''; // Clear previous results
            resultsContainer.appendChild(downloadLink);
            resultsContainer.style.display = 'block';
        }
    }
    
    /**
     * Clean up frame processing session
     */
    async cleanupSession() {
        if (this.sessionId) {
            try {
                await fetch(`/api/frame/session/${this.sessionId}`, {
                    method: 'DELETE'
                });
                
                console.log(`Frame processing session cleaned up: ${this.sessionId}`);
                
            } catch (error) {
                console.error('Failed to cleanup frame processing session:', error);
            } finally {
                this.sessionId = null;
                this.hideFrameProcessingStatus();
            }
        }
    }
    
    /**
     * Enable frame processing UI elements
     */
    enableFrameProcessingUI() {
        // Add frame processing indicator
        const indicator = document.createElement('div');
        indicator.id = 'frame-processing-indicator';
        indicator.className = 'alert alert-info';
        indicator.innerHTML = '🚀 Frame-based processing enabled for smooth real-time adjustments';
        indicator.style.display = 'none';
        
        // Insert at top of main content
        const mainContent = document.querySelector('.container');
        if (mainContent) {
            mainContent.insertBefore(indicator, mainContent.firstChild);
        }
        
        // Enable real-time parameter binding
        this.bindParameterControls();
    }
    
    /**
     * Disable frame processing UI elements
     */
    disableFrameProcessingUI() {
        const indicator = document.getElementById('frame-processing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    /**
     * Bind existing parameter controls to frame processing
     */
    bindParameterControls() {
        // Bind to existing knob controls
        const knobElements = document.querySelectorAll('.knob-canvas');
        
        knobElements.forEach(knob => {
            // Add event listeners for parameter changes
            knob.addEventListener('valueChange', (event) => {
                const parameter = this.mapKnobToParameter(knob);
                if (parameter) {
                    this.handleParameterChange({
                        [parameter]: event.detail.value
                    });
                }
            });
        });
        
        // Bind limiter toggle
        const limiterButton = document.getElementById('limiterButton');
        if (limiterButton) {
            limiterButton.addEventListener('click', () => {
                this.handleParameterChange({
                    limiter_enabled: limiterButton.classList.contains('active')
                });
            });
        }
    }
    
    /**
     * Map knob elements to parameter names
     */
    mapKnobToParameter(knobElement) {
        // Map based on element ID or parent container
        const id = knobElement.id;
        
        if (id.includes('vocal-gain')) return 'vocal_gain_db';
        if (id.includes('instrumental-gain')) return 'instrumental_gain_db';
        if (id.includes('master-gain')) return 'master_gain_db';
        
        return null;
    }
    
    /**
     * Show frame processing status
     */
    showFrameProcessingStatus(message, isError = false) {
        const indicator = document.getElementById('frame-processing-indicator');
        if (indicator) {
            indicator.textContent = `🚀 ${message}`;
            indicator.className = `alert ${isError ? 'alert-warning' : 'alert-info'}`;
            indicator.style.display = 'block';
        }
    }
    
    /**
     * Hide frame processing status
     */
    hideFrameProcessingStatus() {
        const indicator = document.getElementById('frame-processing-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    /**
     * Clear waveform cache (integrate with existing waveform system)
     */
    clearWaveformCache() {
        // This would integrate with the existing waveform caching system
        if (typeof clearWaveformCache === 'function') {
            clearWaveformCache();
        }
    }
    
    /**
     * Generate waveform for preview (integrate with existing system)
     */
    generateWaveformForPreview(sessionId) {
        const waveformImageElement = document.getElementById('combined-waveform-image');
        if (!waveformImageElement) {
            console.warn('Waveform image element not found.');
            return;
        }
        waveformImageElement.src = `/api/frame/waveform/${sessionId}?timestamp=${new Date().getTime()}`;
    }
    
    /**
     * Get current processing performance metrics
     */
    async getPerformanceMetrics() {
        try {
            const response = await fetch('/api/frame/performance');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to get performance metrics:', error);
            return null;
        }
    }
}

// Initialize frame processing manager
const frameProcessingManager = new FrameProcessingManager();

// Export for use in other scripts
window.frameProcessingManager = frameProcessingManager;

// Utility functions for integration with existing code
window.frameProcessing = {
    isAvailable: () => frameProcessingManager.isFrameProcessingAvailable,
    initializeSession: (audioFile, presetFile, outputDir) => 
        frameProcessingManager.initializeSession(audioFile, presetFile, outputDir),
    updateParameters: (params) => frameProcessingManager.handleParameterChange(params),
    processAudio: () => frameProcessingManager.processWithFrames(),
    cleanup: () => frameProcessingManager.cleanupSession()
};