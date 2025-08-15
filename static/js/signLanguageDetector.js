class SignLanguageDetector {
    constructor(config = {}) {
        // Configuration
        this.config = {
            processingInterval: config.processingInterval || 300,
            frameQuality: config.frameQuality || 0.8,
            socketNamespace: config.socketNamespace || '',
            isRoomMode: config.isRoomMode || false,
            enableGameLogic: config.enableGameLogic || false,
            enableFpsCounter: config.enableFpsCounter || false,
            useExistingSocket: config.useExistingSocket || false,
            ...config
        };

        // DOM elements
        this.elements = this.getDOMElements();
        
        // State variables
        this.stream = null;
        this.isProcessing = false;
        this.processingInterval = null;
        this.isCameraReady = false;
        this.fpsCounter = 0;
        this.lastFrameTime = 0;

        // Game-specific variables (only used in room mode)
        if (this.config.enableGameLogic) {
            this.holdCounter = 0;
            this.score = 0;
            this.customClassNames = {
                '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'F',
                '6': 'G', '7': 'H', '8': 'I', '9': 'K', '10': 'L', '11': 'M',
                '12': 'N', '13': 'O', '14': 'P', '15': 'Q', '16': 'R', '17': 'T',
                '18': 'U', '19': 'V', '20': 'W', '21': 'X', '22': 'Y', '23': 'ILY'
            };
            this.asl_classes = Object.values(this.customClassNames);
            this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
            this.updateGameUI();
        }

        // Socket connection - use existing socket if provided, otherwise create new one
        if (this.config.useExistingSocket && window.sharedSocket) {
            this.socketio = window.sharedSocket;
            this.ownsSocket = false;
        } else {
            this.socketio = io();
            this.ownsSocket = true;
            
            // Make socket available globally if this is room mode
            if (this.config.isRoomMode) {
                window.sharedSocket = this.socketio;
            }
        }
        
        // Initialize
        this.init();
    }

    getDOMElements() {
        return {
            videoElement: document.getElementById('videoElement'),
            canvas: document.getElementById('canvas'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            statusDiv: document.getElementById('status'),
            predictionDiv: document.getElementById('prediction'),
            confidenceDiv: document.getElementById('confidence'),
            confidenceBar: document.getElementById('confidenceBar'),
            toggleProcessingBtn: document.getElementById('toggleProcessing') || document.getElementById('toggleProcessingBtn'),
            startProcessingBtn: document.getElementById('startProcessingBtn'),
            stopProcessingBtn: document.getElementById('stopProcessingBtn'),
            fpsCounter: document.getElementById('fpsCounter'),
            // Game-specific elements
            scoreElement: document.getElementById('score'),
            targetElement: document.getElementById('target-letter'),
            timerDisplay: document.getElementById('timer')
        };
    }

    init() {
        // Get canvas context
        this.ctx = this.elements.canvas ? this.elements.canvas.getContext('2d') : null;

        // Setup socket event handlers only if we own the socket or it's not room mode
        if (this.ownsSocket || !this.config.isRoomMode) {
            this.setupSocketHandlers();
        } else {
            // Just setup prediction handlers for shared socket
            this.setupPredictionHandler();
        }

        // Setup DOM event listeners
        this.setupEventListeners();

        // Join appropriate session only if we own the socket
        if (this.ownsSocket) {
            if (this.config.isRoomMode) {
                console.log('Sign Language Detector initialized for room mode with new socket');
            } else {
                this.socketio.emit('join_translator');
                console.log('Sign Language Detector initialized for translator mode');
            }
        } else {
            console.log('Sign Language Detector initialized with shared socket');
        }
    }

    setupSocketHandlers() {
        this.socketio.on('connect', () => {
            console.log('Connected to server');
            if (!this.config.isRoomMode) {
                this.socketio.emit('join_translator');
            }
        });

        this.socketio.on('status', (data) => {
            if (this.elements.statusDiv) {
                this.elements.statusDiv.textContent = data.message + (data.model_loaded ? ' (Model Ready)' : ' (Demo Mode)');
                this.elements.statusDiv.className = 'status connected';
                if (!data.model_loaded) {
                    this.elements.statusDiv.textContent += ' - Model not available';
                }
            }
        });

        this.setupPredictionHandler();

        this.socketio.on('error', (data) => {
            console.error('Server error:', data.message);
            if (this.elements.statusDiv) {
                this.elements.statusDiv.textContent = 'Error: ' + data.message;
                this.elements.statusDiv.className = 'status disconnected';
            }
        });

        this.socketio.on('disconnect', () => {
            if (this.elements.statusDiv) {
                this.elements.statusDiv.textContent = 'Disconnected from server';
                this.elements.statusDiv.className = 'status disconnected';
            }
        });
    }

    setupPredictionHandler() {
        this.socketio.on('prediction_result', (data) => {
            this.handlePredictionResult(data);
        });
    }

    setupEventListeners() {
        // Camera controls
        if (this.elements.startBtn) {
            this.elements.startBtn.addEventListener('click', () => this.startCamera());
        }

        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => this.stopCamera());
        }

        // Processing controls
        if (this.elements.toggleProcessingBtn) {
            this.elements.toggleProcessingBtn.addEventListener('click', () => {
                if (this.isProcessing) {
                    this.stopProcessing();
                } else {
                    this.startProcessing();
                }
            });
        }

        if (this.elements.startProcessingBtn) {
            this.elements.startProcessingBtn.addEventListener('click', () => this.startProcessing());
        }

        if (this.elements.stopProcessingBtn) {
            this.elements.stopProcessingBtn.addEventListener('click', () => this.stopProcessing());
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (!this.config.isRoomMode && this.ownsSocket) {
                this.socketio.emit('leave_translator');
            }
            this.stopCamera();
        });
    }

    async startCamera() {
        console.log('Starting camera...');
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });
            
            if (this.elements.videoElement) {
                this.elements.videoElement.srcObject = this.stream;

                this.elements.videoElement.onloadedmetadata = () => {
                    if (this.elements.canvas) {
                        this.elements.canvas.width = this.elements.videoElement.videoWidth;
                        this.elements.canvas.height = this.elements.videoElement.videoHeight;
                    }
                    this.isCameraReady = true;
                    
                    // Notify room mode about camera readiness
                    if (this.config.isRoomMode) {
                        this.socketio.emit('camera_ready');
                        console.log('Camera ready event sent to server');
                    }
                };
            }

            this.updateCameraControls(true);
            console.log('Camera started successfully');
            
            // Call onCameraStart callback if provided
            if (this.config.onCameraStart) {
                this.config.onCameraStart();
            }

        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Could not access camera. Please ensure camera permissions are granted.');
        }
    }

    stopCamera() {
        console.log('Stopping camera...');
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.elements.videoElement) {
            this.elements.videoElement.srcObject = null;
        }
        
        this.stopProcessing();
        this.isCameraReady = false;

        this.updateCameraControls(false);

        // Notify room mode about camera stop
        if (this.config.isRoomMode) {
            this.socketio.emit('camera_stopped');
            console.log('Camera stopped event sent to server');
        }

        if (this.ctx && this.elements.canvas) {
            this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        }
        
        console.log('Camera stopped');

        // Call onCameraStop callback if provided
        if (this.config.onCameraStop) {
            this.config.onCameraStop();
        }
    }

    startProcessing() {
        console.log('Starting processing...');
        
        // Check if participation is allowed (for room mode)
        if (this.config.isRoomMode && this.config.participate === false) {
            return;
        }
        
        if (!this.stream) {
            alert('Please start the camera first');
            return;
        }

        this.isProcessing = true;
        
        // Update toggle button if exists
        if (this.elements.toggleProcessingBtn) {
            this.elements.toggleProcessingBtn.textContent = 'Stop Detection';
            this.elements.toggleProcessingBtn.classList.add('processing');
        }

        this.processingInterval = setInterval(() => {
            this.captureAndSendFrame();
        }, this.config.processingInterval);

        console.log('Processing started');

        // Call onProcessingStart callback if provided
        if (this.config.onProcessingStart) {
            this.config.onProcessingStart();
        }
    }

    stopProcessing() {
        console.log('Stopping processing...');
        this.isProcessing = false;
        
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        // Update toggle button if exists
        if (this.elements.toggleProcessingBtn) {
            this.elements.toggleProcessingBtn.textContent = 'Start Detection';
            this.elements.toggleProcessingBtn.classList.remove('processing');
        }

        // Reset display
        this.resetDisplay();

        console.log('Processing stopped');

        // Call onProcessingStop callback if provided
        if (this.config.onProcessingStop) {
            this.config.onProcessingStop();
        }
    }

    captureAndSendFrame() {
        if (!this.elements.videoElement || !this.elements.videoElement.videoWidth || !this.elements.videoElement.videoHeight) {
            return;
        }

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.elements.videoElement.videoWidth;
        tempCanvas.height = this.elements.videoElement.videoHeight;

        // Mirror the image horizontally
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(this.elements.videoElement, -tempCanvas.width, 0);

        const imageData = tempCanvas.toDataURL('image/jpeg', this.config.frameQuality);
        
        // Send to appropriate endpoint based on mode
        const eventName = this.config.isRoomMode ? 'process_frame_room' : 'process_frame_translator';
        this.socketio.emit(eventName, { image: imageData });

        // Update FPS counter if enabled
        if (this.config.enableFpsCounter) {
            this.updateFpsCounter();
        }
    }

    handlePredictionResult(data) {
        // Update prediction display
        if (this.elements.predictionDiv) {
            this.elements.predictionDiv.textContent = data.prediction;
        }
        
        // Update confidence display
        const confidencePercent = Math.round(data.confidence * 100);
        if (this.elements.confidenceDiv) {
            this.elements.confidenceDiv.textContent = confidencePercent + '%';
        }
        if (this.elements.confidenceBar) {
            this.elements.confidenceBar.style.width = confidencePercent + '%';
        }

        // Draw hand landmarks if available
        if (data.landmarks && data.landmarks.length > 0 && this.ctx) {
            this.drawLandmarks(data.landmarks);
        }

        // Handle game logic if enabled
        if (this.config.enableGameLogic) {
            this.handleGameLogic(data.prediction, confidencePercent);
        }

        // Call custom prediction handler if provided
        if (this.config.onPrediction) {
            this.config.onPrediction(data);
        }
    }

    handleGameLogic(prediction, confidencePercent) {
        if (prediction === this.targetletter && confidencePercent >= 50) {
            this.holdCounter += 1;
        } else {
            this.holdCounter = 0;
        }

        if (this.holdCounter >= 4) { // 4 * 300ms = 1200ms hold time
            this.score += 1;
            this.holdCounter = 0;
            this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
            this.updateGameUI();

            // Emit score update for room mode
            if (this.config.isRoomMode) {
                this.socketio.emit('score_update', { score: this.score });
            }
        }
    }

    updateGameUI() {
        if (this.elements.scoreElement) {
            this.elements.scoreElement.textContent = `Score: ${this.score}`;
        }
        if (this.elements.targetElement) {
            this.elements.targetElement.textContent = `Target: ${this.targetletter}`;
        }
    }

    drawLandmarks(landmarks) {
        if (!this.ctx || !this.elements.canvas) return;
        
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);

        landmarks.forEach(hand => {
            const points = hand.points;
            const connections = hand.connections;

            // Draw connections
            this.ctx.strokeStyle = '#00FF00';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();

            connections.forEach(([start, end]) => {
                const startPoint = points[start];
                const endPoint = points[end];

                const startX = startPoint[0] * this.elements.canvas.width;
                const startY = startPoint[1] * this.elements.canvas.height;
                const endX = endPoint[0] * this.elements.canvas.width;
                const endY = endPoint[1] * this.elements.canvas.height;

                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
            });

            this.ctx.stroke();

            // Draw points
            this.ctx.fillStyle = '#FF0000';
            points.forEach(point => {
                const x = point[0] * this.elements.canvas.width;
                const y = point[1] * this.elements.canvas.height;

                this.ctx.beginPath();
                this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
                this.ctx.fill();
            });
        });
    }

    updateCameraControls(cameraActive) {
        if (this.elements.startBtn) {
            this.elements.startBtn.disabled = cameraActive;
        }
        if (this.elements.stopBtn) {
            this.elements.stopBtn.disabled = !cameraActive;
        }
        if (this.elements.toggleProcessingBtn) {
            this.elements.toggleProcessingBtn.disabled = !cameraActive;
        }
    }

    updateFpsCounter() {
        const now = performance.now();
        if (this.lastFrameTime) {
            const fps = Math.round(1000 / (now - this.lastFrameTime));
            if (this.elements.fpsCounter) {
                this.elements.fpsCounter.textContent = `FPS: ${fps}`;
            }
        }
        this.lastFrameTime = now;
    }

    resetDisplay() {
        if (this.elements.predictionDiv) {
            this.elements.predictionDiv.textContent = 'No gesture';
        }
        if (this.elements.confidenceDiv) {
            this.elements.confidenceDiv.textContent = '0%';
        }
        if (this.elements.confidenceBar) {
            this.elements.confidenceBar.style.width = '0%';
        }
        if (this.ctx && this.elements.canvas) {
            this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        }
    }

    // Public methods for external control
    resetScore() {
        if (this.config.enableGameLogic) {
            this.score = 0;
            this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
            this.updateGameUI();
        }
    }

    setParticipation(participate) {
        this.config.participate = participate;
    }

    getScore() {
        return this.score;
    }

    getTargetLetter() {
        return this.targetletter;
    }

    // Cleanup method
    destroy() {
        this.stopCamera();
        if (this.socketio && this.ownsSocket) {
            this.socketio.disconnect();
        }
    }
}