// Get the existing canvas and initialize context
const canvas = document.getElementById('preview-canvas');
if (!canvas) {
    throw new Error('Preview canvas not found');
}
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Initialize controls
const speedInfo = document.getElementById('speed-info');
const zoomControl = document.getElementById('zoom');
const cropX = document.getElementById('crop-x');
const cropY = document.getElementById('crop-y');
let currentZoom = 1;
let animationLoop = null;
let backgroundElement = null;
let videoStartTime = 0;
let videoDuration = 0;
let isSquirtMode = false;

// GIF URLs
const DEFAULT_GIF_URL = 'https://res.cloudinary.com/dakoxedxt/image/upload/v1735254712/ezgif.com-animated-gif-maker_ks3mtk.gif';

// Add piggyGif to globals
let piggyGif = null;

// Configuration
const CONFIG = {
    CANVAS: {
        WIDTH: 512,
        HEIGHT: 512
    },
    EXPORT: {
        MAX_SIZE: 256 * 1024, // 256KB (Telegram limit)
        QUALITY_SETTINGS: {
            high: 2000000,    // 2Mbps
            normal: 1000000,  // 1Mbps
            low: 500000      // 500Kbps
        }
    },
    BITRATES: {
        AUTO: 'auto',
        TELEGRAM: 'telegram',
        CUSTOM: 'custom'
    }
};

// Constants for the piggy animation
const FRAMES_IN_SEQUENCE = 11;
const SPEEDS = {
    normal: 18,      // ≈ 200ms total cycle (18ms × 11 frames = 198ms)
    squirtaholic: 11,  // ≈ 125ms total cycle (11ms × 11 frames = 121ms)
    smooth: 30       // ≈ 335ms total cycle (30ms × 11 frames = 330ms)
};
const MAX_LOOPS = {
    normal: 15,      // Adjusted for 11 frames
    squirtaholic: 24,  // Adjusted for faster speed
    smooth: 9        // Adjusted for slower speed
};
let FRAME_DURATION = SPEEDS.normal;
let currentMaxLoops = MAX_LOOPS.normal;
let startTime = 0;

// Mirror states
let mirrorX = false;
let mirrorY = false;

// Add these variables at the top with other globals
let particles = [];
const PARTICLE_COUNT = 10;  // Reduced slightly for better performance
const PARTICLE_LIFETIME = 1500;  // Longer lifetime
let particleSystemActive = false;

// Add these near the top with other globals
let pixiApp = null;
let emitter = null;

// Add this to your globals
let backgroundSprite = null;

// Add these to your globals
let backgroundContainer = null;
let particleContainer = null;
let piggyContainer = null;
let piggySprite = null;

// Add these to your global variables
let zoomAnimationIntensity = 0;
let animationStartTime = 0;

// Initialize PixiJS
function initializePixiParticles() {
    return new Promise((resolve, reject) => {
        try {
            if (typeof PIXI === 'undefined') {
                throw new Error('PIXI.js is not loaded');
            }

            const container = document.querySelector('.preview-container');
            if (!container) {
                throw new Error('Preview container not found');
            }

            // Create PIXI Application
            pixiApp = new PIXI.Application({
                width: CONFIG.CANVAS.WIDTH,
                height: CONFIG.CANVAS.HEIGHT,
                transparent: true,
                antialias: true,
                backgroundAlpha: 0
            });

            // Style and add the view
            pixiApp.view.style.position = 'absolute';
            pixiApp.view.style.top = '0';
            pixiApp.view.style.left = '0';
            pixiApp.view.style.width = '100%';
            pixiApp.view.style.height = '100%';
            pixiApp.view.style.pointerEvents = 'none';
            container.appendChild(pixiApp.view);

            // Create containers with proper layering
            const backgroundContainer = new PIXI.Container();
            const particleContainer = new PIXI.Container();
            const piggyContainer = new PIXI.Container();

            // Add containers in order (back to front)
            pixiApp.stage.addChild(backgroundContainer);
            pixiApp.stage.addChild(particleContainer);
            pixiApp.stage.addChild(piggyContainer);

            // Create particle emitter
            const particleTexture = createWaterDropTexture();
            emitter = new ParticleEmitter(particleContainer, particleTexture);

            // Set up render loop
            pixiApp.ticker.add(() => {
                if (emitter) {
                    emitter.update();
                }
                // Update other animations here
            });

            resolve({
                backgroundContainer,
                particleContainer,
                piggyContainer
            });
        } catch (error) {
            console.error('PIXI initialization error:', error);
            reject(error);
        }
    });
}

