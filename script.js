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
        MAX_SIZE: 256 * 1024,    // 256KB (Telegram limit)
        TARGET_SIZE: 252 * 1024, // Target closer to limit (252KB)
        MIN_BITRATE: 500000,     // Increased minimum to 500Kbps
        MAX_BITRATE: 6000000,    // Increased maximum to 6Mbps for short clips
        QUALITY_SETTINGS: {
            high: 2000000,
            normal: 1000000,
            low: 500000
        },
        FORMATS: {
            WEBM: {
                mimeType: 'video/webm;codecs=vp9',
                extension: 'webm',
                label: 'WebM/VP9',
                priority: 1
            },
            WEBM_VP8: {
                mimeType: 'video/webm;codecs=vp8',
                extension: 'webm',
                label: 'WebM/VP8',
                priority: 2
            },
            MP4_H264: {
                mimeType: 'video/mp4;codecs=avc1.42E01E',  // Standard H.264 baseline profile
                extension: 'mp4',
                label: 'MP4/H.264',
                priority: 3
            },
            MP4_SIMPLE: {
                mimeType: 'video/mp4;codecs=h264',
                extension: 'mp4',
                label: 'MP4/H.264',
                priority: 4
            },
            MP4_DEFAULT: {
                mimeType: 'video/mp4',
                extension: 'mp4',
                label: 'MP4',
                priority: 5
            }
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
    normal: Math.floor(3000 / (SPEEDS.normal * FRAMES_IN_SEQUENCE)),      // ~15 loops
    squirtaholic: Math.floor(3000 / (SPEEDS.squirtaholic * FRAMES_IN_SEQUENCE)), // ~24 loops
    smooth: Math.floor(3000 / (SPEEDS.smooth * FRAMES_IN_SEQUENCE))       // ~9 loops
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
        this.maxParticles = 50;
        this.particlesPerBurst = 8;
        this.particlePool = [];
        this.lastEmitTime = 0;
        this.burstInterval = 250;
        this.burstSpread = 0.35;
        this.gravity = 0.25;
    }

    createParticle(angleOffset = 0) {
        let particle = this.particlePool.pop() || new PIXI.Sprite(this.texture);
        
        particle.anchor.set(0.5);
        
        // Emission point with slight variation
        particle.x = CONFIG.CANVAS.WIDTH * (0.32 + (Math.random() - 0.5) * 0.02);
        particle.y = CONFIG.CANVAS.HEIGHT * (0.90 + (Math.random() - 0.5) * 0.02);
        
        // Much more varied trajectory
        const baseAngle = -Math.PI/4 + (Math.random() - 0.5) * 0.8;
        const randomSpread = (Math.random() - 0.5) * this.burstSpread * 1.5;
        const burstPower = 1.4 + Math.random() * 1.2;
        const angle = baseAngle + randomSpread + angleOffset;
        
        // Varied speeds per particle
        const speedVariation = 8 + Math.random() * 8;
        const speed = speedVariation * burstPower;
        
        // Add some curved trajectories
        const curveDirection = (Math.random() - 0.5) * 0.4;
        
        particle.velocity = {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed,
            curve: curveDirection
        };
        
        // Much smaller particles
        const size = 0.12 + Math.random() * 0.15; // Reduced from 0.2 + random * 0.3
        particle.scale.set(size);
        
        // Initial random rotation
        particle.rotation = Math.random() * Math.PI * 2;
        
        // Full opacity with the gradient drop
        particle.alpha = 1.0;
        particle.tint = 0xFFFFFF;
        
        // Faster rotation for more dynamic effect
        particle.spinSpeed = (Math.random() - 0.5) * 1.0; // Increased spin for more visible rotation
        particle.rotationWobble = {
            speed: 0.15 + Math.random() * 0.3,
            amplitude: 0.4 + Math.random() * 0.6,
            offset: Math.random() * Math.PI * 2
        };
        
        // More varied wobble
        particle.wobble = {
            speed: 0.1 + Math.random() * 0.2,
            amplitude: 0.2 + Math.random() * 0.4,
            offset: Math.random() * Math.PI * 2
        };
        
        // Varied gravity per particle
        particle.gravity = 0.2 + Math.random() * 0.4;
        particle.lifetime = 0;
        particle.maxLife = 25 + Math.random() * 15;
        
        this.container.addChild(particle);
        this.particles.push(particle);
    }

    createBurst() {
        // Random burst size
        const burstSize = this.particlesPerBurst + Math.floor(Math.random() * 5);
        
        for (let i = 0; i < burstSize; i++) {
            const spreadFactor = (i / burstSize) * Math.PI * 0.4;
            const angleOffset = Math.sin(spreadFactor) * this.burstSpread;
            this.createParticle(angleOffset);
        }
    }

    update() {
        if (!this.active) return;

        const now = performance.now();
        
        // More varied burst timing
        if (now - this.lastEmitTime >= this.burstInterval * (0.8 + Math.random() * 0.4)) {
            this.createBurst();
            this.lastEmitTime = now;
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            particle.lifetime++;
            
            // Apply curved trajectory
            particle.velocity.x += particle.velocity.curve;
            
            // Wobble movement
            const wobble = Math.sin(particle.lifetime * particle.wobble.speed + particle.wobble.offset) 
                * particle.wobble.amplitude;
            particle.velocity.x += wobble * 0.15;
            
            // Crazy rotation
            const rotationWobble = Math.sin(particle.lifetime * particle.rotationWobble.speed + particle.rotationWobble.offset) 
                * particle.rotationWobble.amplitude;
            particle.rotation += particle.spinSpeed + rotationWobble;
            
            // Update position with slight random variation
            particle.velocity.y += particle.gravity + (Math.random() - 0.5) * 0.1;
            particle.x += particle.velocity.x + (Math.random() - 0.5) * 0.3;
            particle.y += particle.velocity.y;
            
            // Edge fading
            const edgeFadeDistance = 40;
            const edgeFade = Math.min(
                (CONFIG.CANVAS.HEIGHT - particle.y) / edgeFadeDistance,
                particle.y / edgeFadeDistance,
                (CONFIG.CANVAS.WIDTH - particle.x) / edgeFadeDistance,
                particle.x / edgeFadeDistance
            );
            
            const lifeFade = 1 - (particle.lifetime / particle.maxLife);
            particle.alpha = Math.min(1, Math.max(0, edgeFade, lifeFade));

            // Remove dead particles
            if (particle.alpha <= 0 || 
                particle.y > CONFIG.CANVAS.HEIGHT || 
                particle.x < 0 || 
                particle.x > CONFIG.CANVAS.WIDTH) {
                this.container.removeChild(particle);
                this.particles.splice(i, 1);
                this.particlePool.push(particle);
            }
        }
    }

    start() {
        this.active = true;
        this.lastEmitTime = performance.now();
        this.createBurst();
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
    
    // Enforce 3 second limit
    if (totalDuration > 3) {
        const maxLoops = Math.floor(3000 / (FRAME_DURATION * FRAMES_IN_SEQUENCE));
        document.getElementById('loop-count').value = maxLoops;
        document.getElementById('loop-count-display').textContent = maxLoops;
        return updateDurationDisplay(); // Recalculate with adjusted loops
    }
    
    document.getElementById('duration-display').textContent = `${totalDuration.toFixed(2)}s`;
    
    // Update video loop if needed
    if (backgroundSprite?.texture.baseTexture.resource?.source instanceof HTMLVideoElement) {
        const video = backgroundSprite.texture.baseTexture.resource.source;
        video.loop = true;
    }
    
    updateQualityIndicator(totalDuration);
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
    
    // Calculate max loops for current speed to stay under 3 seconds
    const maxLoopsFor3Sec = Math.floor(3000 / (FRAME_DURATION * FRAMES_IN_SEQUENCE));
    currentMaxLoops = Math.min(MAX_LOOPS[speed], maxLoopsFor3Sec);
    
    const loopInput = document.getElementById('loop-count');
    loopInput.max = currentMaxLoops;
    
    // Ensure current value doesn't exceed new max
    if (parseInt(loopInput.value) > currentMaxLoops) {
        loopInput.value = currentMaxLoops;
    }
    
    // Update sprite animation speed
    if (piggySprite) {
        piggySprite.animationSpeed = 1000 / (FRAME_DURATION * 60);
    }
    
    updateDurationDisplay();
    startTime = 0;
    animationStartTime = 0;
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

        // Check if PIXI is available
        if (typeof PIXI === 'undefined') {
            throw new Error('PIXI.js not loaded');
        }

        // Initialize GIF first
        try {
            piggyGif = await initializeGif(DEFAULT_GIF_URL);
        } catch (gifError) {
            console.error('Failed to load GIF:', gifError);
            throw new Error('Failed to load Piggy animation');
        }

        // Initialize PIXI with error handling
        try {
            // Initialize PIXI and get containers
            const containers = await initializePixiParticles();
            if (!containers) {
                throw new Error('Failed to initialize PIXI containers');
            }
            backgroundContainer = containers.backgroundContainer;
            particleContainer = containers.particleContainer;
            piggyContainer = containers.piggyContainer;
        } catch (pixiError) {
            console.error('PIXI initialization failed:', pixiError);
            throw new Error('Failed to initialize animation system');
        }

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
        throw error; // Re-throw to trigger error recovery
    }
}

