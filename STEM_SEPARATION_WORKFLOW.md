# STEM SEPARATION WORKFLOW - INTENDED FUNCTIONALITY

## 🎯 INTENDED WORKFLOW FOR STEM SEPARATION

### 📋 Processing Steps:
1. **Separate Reference** → Create vocal + instrumental stems
2. **Create Presets** → Make presets from both separated stems  
3. **Separate Target** → Create vocal + instrumental stems from target
4. **Process Stems** → Apply presets to matching target stems
5. **Real-time Mixing** → User controls blend ratios for playback/saving

### 🎛️ Expected UI Controls:
- **Vocal Blend Knob**: Controls mix between original vocal stem vs processed vocal stem (0-100%)
- **Instrumental Blend Knob**: Controls mix between original instrumental stem vs processed instrumental stem (0-100%)
- **Master Volume/Mix**: Optional control for vocal vs instrumental balance

### 📊 Expected Waveform Display:
- **Top Row**: Vocal Original | Vocal Processed
- **Bottom Row**: Instrumental Original | Instrumental Processed
- Each waveform should show its specific stem content (different waveforms)

### 🔊 Expected Playback:
- **Real-time mixing** of: `(vocal_original * (1-vocal_blend) + vocal_processed * vocal_blend) + (instrumental_original * (1-instrumental_blend) + instrumental_processed * instrumental_blend)`
- **Blend controls** should update the mix in real-time

### 💾 Expected Save:
- **Save current blend** at the current vocal/instrumental blend ratios
- **Generate filename** like: `{target_name}-stems-{reference_name}-v{vocal_blend}-i{instrumental_blend}.wav`

---

## 🐛 CURRENT ISSUES TO FIX:

1. **❌ Waveform Display**: Showing concatenated or wrong waveforms
2. **❌ Missing Vocal Blend Control**: Only one knob instead of two
3. **❌ Blend Controls Not Working**: No real-time mixing effect
4. **❌ Save Error**: Looking for wrong file paths
5. **❌ Playback Issues**: All waveforms showing same content during playback

---

## 🔍 ROOT CAUSE:
The current implementation is trying to use the old single-blend workflow for stem separation, but stem separation needs **dual-blend controls** (vocal + instrumental) and **real-time stem mixing**.

---

## 🛠️ IMPLEMENTATION PLAN:

### Backend Changes Needed:
- [ ] Fix stem file preservation (currently being cleaned up)
- [ ] Update progress response to include all 4 stem file paths
- [ ] Create new endpoint for dual-stem blending and saving

### Frontend Changes Needed:
- [ ] Add second blend knob for instrumental control
- [ ] Fix waveform display to show individual stems correctly
- [ ] Implement dual-stem real-time mixing
- [ ] Update save functionality for dual-blend ratios
- [ ] Fix playback to use properly mixed audio

### UI/UX Changes Needed:
- [ ] Design layout for dual blend controls
- [ ] Add labels for vocal vs instrumental controls
- [ ] Update save button text/functionality
- [ ] Add visual feedback for blend ratios

---

## 📝 NOTES:
- Standard (non-stem) processing works correctly
- Stem separation backend processing completes successfully
- Main issues are in frontend mixing and UI controls
- Need to implement proper dual-blend architecture