// Particle Emitter class
class ParticleEmitter {
    constructor(container, texture) {
        this.container = container;
        this.texture = texture;
        this.particles = [];
        this.active = false;
        this.maxParticles = 100;  // Back to higher count
        this.particlesPerFrame = 4;  // Emit more particles per frame
        this.particlePool = [];
        this.lastEmitTime = 0;
        this.emitInterval = 16; // Sync with typical frame rate (60fps)
    }

    createParticle() {
        let particle = this.particlePool.pop() || new PIXI.Sprite(this.texture);
        
        particle.anchor.set(0.5);
        particle.x = CONFIG.CANVAS.WIDTH * 0.32;
        particle.y = CONFIG.CANVAS.HEIGHT * 0.92;
        
        // Tighter angle control for shower effect
        const angle = -Math.PI/3 + (Math.random() * 0.1);
        const speed = 7 + Math.random(); // More consistent speed
        
        particle.velocity = {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed
        };
        
        particle.gravity = 0.3;
        particle.alpha = 0.85;
        particle.scale.set(0.35 + Math.random() * 0.1);
        
        this.container.addChild(particle);
        this.particles.push(particle);
    }

    update() {
        if (!this.active) return;

        const now = performance.now();
        
        // Emit particles at consistent intervals
        if (now - this.lastEmitTime >= this.emitInterval) {
            if (this.particles.length < this.maxParticles) {
                for (let i = 0; i < this.particlesPerFrame; i++) {
                    this.createParticle();
                }
            }
            this.lastEmitTime = now;
        }

        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.velocity.y += particle.gravity;
            particle.x += particle.velocity.x;
            particle.y += particle.velocity.y;
            particle.alpha *= 0.97; // Faster fade out for better flow

            if (particle.alpha < 0.05 || 
                particle.y > CONFIG.CANVAS.HEIGHT) {
                this.container.removeChild(particle);
                this.particles.splice(i, 1);
                this.particlePool.push(particle);
            }
        }
    }

    start() {
        this.active = true;
        this.lastEmitTime = performance.now();
        // Create initial burst
        for (let i = 0; i < 45; i++) {
            this.createParticle();
        }
    }

    stop() {
        this.active = false;
        this.particles.forEach(p => this.container.removeChild(p));
        this.particles = [];
    }
}

function updateDurationDisplay() {
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    const totalDuration = (FRAME_DURATION * totalFrames) / 1000;
    document.getElementById('duration-display').textContent = `${totalDuration.toFixed(2)}s`;

    // If we have a video background, adjust its duration but keep original speed
    if (backgroundSprite?.texture.baseTexture.resource?.source instanceof HTMLVideoElement) {
        const video = backgroundSprite.texture.baseTexture.resource.source;
        // Don't change playbackRate, just let it loop the specified number of times
        video.loop = true;
    }
}

function updateVideoControls() {
    const startFrameControl = document.querySelector('.start-frame-control');
    const startFrame = document.getElementById('start-frame');
    const startTimeDisplay = document.getElementById('start-time-display');
    
    if (backgroundElement instanceof HTMLVideoElement) {
        startFrameControl.style.display = 'block';
        videoDuration = backgroundElement.duration;
        
        let timeoutId;
        startFrame.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                videoStartTime = (e.target.value / 100) * videoDuration;
                startTimeDisplay.textContent = `${videoStartTime.toFixed(2)}s`;
                
                if (!animationLoop) {
                    backgroundElement.currentTime = videoStartTime;
                }
            }, 16);
        });
    } else {
        startFrameControl.style.display = 'none';
    }
}

