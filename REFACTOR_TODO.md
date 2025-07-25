# JavaScript Refactoring TODO

This document tracks the refactoring of `app/static/script.js` into smaller, more manageable modules.

## Functions Moved:

- [x] `showStatus` -> `utils.js`
- [x] `initializeKnob` -> `knob_controls.js`
- [x] `updateTextInput` -> `knob_controls.js`
- [x] `initializeMasterGainKnob` -> `knob_controls.js`
- [x] `initializeDualKnobs` -> `knob_controls.js`
- [x] `updateDualKnobTextInputs` -> `knob_controls.js`
- [x] `startDragVocal` -> `knob_controls.js`
- [x] `startDragInstrumental` -> `knob_controls.js`
- [x] `startDragVocalTouch` -> `knob_controls.js`
- [x] `startDragInstrumentalTouch` -> `knob_controls.js`
- [x] `handleDualKnobMove` -> `knob_controls.js`
- [x] `handleDualKnobMoveTouch` -> `knob_controls.js`
- [x] `stopDualKnobDrag` -> `knob_controls.js`
- [x] `startDragVocalGain` -> `knob_controls.js`
- [x] `startDragVocalGainTouch` -> `knob_controls.js`
- [x] `startDragInstrumentalGain` -> `knob_controls.js`
- [x] `startDragInstrumentalGainTouch` -> `knob_controls.js`
- [x] `startDragMasterGain` -> `knob_controls.js`
- [x] `startDragMasterGainTouch` -> `knob_controls.js`
- [x] `dragMasterGain` -> `knob_controls.js`
- [x] `dragMasterGainTouch` -> `knob_controls.js`
- [x] `endDragMasterGain` -> `knob_controls.js`
- [x] `drawDualKnobs` -> `knob_controls.js`
- [x] `drawKnobOnCanvas` -> `knob_controls.js`
- [x] `drawGainKnobOnCanvas` -> `knob_controls.js`
- [x] `updateBlend` -> `knob_controls.js`
- [x] `isCurrentlyStemMode` -> `utils.js`
- [x] `generateBlendPreview` -> `processing_logic.js`
- [x] `generateStemBlendPreview` -> `processing_logic.js`
- [x] `startDrag` -> `knob_controls.js`
- [x] `startDragTouch` -> `knob_controls.js`
- [x] `drag` -> `knob_controls.js`
- [x] `dragTouch` -> `knob_controls.js`
- [x] `endDrag` -> `knob_controls.js`
- [x] `drawKnob` -> `knob_controls.js`
- [x] `playAudio` -> `audio_playback.js`
- [x] `pauseAudio` -> `audio_playback.js`
- [x] `stopAudio` -> `audio_playback.js`
- [x] `updatePlaybackButtons` -> `audio_playback.js`
- [x] `drawPlayPosition` -> `audio_playback.js`
- [x] `seekAudio` -> `audio_playback.js`
- [x] `updatePlayPosition` -> `audio_playback.js`
- [x] `updatePreviewAudio` -> `audio_playback.js`
- [x] `updatePlaybackControls` -> `audio_playback.js`
- [x] `setProcessingState` -> `processing_logic.js`
- [x] `checkProcessButtonVisibility` -> `processing_logic.js`
- [x] `showProcessingStatus` -> `processing_logic.js`
- [x] `pollProgress` -> `processing_logic.js`
- [x] `hideProcessingStatus` -> `processing_logic.js`
- [x] `resetAllState` -> `processing_logic.js`
- [x] `initializeJITProcessing` -> `processing_logic.js`
- [x] `initializeStemJITProcessing` -> `processing_logic.js`
- [x] `showJITStatus` -> `processing_logic.js`
- [x] `updatePreview` -> `processing_logic.js`
- [x] `updateAudioPreview` -> `processing_logic.js`
- [x] `setupPreviewAudioContext` -> `processing_logic.js`
- [x] `showPresetDownloadLinks` -> `preset_management.js`
- [x] `toggleLimiter` -> `utils.js`
- [x] `updateFileStatus` -> `batch_processing.js`
- [x] `createFileList` -> `batch_processing.js`
- [x] `pollBatchProgress` -> `batch_processing.js`
- [x] `toggleReferenceInput` -> `processing_logic.js`
- [x] `toggleBatchReferenceInput` -> `batch_processing.js`
- [x] `handleBatchTargetFilesChange` -> `batch_processing.js`
- [x] `handleProcessSingleFormSubmit` -> `processing_logic.js`
- [x] `handleProcessBatchFormSubmit` -> `batch_processing.js`
- [x] `handleCreatePresetFormSubmit` -> `preset_management.js`
- [x] `handleStemSeparationFormSubmit` -> `stem_separation.js`

## Remaining in `main.js`:

- [x] `DOMContentLoaded` event listener (main entry point)
- [x] Initial module calls (e.g., `window.initializeKnob()`, `window.updatePlaybackButtons('stop')`)
- [x] Top-level event listener attachments (e.g., `processSingleForm.addEventListener`)

## Target 1: Server-Side Waveform Image Generation - Remaining Steps:

- [x] Adapt `drawPlayPosition` in `audio_playback.js` to draw playhead on a canvas overlay.
- [x] Adapt `seekAudio` in `audio_playback.js` to interact with the canvas overlay.
- [x] Add canvas overlay to `index.html` for waveform playhead.

## Target 2: Implement Audio Streaming - Remaining Steps:

- [x] Build an Audio Streaming Endpoint in `app/api/frame_endpoints.py`.
- [x] Simplify Frontend Playback in `audio_playback.js`.

## Target 3: Adapt for Stem Mode - Remaining Steps:

- [x] Extend Server-Side Logic (waveform and streaming endpoints).
- [x] Update Stem UI.
- [x] Fix: Ensure follow-up steps appear after file selection in non-stem mode.

All planned refactoring and feature implementations are now complete.
