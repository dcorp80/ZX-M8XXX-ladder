/**
 * Run Loop - Host-side frame scheduling for the emulator.
 * Handles rAF/setTimeout scheduling, FPS tracking, and speed control.
 * Extracted from spectrum.js Phase 5: removes browser timing APIs from the kernel.
 */

export function initRunLoop(spectrum) {
    let rafId = null;
    let frameInterval = null;
    let lastFrameTime = 0;
    let lastRafTime = null;
    let actualFps = 0;

    function startScheduling() {
        lastFrameTime = performance.now();
        lastRafTime = null;
        scheduleNextFrame();
    }

    function stopScheduling() {
        if (frameInterval) {
            clearTimeout(frameInterval);
            frameInterval = null;
        }
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function restartScheduling() {
        stopScheduling();
        lastRafTime = null;
        if (spectrum.running) {
            scheduleNextFrame();
        }
    }

    function scheduleNextFrame() {
        if (!spectrum.running) return;

        const speed = spectrum.speed;

        if (speed === 0) {
            // Max speed - use requestAnimationFrame, run multiple frames
            rafId = requestAnimationFrame(() => {
                try {
                    const startTime = performance.now();
                    // Run frames for up to 16ms (one display frame)
                    while (performance.now() - startTime < 16 && spectrum.running) {
                        spectrum.runFrame();
                    }
                    updateFps();
                    scheduleNextFrame();
                } catch (e) {
                    console.error('Error in runFrame:', e);
                    spectrum.running = false;
                    if (spectrum.onError) spectrum.onError(e);
                }
            });
        } else if (speed >= 100) {
            // Normal or fast - use requestAnimationFrame with time tracking
            // Real Spectrum: 50.08 FPS (69888 T-states at 3.5MHz)
            const targetFrameTime = 1000 / 50.08 * (100 / speed);

            rafId = requestAnimationFrame((timestamp) => {
                try {
                    if (!lastRafTime) lastRafTime = timestamp;

                    // Calculate how many frames we should have run
                    const elapsed = timestamp - lastRafTime;
                    const framesToRun = Math.floor(elapsed / targetFrameTime);

                    if (framesToRun > 0) {
                        // Run the appropriate number of frames (cap at 4 to prevent spiral)
                        const actualFrames = Math.min(framesToRun, 4);
                        for (let i = 0; i < actualFrames && spectrum.running; i++) {
                            spectrum.runFrame();
                        }
                        lastRafTime = timestamp - (elapsed % targetFrameTime);
                    }

                    updateFps();
                    scheduleNextFrame();
                } catch (e) {
                    console.error('Error in runFrame:', e);
                    spectrum.running = false;
                    if (spectrum.onError) spectrum.onError(e);
                }
            });
        } else {
            // Slow - increase interval
            const interval = Math.round(20 * (100 / speed));
            frameInterval = setTimeout(() => {
                try {
                    spectrum.runFrame();
                    updateFps();
                    scheduleNextFrame();
                } catch (e) {
                    console.error('Error in runFrame:', e);
                    spectrum.running = false;
                    if (spectrum.onError) spectrum.onError(e);
                }
            }, interval);
        }
    }

    function updateFps() {
        const now = performance.now();
        if (now - lastFrameTime >= 1000) {
            actualFps = Math.round(spectrum.frameCount * 1000 / (now - lastFrameTime));
            spectrum.frameCount = 0;
            lastFrameTime = now;
        }
    }

    function getFps() {
        return actualFps;
    }

    return { startScheduling, stopScheduling, restartScheduling, getFps };
}