function setupEventListeners() {
    zoomControl.addEventListener('input', updateTransform);
    cropX.addEventListener('input', updateTransform);
    cropY.addEventListener('input', updateTransform);
    
    document.getElementById('loop-count').addEventListener('input', function(e) {
        const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * e.target.value) / 1000;
        
        // If duration would exceed 3 seconds, adjust the value
        if (totalDuration > 3) {
            const maxLoops = Math.floor(3000 / (FRAME_DURATION * FRAMES_IN_SEQUENCE));
            e.target.value = maxLoops;
        }
        
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
            if (!animationStartTime) animationStartTime = now;
            
            // Use animationStartTime for consistent animation phase
            const elapsed = (now - animationStartTime) % totalDuration;
            const progress = elapsed / totalDuration;
            
            // Ensure smooth sinusoidal animation
            const bounce = Math.sin(progress * Math.PI * 2);
            const zoomVariation = 0.15 * (zoomAnimationIntensity / 100);
            currentZoom = baseZoom * (1 + bounce * zoomVariation);
            
            requestAnimationFrame(() => updateTransform());
        }

        // Rest of the transform code...
        const scaleX = (CONFIG.CANVAS.WIDTH / backgroundSprite.texture.width) * currentZoom;
        const scaleY = (CONFIG.CANVAS.HEIGHT / backgroundSprite.texture.height) * currentZoom;
        const scale = Math.max(scaleX, scaleY);
        
        backgroundSprite.scale.set(
            scale * (mirrorX ? -1 : 1),
            scale * (mirrorY ? -1 : 1)
        );
        
        backgroundSprite.position.set(
            CONFIG.CANVAS.WIDTH / 2 + (xOffset / 50) * CONFIG.CANVAS.WIDTH,
            CONFIG.CANVAS.HEIGHT / 2 + (yOffset / 50) * CONFIG.CANVAS.HEIGHT
        );
    }
    
    updateTransformDisplay();
}

