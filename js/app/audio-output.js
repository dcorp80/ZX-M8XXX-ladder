/**
 * AudioManager - Handles Web Audio output for AY chip using AudioWorklet.
 * Extracted from spectrum.js Phase 6: all Web Audio API usage is now host-side.
 */

export class AudioManager {
    constructor(ay, timing) {
        this.ay = ay;
        this.timing = timing;
        this.context = null;
        this.gainNode = null;
        this.workletNode = null;
        this.enabled = false;
        this.volume = 0.5;
        this.muted = false;

        // Buffer for batching samples to send to worklet
        this.sendBufferSize = 512;
        this.sendBufferL = new Float32Array(this.sendBufferSize);
        this.sendBufferR = new Float32Array(this.sendBufferSize);
        this.sendBufferPos = 0;

        // Timing
        this.sampleRate = 44100;
        this.cpuClock = timing.cpuClock || 3500000;
        this.ayClock = ay.clockRate;

        // Samples per frame at 50Hz
        this.samplesPerFrame = Math.floor(this.sampleRate / 50);

        // CPU cycles per audio sample
        this.cyclesPerSample = this.cpuClock / this.sampleRate;

        // AY cycles per CPU cycle (AY runs at ~half CPU speed)
        this.ayPerCpu = this.ayClock / this.cpuClock;
    }