function setSpeed(speed) {
    FRAME_DURATION = SPEEDS[speed];
    speedInfo.textContent = `${speed}`;
    
    currentMaxLoops = MAX_LOOPS[speed];
    const loopInput = document.getElementById('loop-count');
    loopInput.max = currentMaxLoops;
    if (parseInt(loopInput.value) > currentMaxLoops) {
        loopInput.value = currentMaxLoops;
    }
    
    // Update sprite animation speed
    if (piggySprite) {
        piggySprite.animationSpeed = 1000 / (FRAME_DURATION * 60);
    }
    
    updateDurationDisplay();
    startTime = 0;
    animationStartTime = 0; // Reset animation timing when changing speed
}

async function handleBackgroundUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.innerHTML = '<h3>Loading background...</h3>';
    document.body.appendChild(loadingDiv);
    
    try {
        const url = URL.createObjectURL(file);
        
        if (file.type.startsWith('video/')) {
            await loadVideoBackground(url);
        } else if (file.type.startsWith('image/')) {
            await loadImageBackground(url);
        }
    } catch (error) {
        console.error('Background upload failed:', error);
        alert('Failed to load background. Please try a different file.');
    } finally {
        loadingDiv.remove();
    }
}

function setupBackgroundSprite(sprite) {
    sprite.anchor.set(0.5);
    sprite.x = CONFIG.CANVAS.WIDTH / 2;
    sprite.y = CONFIG.CANVAS.HEIGHT / 2;
    
    const scaleX = CONFIG.CANVAS.WIDTH / sprite.texture.width;
    const scaleY = CONFIG.CANVAS.HEIGHT / sprite.texture.height;
    const scale = Math.max(scaleX, scaleY);
    
    sprite.scale.set(scale);
    
    // If it's a video sprite, ensure it updates
    if (sprite.texture.baseTexture.resource?.source instanceof HTMLVideoElement) {
        const video = sprite.texture.baseTexture.resource.source;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('playsinline', '');
        
        // Try to play immediately and on user interaction
        video.play().catch(() => {
            const playHandler = () => {
                video.play().catch(console.error);
                document.removeEventListener('touchstart', playHandler);
                document.removeEventListener('click', playHandler);
            };
            document.addEventListener('touchstart', playHandler, { once: true });
            document.addEventListener('click', playHandler, { once: true });
        });
    }
}

// Initialize the GIF
function initializeGif(gifUrl) {
    return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        img.crossOrigin = "anonymous";
        img.style.display = 'none';
        img.src = gifUrl;
        img.setAttribute('rel:animated_src', gifUrl);
        document.getElementById('gif-container').appendChild(img);
        
        const gif = new SuperGif({ 
            gif: img,
            auto_play: true,
            rubbable: false,
            max_width: CONFIG.CANVAS.WIDTH,
            on_created: function(canvas) {
                canvas.getContext('2d', { willReadFrequently: true });
            }
        });

        gif.load(() => {
            resolve(gif);
        });
    });
}

function initializeBackgroundVideo() {
    const video = document.querySelector('.video-background video');
    if (video) {
        // Force play on iOS
        video.play().catch(function(error) {
            console.log("Video play failed:", error);
            
            // Add click-to-play fallback if needed
            document.body.addEventListener('touchstart', function() {
                video.play().catch(function(error) {
                    console.log("Video play failed after touch:", error);
                });
            }, { once: true });
        });

        // Ensure video stays muted (iOS requirement)
        video.muted = true;
        
        // Add these attributes programmatically as well
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
    }
}