async function exportForSticker() {
    try {
        if (!pixiApp || !pixiApp.view) {
            throw new Error('Animation system not properly initialized. Please refresh the page.');
        }

        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = '<h3>Preparing Export...</h3>';
        document.body.appendChild(loadingDiv);

        const canvas = pixiApp.view || document.getElementById('preview-canvas');
        if (!canvas) {
            throw new Error('No canvas found for recording');
        }

        if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            throw new Error('Your browser does not support WebM VP9 format required for Telegram stickers.');
        }

        const loopCount = parseInt(document.getElementById('loop-count').value);
        const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
        const duration = (FRAME_DURATION * totalFrames) / 1000;

        // Reset animation states
        startTime = performance.now();
        animationStartTime = startTime;
        
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                if (piggySprite) {
                    piggySprite.gotoAndPlay(0);
                }
                updateTransform();
                resolve();
            });
        });

        await new Promise(requestAnimationFrame);

        const options = {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: calculateOptimalBitrate(duration),
            frameRate: 30
        };

        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, options);
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);

        const recordingPromise = new Promise((resolve, reject) => {
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm;codecs=vp9' });
                resolve(blob);
            };
            recorder.onerror = reject;
        });

        recorder.start();

        // Use original duration (not doubled)
        const exactDuration = (FRAME_DURATION * (totalFrames + 1));
        
        setTimeout(() => {
            if (recorder.state === 'recording') {
                recorder.stop();
            }
        }, exactDuration);

        const blob = await recordingPromise;
        loadingDiv.remove();

        const url = URL.createObjectURL(blob);
        const exportDiv = document.createElement('div');
        exportDiv.className = 'export-dialog';
        exportDiv.innerHTML = `
            <h3>Export Telegram Sticker</h3>
            <div class="format-group" data-recommended="true">
                <h4>Ready to Upload</h4>
                <button onclick="downloadSticker('${url}', 'telegram', 'webm')" class="primary-btn">
                    📱 Download for Telegram
                </button>
            </div>
            <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
        `;
        document.body.appendChild(exportDiv);

    } catch (error) {
        console.error('Export failed:', error);
        alert(`Export failed: ${error.message}\nFor Telegram stickers, please use Chrome or Edge browser which support WebM VP9 format.`);
        document.querySelector('.loading')?.remove();
    }
}