    /**
     * Start audio output using AudioWorklet (or ScriptProcessorNode fallback)
     */
    async start() {
        if (this.context) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });

            // Update sample rate if browser chose different
            this.sampleRate = this.context.sampleRate;
            this.samplesPerFrame = Math.floor(this.sampleRate / 50);
            this.cyclesPerSample = this.cpuClock / this.sampleRate;

            // Create gain node for volume control
            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = this.muted ? 0 : this.volume;
            this.gainNode.connect(this.context.destination);

            if (this.context.audioWorklet) {
                // Modern path: AudioWorklet (requires secure context)
                const workletUrl = new URL('../core/audio-processor.js', import.meta.url);
                await this.context.audioWorklet.addModule(workletUrl);
                this.workletNode = new AudioWorkletNode(this.context, 'zx-audio-processor', {
                    numberOfInputs: 0,
                    numberOfOutputs: 1,
                    outputChannelCount: [2]
                });
                this.workletNode.connect(this.gainNode);
            } else {
                // Fallback: ScriptProcessorNode (works over plain HTTP)
                this._initScriptProcessor();
            }

            // Resume context (may be suspended due to autoplay policy)
            if (this.context.state === 'suspended') {
                await this.context.resume();
            }

            this.enabled = true;
        } catch (e) {
            console.error('Failed to initialize audio:', e);
            this.enabled = false;
        }
    }

    /**
     * Initialize ScriptProcessorNode fallback for non-secure contexts
     */
    _initScriptProcessor() {
        const bufferSize = 8192;
        const ringL = new Float32Array(bufferSize);
        const ringR = new Float32Array(bufferSize);
        let writePos = 0;
        let readPos = 0;

        this.scriptNode = this.context.createScriptProcessor(2048, 0, 2);
        this.scriptNode.onaudioprocess = (e) => {
            const outL = e.outputBuffer.getChannelData(0);
            const outR = e.outputBuffer.getChannelData(1);
            for (let i = 0; i < outL.length; i++) {
                if (readPos !== writePos) {
                    outL[i] = ringL[readPos];
                    outR[i] = ringR[readPos];
                    readPos = (readPos + 1) % bufferSize;
                } else {
                    outL[i] = 0;
                    outR[i] = 0;
                }
            }
        };
        this.scriptNode.connect(this.gainNode);

        // Expose write function for flushSamples
        this._scriptRing = { ringL, ringR, bufferSize };
        this._scriptWritePos = () => writePos;
        this._scriptWrite = (left, right) => {
            for (let i = 0; i < left.length; i++) {
                ringL[writePos] = left[i];
                ringR[writePos] = right[i];
                writePos = (writePos + 1) % bufferSize;
            }
        };
    }

    /**
     * Stop audio output
     */
    stop() {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        if (this.scriptNode) {
            this.scriptNode.disconnect();
            this.scriptNode = null;
            this._scriptWrite = null;
            this._scriptRing = null;
            this._scriptWritePos = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        if (this.context) {
            this.context.close();
            this.context = null;
        }
        this.enabled = false;
    }

    /**
     * Set volume (0-1)
     */
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.gainNode && !this.muted) {
            this.gainNode.gain.value = this.volume;
        }
    }

    /**
     * Set mute state
     */
    setMuted(muted) {
        this.muted = muted;
        if (this.gainNode) {
            this.gainNode.gain.value = muted ? 0 : this.volume;
        }
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }

    /**
     * Send buffered samples to audio output
     */
    flushSamples() {
        if (this.sendBufferPos === 0) return;

        if (this.workletNode) {
            this.workletNode.port.postMessage({
                left: this.sendBufferL.slice(0, this.sendBufferPos),
                right: this.sendBufferR.slice(0, this.sendBufferPos)
            });
        } else if (this._scriptWrite) {
            this._scriptWrite(
                this.sendBufferL.slice(0, this.sendBufferPos),
                this.sendBufferR.slice(0, this.sendBufferPos)
            );
        } else {
            this.sendBufferPos = 0;
            return;
        }
        this.sendBufferPos = 0;
    }

    /**
     * Process one frame of audio
     * Called at end of each emulated frame
     * @param {number} frameTstates - T-states in this frame
     * @param {Array} beeperChanges - Array of {tStates, level} beeper state changes
     * @param {number} beeperLevel - Final beeper level at end of frame
     * @param {Array} tapeAudioChanges - Array of {tStates, level} tape signal changes
     */
    processFrame(frameTstates, beeperChanges = [], beeperLevel = 0, tapeAudioChanges = []) {
        if (!this.enabled || (!this.workletNode && !this.scriptNode)) return;

        // Generate samples for this frame
        const samplesToGenerate = this.samplesPerFrame;

        // CPU cycles per sample for this frame
        const cyclesPerSample = frameTstates / samplesToGenerate;

        // AY steps per sample
        const ayStepsPerSample = this.ay ? cyclesPerSample * this.ayPerCpu : 0;

        // Audio levels
        const BEEPER_VOLUME = 0.5;
        const TAPE_VOLUME = 0.5;

        const hasBeeperActivity = beeperChanges.length > 0;
        const hasTapeAudio = tapeAudioChanges.length > 0;

        // Track beeper state for this frame
        let beeperIdx = 0;
        let currentBeeperLevel = beeperLevel;
        if (hasBeeperActivity && beeperChanges[0].tStates === 0) {
            currentBeeperLevel = beeperChanges[0].level;
        }

        // Track tape audio state for this frame
        let tapeIdx = 0;
        let currentTapeLevel = 0;
        if (hasTapeAudio && tapeAudioChanges[0].tStates === 0) {
            currentTapeLevel = tapeAudioChanges[0].level;
        }

        for (let i = 0; i < samplesToGenerate; i++) {
            const sampleTstates = (i + 0.5) * cyclesPerSample;

            while (beeperIdx < beeperChanges.length &&
                   beeperChanges[beeperIdx].tStates <= sampleTstates) {
                currentBeeperLevel = beeperChanges[beeperIdx].level;
                beeperIdx++;
            }

            while (tapeIdx < tapeAudioChanges.length &&
                   tapeAudioChanges[tapeIdx].tStates <= sampleTstates) {
                currentTapeLevel = tapeAudioChanges[tapeIdx].level;
                tapeIdx++;
            }

            let left = 0, right = 0;
            if (this.ay) {
                this.ay.stepMultiple(Math.round(ayStepsPerSample));
                [left, right] = this.ay.getAveragedSample();
            }

            if (hasBeeperActivity) {
                const beeperSample = (currentBeeperLevel * 2 - 1) * BEEPER_VOLUME;
                left += beeperSample;
                right += beeperSample;
            }

            if (hasTapeAudio) {
                const tapeSample = (currentTapeLevel * 2 - 1) * TAPE_VOLUME;
                left += tapeSample;
                right += tapeSample;
            }

            left = Math.max(-1, Math.min(1, left));
            right = Math.max(-1, Math.min(1, right));

            this.sendBufferL[this.sendBufferPos] = left;
            this.sendBufferR[this.sendBufferPos] = right;
            this.sendBufferPos++;

            if (this.sendBufferPos >= this.sendBufferSize) {
                this.flushSamples();
            }
        }

        this.flushSamples();
    }

    /**
     * Resume audio context (call from user interaction)
     */
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }
}