async function initialize() {
    try {
        // Add this near the start of initialize
        initializeBackgroundVideo();
        
        // Wait for DOM content to be fully loaded
        await new Promise(resolve => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });

        // Initialize GIF first
        try {
            piggyGif = await initializeGif(DEFAULT_GIF_URL);
        } catch (gifError) {
            console.error('Failed to load GIF:', gifError);
            throw new Error('Failed to load Piggy animation');
        }

        // Initialize PIXI and get containers
        const containers = await initializePixiParticles();
        backgroundContainer = containers.backgroundContainer;
        particleContainer = containers.particleContainer;
        piggyContainer = containers.piggyContainer;
        
        // Load Piggy frames and create sprite
        const piggyFrames = await loadPiggySprites();
        piggySprite = await createPiggySprite(piggyFrames, piggyContainer);
        
        // Set up animation
        pixiApp.ticker.add(() => {
            const now = performance.now();
            if (!startTime) startTime = now;

            const elapsed = now - startTime;
            const loopCount = parseInt(document.getElementById('loop-count').value);
            const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount);
            
            if (elapsed >= totalDuration) {
                startTime = now;
                if (piggySprite) {
                    piggySprite.gotoAndPlay(0);
                }
                
                // Reset video to start when animation loops
                if (backgroundSprite?.texture.baseTexture.resource?.source instanceof HTMLVideoElement) {
                    const video = backgroundSprite.texture.baseTexture.resource.source;
                    video.currentTime = videoStartTime;
                }
            }

            // Update background if it's a video
            if (backgroundSprite?.texture.baseTexture.resource?.source instanceof HTMLVideoElement) {
                backgroundSprite.texture.update();
            }
        });

        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize:', error);
        alert('Failed to initialize. Please refresh the page.');
    }
}

function setupEventListeners() {
    zoomControl.addEventListener('input', updateTransform);
    cropX.addEventListener('input', updateTransform);
    cropY.addEventListener('input', updateTransform);
    
    document.getElementById('loop-count').addEventListener('input', function(e) {
        document.getElementById('loop-count-display').textContent = e.target.value;
        updateDurationDisplay();
        // Update slider progress
        const progress = (e.target.value - e.target.min) / (e.target.max - e.target.min) * 100;
        e.target.style.setProperty('--slider-progress', `${progress}%`);
    });
    
    // Add bitrate slider listener
    document.getElementById('custom-bitrate-value')?.addEventListener('input', function(e) {
        const valueMbps = (e.target.value / 1000000).toFixed(1);
        document.getElementById('bitrate-value-display').textContent = `${valueMbps} Mbps`;
        updateQualityControls();
        // Update slider progress
        const progress = (e.target.value - e.target.min) / (e.target.max - e.target.min) * 100;
        e.target.style.setProperty('--slider-progress', `${progress}%`);
    });
    
    // Add background upload listener
    document.getElementById('background-upload').addEventListener('change', handleBackgroundUpload);

    // Remove the onclick from HTML and add listeners here
    const mirrorXBtn = document.querySelector('.mirror-x-btn');
    const mirrorYBtn = document.querySelector('.mirror-y-btn');
    
    if (mirrorXBtn) {
        console.log('Found mirror X button');
        mirrorXBtn.addEventListener('click', () => {
            console.log('Mirror X button clicked');
            toggleMirrorX();
        });
    } else {
        console.error('Mirror X button not found');
    }
    
    if (mirrorYBtn) {
        console.log('Found mirror Y button');
        mirrorYBtn.addEventListener('click', () => {
            console.log('Mirror Y button clicked');
            toggleMirrorY();
        });
    } else {
        console.error('Mirror Y button not found');
    }

    document.getElementById('zoom-animation').addEventListener('input', (e) => {
        zoomAnimationIntensity = parseInt(e.target.value);
        document.getElementById('zoom-animation-value').textContent = 
            `Zoom Animation: ${zoomAnimationIntensity}%`;
        
        // Start animation loop if intensity > 0
        if (zoomAnimationIntensity > 0) {
            requestAnimationFrame(() => updateTransform());
        }
    });
}

async function toggleSquirt() {
    const btn = document.querySelector('.squirt-toggle-btn');
    btn.disabled = true;
    
    try {
        isSquirtMode = !isSquirtMode;
        const squirtStatus = document.querySelector('.squirt-status');
        squirtStatus.textContent = isSquirtMode ? '🌊 Off' : '🌊 Squirt';
        
        // Toggle particle emitter
        if (emitter) {
            if (isSquirtMode) {
                emitter.start();
            } else {
                emitter.stop();
            }
        }
        
        btn.classList.toggle('active', isSquirtMode);
        animationStartTime = 0;
    } catch (error) {
        console.error('Failed to toggle squirt mode:', error);
        isSquirtMode = !isSquirtMode;
    } finally {
        btn.disabled = false;
    }
}