// Update calculateOptimalBitrate to handle different formats
function calculateOptimalBitrate(duration, format) {
    let optimalBitrate = Math.floor((CONFIG.EXPORT.TARGET_SIZE * 8) / duration);
    
    if (format?.mimeType.includes('mp4')) {
        // Less conservative settings for better quality
        optimalBitrate = Math.min(optimalBitrate, 4000000); // Cap at 4Mbps for MP4
        
        // Even for Safari, allow higher quality
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        if (isSafari) {
            optimalBitrate = Math.min(optimalBitrate, 3000000); // Cap at 3Mbps for Safari
        }
    }
    
    // More aggressive duration-based scaling for better quality
    if (duration <= 0.5) {
        optimalBitrate = Math.min(optimalBitrate * 2.0, CONFIG.EXPORT.MAX_BITRATE);
    } else if (duration <= 1.0) {
        optimalBitrate = Math.min(optimalBitrate * 1.7, CONFIG.EXPORT.MAX_BITRATE);
    } else if (duration <= 2.0) {
        optimalBitrate = Math.min(optimalBitrate * 1.4, CONFIG.EXPORT.MAX_BITRATE);
    }
    
    // Ensure minimum bitrate
    optimalBitrate = Math.max(optimalBitrate, CONFIG.EXPORT.MIN_BITRATE);
    
    console.log(`Format: ${format?.mimeType}, Duration: ${duration}s, Bitrate: ${Math.round(optimalBitrate/1000)}Kbps`);
    
    return Math.floor(optimalBitrate);
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
        loadingDiv.innerHTML = '<h3>Preparing Export...</h3>';
        document.body.appendChild(loadingDiv);

        // Check if MediaRecorder is supported
        if (!window.MediaRecorder) {
            throw new Error('MediaRecorder is not supported in this browser');
        }

        // Validate canvas
        const canvas = document.getElementById('preview-canvas');
        if (!canvas) {
            throw new Error('Canvas element not found');
        }

        const loopCount = parseInt(document.getElementById('loop-count').value);
        const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
        const duration = (FRAME_DURATION * totalFrames) / 1000;
        const optimalBitrate = calculateOptimalBitrate(duration);
        
        const mediaStream = canvas.captureStream(30);
        
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
        alert(`Export failed: ${error.message}\nPlease try a different browser or check your settings.`);
    } finally {
        document.querySelector('.loading')?.remove();
    }
}

function getSupportedMimeType() {
    // Check for WebM VP9 support first
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        return {
            universal: 'video/webm;codecs=vp9',
            telegram: 'video/webm;codecs=vp9'
        };
    }
    
    // Fallback to WebM VP8
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        return {
            universal: 'video/webm;codecs=vp8',
            telegram: 'video/webm;codecs=vp8'
        };
    }
    
    // Last resort fallback to MP4
    return {
        universal: 'video/mp4',
        telegram: 'video/webm;codecs=vp9' // This will trigger an error for Telegram export
    };
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
    return PIXI.Texture.from('https://res.cloudinary.com/dakoxedxt/image/upload/t_Gradient fade/v1735593261/drop2_klw3uo.png');
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

// Add this function
function updateQualityIndicator(duration) {
    const bitrate = calculateOptimalBitrate(duration);
    const qualityIndicator = document.getElementById('quality-indicator');
    
    if (duration <= 0.5) {
        qualityIndicator.textContent = '💎 Ultra Quality';
    } else if (duration <= 1.0) {
        qualityIndicator.textContent = '🟢 High Quality';
    } else if (duration <= 2.0) {
        qualityIndicator.textContent = '🟡 Good Quality';
    } else {
        qualityIndicator.textContent = '🟠 Standard Quality';
    }
    
    const estimatedSize = Math.round((bitrate * duration) / 8 / 1024);
    qualityIndicator.title = `${Math.round(bitrate/1000)}Kbps (≈${estimatedSize}KB)`;
}