function updatePreview() {
    if (!animationLoop && piggyGif) {
        startAnimation();
    }
}

function updateTransformDisplay() {
    document.getElementById('zoom-value').textContent = `Zoom: ${zoomControl.value}%`;
    document.getElementById('crop-x-value').textContent = `Move X: ${cropX.value}`;
    document.getElementById('crop-y-value').textContent = `Move Y: ${cropY.value}`;
}

function updateTransform() {
    const baseZoom = parseFloat(zoomControl.value) / 100;
    const xOffset = parseInt(cropX.value);
    const yOffset = parseInt(cropY.value);
    
    if (backgroundSprite) {
        let currentZoom = baseZoom;
        
        // Calculate zoom animation if intensity > 0
        if (zoomAnimationIntensity > 0) {
            const loopCount = parseInt(document.getElementById('loop-count').value);
            const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
            const totalDuration = FRAME_DURATION * totalFrames;
            
            const now = performance.now();
            if (!startTime) startTime = now;
            
            const elapsed = (now - startTime) % totalDuration;
            const progress = elapsed / totalDuration;
            
            const bounce = Math.sin(progress * Math.PI * 2);
            const zoomVariation = 0.15 * (zoomAnimationIntensity / 100);
            currentZoom = baseZoom * (1 + bounce * zoomVariation);
            
            requestAnimationFrame(() => updateTransform());
        }

        // Calculate scale while maintaining aspect ratio
        const scaleX = (CONFIG.CANVAS.WIDTH / backgroundSprite.texture.width) * currentZoom;
        const scaleY = (CONFIG.CANVAS.HEIGHT / backgroundSprite.texture.height) * currentZoom;
        const scale = Math.max(scaleX, scaleY);
        
        // Apply scale uniformly to maintain aspect ratio
        backgroundSprite.scale.set(
            scale * (mirrorX ? -1 : 1),
            scale * (mirrorY ? -1 : 1)
        );
        
        // Center the sprite and apply offset
        backgroundSprite.position.set(
            CONFIG.CANVAS.WIDTH / 2 + (xOffset / 50) * CONFIG.CANVAS.WIDTH,
            CONFIG.CANVAS.HEIGHT / 2 + (yOffset / 50) * CONFIG.CANVAS.HEIGHT
        );
    }
    
    updateTransformDisplay();
}

async function exportForSticker() {
    try {
        // Reset animation state
        startTime = 0;
        if (piggySprite) {
            piggySprite.gotoAndPlay(0);
        }

        const exportDiv = document.createElement('div');
        exportDiv.className = 'export-dialog';
        exportDiv.innerHTML = `
            <h3>Export Sticker</h3>
            <div class="quality-settings">
                <h4>Quality Settings</h4>
                <select id="quality-preset" onchange="updateQualityControls()">
                    <option value="${CONFIG.BITRATES.AUTO}">Auto (Telegram Safe)</option>
                    <option value="${CONFIG.BITRATES.TELEGRAM}">Telegram Optimized</option>
                    <option value="${CONFIG.BITRATES.CUSTOM}">Custom</option>
                </select>
                <div id="custom-bitrate" style="display: none;">
                    <label>Custom Bitrate (bps):
                        <input type="range" 
                               id="custom-bitrate-value" 
                               min="100000" 
                               max="4000000" 
                               step="100000" 
                               value="1500000"
                               class="styled-slider"
                               onchange="updateQualityControls()">
                        <span id="bitrate-value-display">1.5 Mbps</span>
                    </label>
                </div>
                <div class="bitrate-info">
                    <span id="bitrate-display"></span>
                </div>
            </div>
            <button onclick="exportAsVideo()">Export for Telegram</button>
            <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
        `;
        document.body.appendChild(exportDiv);
        
        setTimeout(() => updateQualityControls(), 0);
    } catch (error) {
        console.error('Export dialog creation failed:', error);
        alert('Failed to prepare export. Please try again.');
    }
}

function calculateOptimalBitrate(duration) {
    const MAX_SIZE_BYTES = CONFIG.EXPORT.MAX_SIZE;
    const TARGET_SIZE_BITS = MAX_SIZE_BYTES * 8;
    const COMPRESSION_COMPENSATION = 2.2; // Compensation factor for WebM compression
    
    // Calculate target bitrate to stay under size limit
    const targetBitrate = Math.floor((TARGET_SIZE_BITS / duration) * COMPRESSION_COMPENSATION);
    
    console.log('Duration:', duration, 
                'Target size (KB):', MAX_SIZE_BYTES / 1024, 
                'Compensated bitrate:', targetBitrate,
                'Estimated final size (KB):', 
                ((targetBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION).toFixed(1));
    
    return targetBitrate;
}

function updateQualityControls() {
    console.log('Updating quality controls...');
    const preset = document.getElementById('quality-preset').value;
    const customControls = document.getElementById('custom-bitrate');
    const bitrateDisplay = document.getElementById('bitrate-display');
    
    customControls.style.display = preset === CONFIG.BITRATES.CUSTOM ? 'block' : 'none';
    
    const duration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * 
        parseInt(document.getElementById('loop-count').value)) / 1000;
    
    const COMPRESSION_COMPENSATION = 2.2;
    let estimatedBitrate;
    switch(preset) {
        case CONFIG.BITRATES.AUTO:
            estimatedBitrate = calculateOptimalBitrate(duration);
            const autoSize = (estimatedBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
            bitrateDisplay.textContent = `Auto: ${(estimatedBitrate/1000).toFixed(0)}Kbps (≈${autoSize.toFixed(1)}KB)`;
            break;
        case CONFIG.BITRATES.TELEGRAM:
            estimatedBitrate = Math.max(2500000, Math.min(duration <= 1.5 ? 4000000 : 3000000, calculateOptimalBitrate(duration)));
            const telegramSize = (estimatedBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
            bitrateDisplay.textContent = `Telegram: ${(estimatedBitrate/1000).toFixed(0)}Kbps (≈${telegramSize.toFixed(1)}KB)`;
            break;
        case CONFIG.BITRATES.CUSTOM:
            estimatedBitrate = parseInt(document.getElementById('custom-bitrate-value').value);
            const customSize = (estimatedBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
            bitrateDisplay.textContent = `Custom: ${(estimatedBitrate/1000).toFixed(0)}Kbps (≈${customSize.toFixed(1)}KB)`;
            break;
    }
}

function getBitrateForExport() {
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    const duration = (FRAME_DURATION * totalFrames) / 1000;
    
    // Calculate optimal bitrate based on Telegram's size limit
    const optimalBitrate = calculateOptimalBitrate(duration);
    
    // Cap at 2Mbps for quality
    return Math.min(optimalBitrate, CONFIG.EXPORT.QUALITY_SETTINGS.high);
}

async function exportAsVideo() {
    try {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = '<h3>Generating sticker...</h3><p>Recording animation...</p>';
        document.body.appendChild(loadingDiv);

        const mediaStream = pixiApp.view.captureStream(30); // Using PIXI canvas instead
        
        const options = {
            mimeType: getSupportedMimeType(),
            videoBitsPerSecond: getBitrateForExport()
        };

        const recorder = new MediaRecorder(mediaStream, options);
        const chunks = [];
        
        recorder.ondataavailable = e => chunks.push(e.data);

        const recordingPromise = new Promise((resolve, reject) => {
            let recordingStartTime = Date.now();
            
            recorder.onstop = () => {
                loadingDiv.innerHTML = '<h3>Generating sticker...</h3><p>Processing video...</p>';
                const blob = new Blob(chunks, { type: options.mimeType });
                resolve(blob);
            };
            
            recorder.onerror = reject;

            const updateProgress = () => {
                if (recorder.state === 'recording') {
                    const elapsed = (Date.now() - recordingStartTime) / 1000;
                    const progress = Math.min(100, (elapsed / duration) * 100);
                    loadingDiv.innerHTML = `<h3>Generating sticker...</h3><p>Recording: ${progress.toFixed(0)}%</p>`;
                    if (elapsed < duration) {
                        requestAnimationFrame(updateProgress);
                    }
                }
            };
            updateProgress();
        });

        const loopCount = parseInt(document.getElementById('loop-count').value);
        const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
        const duration = (FRAME_DURATION * totalFrames) / 1000;

        startTime = 0;
        recorder.start();
        
        setTimeout(() => {
            if (recorder.state === 'recording') {
                recorder.stop();
            }
        }, duration * 1000 + 100);

        const blob = await recordingPromise;
        loadingDiv.remove();

        const url = URL.createObjectURL(blob);
        const fileSize = blob.size / 1024;

        const exportDiv = document.createElement('div');
        exportDiv.className = 'export-dialog';
        exportDiv.innerHTML = `
            <h3>Export Sticker</h3>
            ${fileSize > 256 ? 
                `<p class="size-warning">Warning: File size (${fileSize.toFixed(1)}KB) exceeds Telegram's limit!</p>` 
                : ''}
            <div class="format-group">
                <h4>WebM/VP9 (${fileSize.toFixed(1)}KB)</h4>
                <button onclick="downloadSticker('${url}', 'telegram', 'webm')">
                    Download for Telegram
                </button>
            </div>
            <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
        `;
        document.body.appendChild(exportDiv);

    } catch (error) {
        console.error('Export failed:', error);
        if (loadingDiv) loadingDiv.remove();
        alert(`Failed to export: ${error.message}\n\nSupported formats: ${MediaRecorder.isTypeSupported('video/mp4') ? 'MP4' : 'No MP4'}, ${MediaRecorder.isTypeSupported('video/webm') ? 'WebM' : 'No WebM'}`);
    }
}

function getSupportedMimeType() {
    const possibleTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm'
    ];

    for (const type of possibleTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            console.log('Using MIME type:', type);
            return type;
        }
    }

    throw new Error('No supported video format found');
}

function downloadSticker(url, platform, extension) {
    const stickerName = 'sticker';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stickerName}_${platform}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function createWaterDropTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 24;  // Increased texture size
    canvas.height = 24;
    const ctx = canvas.getContext('2d');

    // Enhanced gradient for better visibility
    const gradient = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)'); // Brighter center
    gradient.addColorStop(0.4, 'rgba(134, 209, 232, 0.8)'); // More opaque middle
    gradient.addColorStop(1, 'rgba(134, 209, 232, 0)');

    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(12, 12, 12, 0, Math.PI * 2);
    ctx.fill();

    return PIXI.Texture.from(canvas);
}

async function loadPiggySprites() {
    const frames = [];
    console.log("Starting to load frames...");
    
    // Pre-load all frames first
    for (let i = 0; i < FRAMES_IN_SEQUENCE; i++) {
        piggyGif.move_to(i);
        const canvas = piggyGif.get_canvas();
        const texture = PIXI.Texture.from(canvas.toDataURL());
        frames.push(texture);
        console.log(`Loaded frame ${i}`);
    }
    
    return frames;
}

async function createPiggySprite(frames, container) {
    console.log("Creating sprite with frames:", frames.length);
    const piggySprite = new PIXI.AnimatedSprite(frames);
    
    // Position and size
    piggySprite.width = CONFIG.CANVAS.WIDTH * 0.95;
    piggySprite.height = CONFIG.CANVAS.HEIGHT * 0.95;
    piggySprite.x = -CONFIG.CANVAS.WIDTH * 0.03;
    piggySprite.y = CONFIG.CANVAS.HEIGHT * 0.05;
    
    // Animation settings
    piggySprite.animationSpeed = 1000 / (FRAME_DURATION * 60);
    piggySprite.loop = true;
    
    container.addChild(piggySprite);
    piggySprite.play();
    console.log("Sprite created and playing");
    
    return piggySprite;
}

// Add these helper functions
async function loadVideoBackground(url) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = url;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('playsinline', '');
        
        video.onloadedmetadata = async () => {
            try {
                // Force play the video
                await video.play().catch(error => {
                    console.log("Initial play failed, trying after user interaction");
                    // Add touch/click handler for iOS
                    const playHandler = () => {
                        video.play().catch(console.error);
                        document.removeEventListener('touchstart', playHandler);
                        document.removeEventListener('click', playHandler);
                    };
                    document.addEventListener('touchstart', playHandler, { once: true });
                    document.addEventListener('click', playHandler, { once: true });
                });

                if (backgroundSprite) {
                    backgroundContainer.removeChild(backgroundSprite);
                }
                
                // Create PIXI video sprite
                const texture = PIXI.Texture.from(video);
                backgroundSprite = new PIXI.Sprite(texture);
                setupBackgroundSprite(backgroundSprite);
                backgroundContainer.addChild(backgroundSprite);
                
                // Ensure video keeps playing
                pixiApp.ticker.add(() => {
                    if (video.paused) {
                        video.play().catch(console.error);
                    }
                    if (texture) {
                        texture.update();
                    }
                });

                resolve();
            } catch (error) {
                reject(error);
            }
        };
        
        video.onerror = () => reject(new Error('Failed to load video'));
    });
}

async function loadImageBackground(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                if (backgroundSprite) {
                    backgroundContainer.removeChild(backgroundSprite);
                }
                backgroundSprite = PIXI.Sprite.from(img);
                setupBackgroundSprite(backgroundSprite);
                backgroundContainer.addChild(backgroundSprite);
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
    });
}

// Add this cleanup function
function cleanup() {
    // Clear particle system
    if (emitter) {
        emitter.stop();
        emitter.particles.forEach(p => {
            emitter.container.removeChild(p);
            p.destroy();
        });
        emitter.particles = [];
        emitter.particlePool.forEach(p => p.destroy());
        emitter.particlePool = [];
    }

    // Clear background
    if (backgroundSprite) {
        const source = backgroundSprite.texture.baseTexture.resource?.source;
        if (source instanceof HTMLVideoElement) {
            source.pause();
            source.src = '';
            source.load();
        }
        backgroundContainer.removeChild(backgroundSprite);
        backgroundSprite.destroy();
        backgroundSprite = null;
    }

    // Clear other textures and sprites
    if (piggySprite) {
        piggyContainer.removeChild(piggySprite);
        piggySprite.destroy();
        piggySprite = null;
    }
}

// Add event listener for page unload
window.addEventListener('beforeunload', cleanup);

// Add this error recovery function
function recoverFromError() {
    console.log('Attempting to recover from error...');
    
    // Stop any ongoing animations
    if (pixiApp?.ticker) {
        pixiApp.ticker.stop();
    }
    
    // Clean up existing resources
    cleanup();
    
    // Attempt to reinitialize
    initialize().catch(error => {
        console.error('Failed to recover:', error);
        // Show error UI to user
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <h3>Something went wrong</h3>
            <p>Please refresh the page to try again.</p>
            <button onclick="window.location.reload()">Refresh</button>
        `;
        document.body.appendChild(errorDiv);
    });
}

// Add error handler to PIXI ticker
pixiApp?.ticker.add(() => {
    try {
        if (emitter) {
            emitter.update();
        }
        // Update other animations...
    } catch (error) {
        console.error('Animation error:', error);
        recoverFromError();
    }
});

// Update how we call initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize());
            } else {
    initialize();
}

// Update the toggleMirrorX and toggleMirrorY functions
function toggleMirrorX() {
    console.log('toggleMirrorX called, current state:', mirrorX);
    mirrorX = !mirrorX;
    const btn = document.querySelector('.mirror-x-btn');
    btn.classList.toggle('active', mirrorX);
    console.log('New mirrorX state:', mirrorX);
    updateTransform();
}

function toggleMirrorY() {
    console.log('toggleMirrorY called, current state:', mirrorY);
    mirrorY = !mirrorY;
    const btn = document.querySelector('.mirror-y-btn');
    btn.classList.toggle('active', mirrorY);
    console.log('New mirrorY state:', mirrorY);
    updateTransform();
}