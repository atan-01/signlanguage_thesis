class SignLanguageDetector {
    constructor(config = {}) {
        this.config = {
            processingInterval: config.processingInterval || 300,
            frameQuality: config.frameQuality || 0.8,
            isRoomMode: config.isRoomMode || false,
            enableGameLogic: config.enableGameLogic || false,
            enableLearningMode: config.enableLearningMode || false,
            enableFpsCounter: config.enableFpsCounter || false,
            requireSocket: config.requireSocket !== false,
            participate: config.participate !== false,
            ...config
        };

        this.elements = this.getDOMElements();
        
        // State variables
        this.stream = null;
        this.isProcessing = false;
        this.processingInterval = null;
        this.isCameraReady = false;

        // Canvas setup
        this.captureCanvas = document.createElement('canvas');
        this.captureCtx = this.captureCanvas.getContext('2d');
        this.ctx = this.elements.canvas ? this.elements.canvas.getContext('2d') : null;

        // MediaPipe setup
        this.hands = null;
        this.isMediaPipeReady = false;

        // Client-side processing options
        this.useClientSideProcessing = config.useClientSideProcessing || false;
        this.clientSideClassifier = null;
        
        // Initialize client-side classifier if needed
        if (this.useClientSideProcessing) {
            this.initClientSideClassifier().then(() => {
                console.log('Client-side classifier ready');
            });
        }

        // Game-specific variables
        if (this.config.enableGameLogic) {
            this.holdCounter = 0;
            this.score = 0;
            this.customClassNames = {
                '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'F',
                '6': 'G', '7': 'H', '8': 'I', '9': 'K', '10': 'L', '11': 'M',
                '12': 'N', '13': 'O', '14': 'P', '15': 'Q', '16': 'R', '17': 'S',
                '18': 'T', '19': 'U', '20': 'V', '21': 'W', '22': 'X', '23': 'Y'
            };
            this.asl_classes = Object.values(this.customClassNames);
            
            // Game mode variables
            this.gameMode = config.gameMode || 'time_starts';
            this.words = null;
            this.currentWord = null;
            this.currentBlankIndex = -1;
            this.currentTargetLetter = null;
            this.wordDisplay = '';
            this.isAnimating = false;
            
            // Initialize based on game mode
            if (this.gameMode === 'time_starts') {
                this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
                this.updateGameUI();
            } else if (this.gameMode === 'fill_blanks') {
                this.loadWords();
            }
        }
        
        // Learning mode variables
        if (this.config.enableLearningMode) {
            this.learningTarget = null;
            this.learningHoldCounter = 0;
            this.learningSuccessThreshold = 10;
            this.learningConfidenceThreshold = 50;
            this.hasShownSuccess = false;
        }

        // Socket setup - required for sending landmarks
        if (this.config.requireSocket) {
            if (this.config.isRoomMode) {
                this.socketio = io();
                this.setupRoomSync();
                this.ownsSocket = true;
            } else {
                this.socketio = io();
                this.setupStandaloneSync();
                this.ownsSocket = true;
            }
        }

        // Initialize MediaPipe and setup
        this.initMediaPipe();
        this.setupEventListeners();
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
            scoreElement: document.getElementById('score'),
            targetElement: document.getElementById('target-letter'),
            timerDisplay: document.getElementById('timer_display')
        };
    }

    async initMediaPipe() {
        try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer
            
            if (typeof Hands === 'undefined') {
                console.error('MediaPipe Hands not loaded - check script tag');
                this.isMediaPipeReady = false;
                return;
            }

            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            await this.hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.hands.onResults((results) => {
                this.processMediaPipeResults(results);
            });

            await this.hands.initialize();

            this.isMediaPipeReady = true;
            console.log('MediaPipe initialized successfully');
            
        } catch (error) {
            console.error('MediaPipe failed:', error);
            this.isMediaPipeReady = false;
        }
    }

    setupRoomSync() {
        this.socketio.on('connect', () => {
            console.log('Connected to room sync');
        });

        this.socketio.on('prediction_result', (data) => {
            this.handlePredictionResult(data);
        });

        this.socketio.on('status', (data) => {
            if (this.elements.statusDiv) {
                this.elements.statusDiv.textContent = data.message;
                this.elements.statusDiv.className = 'status connected';
            }
        });

        this.socketio.on('error', (data) => {
            console.error('Server error:', data.message);
            if (this.elements.statusDiv) {
                this.elements.statusDiv.textContent = 'Error: ' + data.message;
                this.elements.statusDiv.className = 'status disconnected';
            }
        });
    }

    setupStandaloneSync() {
        this.socketio.on('connect', () => {
            console.log('Connected to translator');
            this.socketio.emit('join_translator');
        });

        this.socketio.on('prediction_result', (data) => {
            this.handlePredictionResult(data);
        });

        this.socketio.on('status', (data) => {
            if (this.elements.statusDiv) {
                this.elements.statusDiv.textContent = data.message;
                this.elements.statusDiv.className = 'status connected';
            }
        });
    }

    setupEventListeners() {
        const cameraButton = this.elements.startBtn || document.getElementById('startBtn');
        if (cameraButton) {
            cameraButton.addEventListener('click', (e) => {
                const button = e.target;
                if (button.id === 'startBtn') {
                    this.startCamera();
                    
                    button.id = "stopBtn";
                    button.className = "btn danger";
                    button.textContent = "Stop Camera";
                    button.disabled = false;
                    
                    this.elements.stopBtn = button;
                    
                } else if (button.id === 'stopBtn') {
                    this.stopCamera();
                    
                    button.id = "startBtn";
                    button.className = "btn";
                    button.textContent = "Start Camera";
                    button.disabled = false;
                    
                    this.elements.startBtn = button;
                }
            });
        }

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

        window.addEventListener('beforeunload', () => {
            if (!this.config.isRoomMode && this.ownsSocket && this.socketio) {
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
                
                // MIRROR THE VIDEO ELEMENT
                this.elements.videoElement.style.transform = 'scaleX(-1)';
                this.elements.videoElement.style.webkitTransform = 'scaleX(-1)';

                this.elements.videoElement.onloadedmetadata = () => {
                    if (this.elements.canvas) {
                        this.elements.canvas.width = this.elements.videoElement.videoWidth;
                        this.elements.canvas.height = this.elements.videoElement.videoHeight;
                        
                        // MIRROR THE CANVAS TOO
                        this.elements.canvas.style.transform = 'scaleX(-1)';
                        this.elements.canvas.style.webkitTransform = 'scaleX(-1)';
                    }

                    this.captureCanvas.width = this.elements.videoElement.videoWidth;
                    this.captureCanvas.height = this.elements.videoElement.videoHeight;

                    this.isCameraReady = true;
                    
                    if (this.config.isRoomMode && this.socketio) {
                        this.socketio.emit('camera_ready');
                        console.log('Camera ready event sent to server');
                    }
                };
            }

            this.updateCameraControls(true);
            console.log('Camera started successfully');
            
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

        if (this.config.isRoomMode && this.socketio) {
            this.socketio.emit('camera_stopped');
            console.log('Camera stopped event sent to server');
        }

        if (this.ctx && this.elements.canvas) {
            this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        }
        
        console.log('Camera stopped');

        if (this.config.onCameraStop) {
            this.config.onCameraStop();
        }
    }

    async loadWords() { // for fill in blanks
        try {
            const response = await fetch('/static/models/words.json');
            const data = await response.json();
            this.words = data; // Store the whole object
            console.log(`Loaded ${this.words.words.length} words for Fill in the Blanks`);
            return true;
        } catch (error) {
            console.error('Failed to load words:', error);
            this.words = { words: [] };
            return false;
        }
    }

    startProcessing() {
        console.log('Starting processing...');
        
        if (this.config.isRoomMode && this.config.participate === false) {
            return;
        }
        
        if (!this.stream) {
            alert('Please start the camera first');
            return;
        }

        if (!this.isMediaPipeReady) {
            alert('MediaPipe not ready. Please refresh the page.');
            return;
        }

        this.isProcessing = true;
        
        if (this.elements.toggleProcessingBtn) {
            this.elements.toggleProcessingBtn.textContent = 'Stop Detection';
            this.elements.toggleProcessingBtn.classList.add('processing');
        }

        this.processingInterval = setInterval(() => {
            this.captureAndProcessFrame();
        }, this.config.processingInterval);

        console.log('Processing started - sending landmarks to server');

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

        if (this.elements.toggleProcessingBtn) {
            this.elements.toggleProcessingBtn.textContent = 'Start Detection';
            this.elements.toggleProcessingBtn.classList.remove('processing');
        }

        this.resetDisplay();

        console.log('Processing stopped');

        if (this.config.onProcessingStop) {
            this.config.onProcessingStop();
        }
    }

    async captureAndProcessFrame() {
        if (!this.elements.videoElement || !this.elements.videoElement.videoWidth) {
            return;
        }

        if (!this.isMediaPipeReady || !this.hands) {
            console.error('MediaPipe not ready');
            return;
        }

        try {
            await this.hands.send({ image: this.elements.videoElement });
        } catch (error) {
            console.error('MediaPipe processing failed:', error);
        }

        if (this.config.enableFpsCounter) {
            this.updateFpsCounter();
        }
    }

    sendLandmarksToServer(handsData) {
        if (!this.socketio) {
            console.error('Socket not available');
            return;
        }

        const eventName = this.config.isRoomMode ? 'process_landmarks_room' : 'process_landmarks_translator';
        
        this.socketio.emit(eventName, {
            landmarks: handsData,
            timestamp: Date.now()
        });
    }

    handlePredictionResult(data) {
        if (this.config.enableLearningMode && this.learningTarget) {
            if (data.prediction === this.learningTarget) {
                if (this.elements.predictionDiv) {
                    this.elements.predictionDiv.textContent = data.prediction;
                }
                
                const confidencePercent = Math.round(data.confidence * 100);
                if (this.elements.confidenceDiv) {
                    this.elements.confidenceDiv.textContent = confidencePercent + '%';
                }
                if (this.elements.confidenceBar) {
                    this.elements.confidenceBar.style.width = confidencePercent + '%';
                }
            } else {
                if (this.elements.predictionDiv) {
                    this.elements.predictionDiv.textContent = `Looking for: ${this.learningTarget}`;
                }
                if (this.elements.confidenceDiv) {
                    this.elements.confidenceDiv.textContent = '0%';
                }
                if (this.elements.confidenceBar) {
                    this.elements.confidenceBar.style.width = '0%';
                }
            }
            
            this.handleLearningLogic(data.prediction, Math.round(data.confidence * 100));
            
        } else {
            if (this.elements.predictionDiv) {
                this.elements.predictionDiv.textContent = data.prediction;
            }
            
            const confidencePercent = Math.round(data.confidence * 100);
            if (this.elements.confidenceDiv) {
                this.elements.confidenceDiv.textContent = confidencePercent + '%';
            }
            if (this.elements.confidenceBar) {
                this.elements.confidenceBar.style.width = confidencePercent + '%';
            }
            
            if (this.config.enableGameLogic) {
                this.handleGameLogic(data.prediction, confidencePercent);
            }
        }

        if (this.config.onPrediction) {
            this.config.onPrediction(data);
        }
    }

    selectRandomWordWithBlank() {
        // Check if words are loaded
        if (!this.words || !this.words.words || this.words.words.length === 0) {
            console.error('Words not loaded yet, trying to load...');
            this.loadWords().then(() => {
                if (this.words && this.words.words && this.words.words.length > 0) {
                    this.selectRandomWordWithBlank(); // Retry after loading
                }
            });
            return;
        }
        
        // random word
        const randomIndex = Math.floor(Math.random() * this.words.words.length);
        this.currentWord = this.words.words[randomIndex];
        
        // random position to blank
        const wordLength = this.currentWord.word.length;
        this.currentBlankIndex = Math.floor(Math.random() * (wordLength - 1)) + 1;
        
        // Get the target letter (uppercase)
        this.currentTargetLetter = this.currentWord.word[this.currentBlankIndex].toUpperCase();
        
        // Create display with blank
        const wordArray = this.currentWord.word.split('');
        wordArray[this.currentBlankIndex] = '_';
        this.wordDisplay = wordArray.join('');
    }

    handleGameLogic(prediction, confidencePercent) {
        if (this.gameMode === 'time_starts') {
            // time-based game logic
            if (prediction === this.targetletter && confidencePercent >= 30) {
                this.holdCounter += 1;
            } else {
                this.holdCounter = 0;
            }

            if (this.holdCounter >= 4) {
                this.score += 10;
                this.holdCounter = 0;
                this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
                this.updateGameUI();

                if (this.config.isRoomMode && this.socketio) {
                    this.socketio.emit('score_update', { score: this.score });
                }
            }
        } 
        else if (this.gameMode === 'fill_blanks') {
            // Fill in the blanks game logic
            if (prediction === this.currentTargetLetter && confidencePercent >= 20) {
                this.holdCounter += 1;
            } else {
                this.holdCounter = 0;
            }

            if (this.holdCounter >= 4) {
                // Prevent multiple triggers
                if (this.isAnimating) return;
                this.isAnimating = true;
                
                this.score += 10;
                this.holdCounter = 0;
                
                // Show the correct letter with animation, THEN change word
                this.revealLetterWithAnimation().then(() => {
                    this.selectRandomWordWithBlank();
                    this.updateGameUI();
                    this.isAnimating = false; // Allow next trigger
                });

                if (this.config.isRoomMode && this.socketio) {
                    this.socketio.emit('score_update', { score: this.score });
                }
            }
        }
        else if (this.gameMode === 'above_below') {
            // Above or Below game logic
            if (prediction === this.aboveBelowData.target && confidencePercent >= 20) {
                this.holdCounter += 1;
            } else {
                this.holdCounter = 0;
            }

            if (this.holdCounter >= 4) {
                this.score += 10;
                this.holdCounter = 0;
                
                this.aboveBelowData = this.generateAboveBelowTarget();
                this.updateGameUI();

                if (this.config.isRoomMode && this.socketio) {
                    this.socketio.emit('score_update', { score: this.score });
                }
            }
        }
    }

    revealLetterWithAnimation() {
        return new Promise((resolve) => {
            if (!this.elements.targetElement) {
                resolve();
                return;
            }

            // Replace blank with actual letter
            const revealedWord = this.currentWord.word.toUpperCase();
            
            // Create the HTML with the revealed letter having a special class
            const wordArray = revealedWord.split('');
            const styledWord = wordArray.map((letter, index) => {
                if (index === this.currentBlankIndex) {
                    return `<span class="revealed-letter">${letter}</span>`;
                }
                return letter;
            }).join('');

            // Update the display with revealed letter
            this.elements.targetElement.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center;">
                    <div style="font-size: 1.5rem; margin-bottom: 10px; margin-right: 1rem">${this.currentWord.emoji}</div>
                    <div style="font-size: 1rem; letter-spacing: 0.5rem; font-weight: bold;">${styledWord}</div>
                </div>
            `;

            // Add CSS animation if not already added
            if (!document.getElementById('fillBlanksAnimationStyles')) {
                const style = document.createElement('style');
                style.id = 'fillBlanksAnimationStyles';
                style.textContent = `
                    @keyframes letterReveal {
                        0% { 
                            transform: scale(1);
                            color: inherit;
                        }
                        50% { 
                            transform: scale(1.8);
                            color: #4CAF50;
                        }
                        100% { 
                            transform: scale(1);
                            color: #4CAF50;
                        }
                    }
                    
                    .revealed-letter {
                        display: inline-block;
                        animation: letterReveal 0.6s ease-in-out;
                        color: #4CAF50;
                        font-weight: bold;
                    }
                `;
                document.head.appendChild(style);
            }

            // Wait for animation to complete (600ms) + 1 second pause
            setTimeout(() => {
                resolve(); // Just resolve, don't change word here
            }, 1600); // 600ms animation + 1000ms pause
        });
    }


    handleLearningLogic(prediction, confidencePercent) {
        if (!this.learningTarget) {
            return;
        }

        if (prediction === this.learningTarget && confidencePercent >= this.learningConfidenceThreshold) {
            this.learningHoldCounter += 1;
        } else {
            this.learningHoldCounter = 0;
            this.hasShownSuccess = false;
        }

        if (this.learningHoldCounter >= this.learningSuccessThreshold && !this.hasShownSuccess) {
            this.showLearningSuccess();
            this.hasShownSuccess = true;
            this.learningHoldCounter = 0;
        }
    }

    showLearningSuccess() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            font-size: 16px;
            font-weight: bold;
            font-family: "Gantari", sans-serif;
            animation: slideIn 0.3s ease-out;
        `;
        
        notification.innerHTML = `
            🎉 Well Done! 
            <br>
            <small>You performed "${this.learningTarget}" correctly!</small>
        `;
        
        if (!document.getElementById('learningSuccessStyles')) {
            const style = document.createElement('style');
            style.id = 'learningSuccessStyles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                if (typeof closedetector === 'function') {
                    closedetector();
                }
            }, 300);
        }, 3000);
        
        if (this.config.onLearningSuccess) {
            this.config.onLearningSuccess(this.learningTarget);
        }
        
        console.log(`Learning success: ${this.learningTarget} performed correctly!`);
    }

    startGame() {
        this.score = 0;
        this.holdCounter = 0;
        
        if (this.gameMode === 'time_starts') {
            this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
        } 
        else if (this.gameMode === 'fill_blanks') {
            this.selectRandomWordWithBlank();
        }
        else if (this.gameMode === 'above_below') {
            this.aboveBelowData = this.generateAboveBelowTarget();
        }
        
        this.updateGameUI();
    }

    generateNewTarget() {
        // Generate new target without adding score or resetting hold counter
        this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
        this.holdCounter = 0; // Reset hold counter so they need to hold the new letter
        this.updateGameUI();
        console.log(`New target generated: ${this.targetletter}`);
    }

    skipFillBlanks() {
        this.holdCounter = 0;
        this.selectRandomWordWithBlank();
        this.updateGameUI();
        console.log(`Skipped to new word: ${this.currentWord.word}`);
    }

    skipAboveBelow() {
        this.holdCounter = 0;
        this.aboveBelowData = this.generateAboveBelowTarget();
        this.updateGameUI();
        console.log(`Skipped to new above/below target: ${this.aboveBelowData.target}`);
    }

    formatLandmarksForDisplay(multiHandLandmarks) {
        const formattedLandmarks = [];
        
        multiHandLandmarks.forEach(handLandmarks => {
            const points = handLandmarks.map(lm => [lm.x, lm.y, lm.z]);
            const connections = [
                [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
                [0, 5], [5, 6], [6, 7], [7, 8], // Index
                [0, 9], [9, 10], [10, 11], [11, 12], // Middle
                [0, 13], [13, 14], [14, 15], [15, 16], // Ring
                [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
                [5, 9], [9, 13], [13, 17] // Palm
            ];
            
            formattedLandmarks.push({
                points: points,
                connections: connections
            });
        });
        
        return formattedLandmarks;
    }

    drawLandmarks(landmarks) {
        if (!this.ctx || !this.elements.canvas || !landmarks || landmarks.length === 0) {
            return;
        }
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);

        landmarks.forEach(hand => {
            const points = hand.points;
            const connections = hand.connections;

            // Draw connections (lines between landmarks)
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

            // Draw landmarks (points)
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

    updateGameUI() {
        if (this.gameMode === 'time_starts') {
            // Original UI update
            if (this.elements.scoreElement) {
                this.elements.scoreElement.textContent = `Score ${this.score}`;
            }
            if (this.elements.targetElement) {
                const isNumber = !isNaN(this.targetletter);
                const label = isNumber ? "Number " : "Letter ";
                this.elements.targetElement.textContent = `${label}${this.targetletter}`;
            }
        } 
        else if (this.gameMode === 'fill_blanks') {
            // Fill in the blanks UI update
            if (this.elements.scoreElement) {
                this.elements.scoreElement.textContent = `Score ${this.score}`;
            }
            if (this.elements.targetElement) {
                this.elements.targetElement.innerHTML = `
                    <div style="display: flex; justify-content: center; align-items: center;">
                        <div style="font-size: 1.5rem; margin-bottom: 10px; margin-right: 1rem">${this.currentWord.emoji}</div>
                        <div style="font-size: 1rem; letter-spacing: 0.5rem; font-weight: bold;">${this.wordDisplay.toUpperCase()}</div>
                    </div>
                `;
            }
        }
        else if (this.gameMode === 'above_below') {
            // Above or Below UI update
            if (this.elements.scoreElement) {
                this.elements.scoreElement.textContent = `Score ${this.score}`;
            }
            if (this.elements.targetElement) {
                const arrows = this.aboveBelowData.direction === 'up' ? ' → ' : ' ← ';
                const arrowString = arrows.repeat(this.aboveBelowData.steps);
                
                // For left arrows (down), put arrows before the letter
                if (this.aboveBelowData.direction === 'down') {
                    this.elements.targetElement.textContent = `${arrowString} ${this.aboveBelowData.base}`;
                } else {
                    // For right arrows (up), put arrows after the letter
                    this.elements.targetElement.textContent = `${this.aboveBelowData.base} ${arrowString}`;
                }
            }
        }
    }

    updateCameraControls(cameraActive) {
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

    resetScore() {
        if (this.config.enableGameLogic) {
            this.score = 0;
            this.holdCounter = 0;
            
            if (this.gameMode === 'time_starts') {
                this.targetletter = this.asl_classes[Math.floor(Math.random() * this.asl_classes.length)];
            } 
            else if (this.gameMode === 'fill_blanks') {
                this.selectRandomWordWithBlank();
            }
            
            this.updateGameUI();
        }
    }

    async setGameMode(mode) {
        this.gameMode = mode;
        
        if (mode === 'fill_blanks') {
            if (!this.words || !this.words.words) {
                console.log('Loading words for Fill in the Blanks...');
                await this.loadWords();
            }
        }
        else if (mode === 'above_below') {
            console.log('Setting up Above or Below mode...');
            // Initialize the above/below data structure if needed
            if (this.config.enableGameLogic) {
                this.aboveBelowData = this.generateAboveBelowTarget();
            }
        }
        
        console.log(`Game mode set to: ${mode}`);
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

    setLearningTarget(target) {
        if (this.config.enableLearningMode) {
            this.learningTarget = target;
            this.learningHoldCounter = 0;
            this.hasShownSuccess = false;
            console.log(`Learning target set to: ${target}`);
        }
    }

    getLearningTarget() {
        return this.learningTarget;
    }

    setLearningThresholds(holdTime = 10, confidence = 20) {
        if (this.config.enableLearningMode) {
            this.learningSuccessThreshold = holdTime;
            this.learningConfidenceThreshold = confidence;
        }
    }

    resetLearningState() {
        if (this.config.enableLearningMode) {
            this.learningHoldCounter = 0;
            this.hasShownSuccess = false;
        }
    }

    destroy() {
        this.stopCamera();
        if (this.socketio && this.ownsSocket) {
            this.socketio.disconnect();
        }
    }

////////////////////////////////////////////////////////////////////////////////////////////////

    async initClientSideClassifier() {
        try {
            this.clientSideClassifier = new ClientSideASLClassifier();
            
            // Load default model (alphabet) immediately
            const success = await this.clientSideClassifier.loadModel('alphabet');
            
            if (success) {
                console.log('Client-side classifier initialized with alphabet model');
            } else {
                console.error('Failed to initialize client-side classifier');
                this.useClientSideProcessing = false;
            }
        } catch (error) {
            console.error('Failed to initialize client-side classifier:', error);
            this.useClientSideProcessing = false;
        }
    }

    async setModelType(modelType) {
        if (!this.clientSideClassifier) {
            console.error('Client-side classifier not initialized');
            return false;
        }
        
        console.log(`Switching to ${modelType} model...`);
        const success = await this.clientSideClassifier.loadModel(modelType);
        
        if (success) {
            console.log(`Successfully switched to ${modelType} model`);
            
            // Update game classes if in game mode
            if (this.config.enableGameLogic) {
                if (modelType === 'alphabet') {
                    this.customClassNames = {
                        '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'F',
                        '6': 'G', '7': 'H', '8': 'I', '9': 'K', '10': 'L', '11': 'M',
                        '12': 'N', '13': 'O', '14': 'P', '15': 'Q', '16': 'R', '17': 'S',
                        '18': 'T', '19': 'U', '20': 'V', '21': 'W', '22': 'X', '23': 'Y'
                    };
                    this.asl_classes = Object.values(this.customClassNames);
                } else if (modelType === 'number') {
                    this.asl_classes = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
                }
            }
            
            return true;
        }
        
        console.error(`Failed to switch to ${modelType} model`);
        return false;
    }

    getModelType() {
        if (this.clientSideClassifier) {
            return this.clientSideClassifier.getCurrentModelType();
        }
        return null;
    }

    isClientSideProcessing() {
        return this.useClientSideProcessing && 
            this.clientSideClassifier && 
            this.clientSideClassifier.isModelLoaded;
    }
    
    processMediaPipeResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            // No hands detected
            this.handlePredictionResult({ prediction: 'No gesture', confidence: 0 });
            return;
        }

        try {
            // Extract landmarks and handedness
            const handsData = [];
            
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i];
                
                handsData.push({
                    label: handedness.label,
                    landmarks: landmarks.map(lm => ({
                        x: lm.x,
                        y: lm.y, 
                        z: lm.z
                    })),
                    confidence: handedness.score
                });
            }
            
            // Process based on configuration
            if (this.useClientSideProcessing && this.clientSideClassifier) {
                const result = this.clientSideClassifier.predict(handsData);
                this.handlePredictionResult(result);
            } else {
                // Server-side processing (original method)
                this.sendLandmarksToServer(handsData);
            }
            
            this.drawLandmarks(this.formatLandmarksForDisplay(results.multiHandLandmarks));
            
        } catch (error) {
            console.error('Error processing MediaPipe results:', error);
        }
    }

    // above or below game

    generateAboveBelowTarget() {
        // Get current classes based on model type
        const classes = this.asl_classes;
        const maxIndex = classes.length - 1;
        
        // Select a base letter/number that allows for movement
        let baseIndex;
        let direction;
        let steps;
        
        // Keep trying until we find a valid combination
        do {
            baseIndex = Math.floor(Math.random() * classes.length);
            direction = Math.random() < 0.5 ? 'up' : 'down'; // up = right arrows, down = left arrows

            const maxSteps = this.asl_classes.includes('1') ? 5 : 3;
            steps = Math.floor(Math.random() * maxSteps) + 1;
            
            // Check if target would be valid
            const targetIndex = direction === 'up' ? baseIndex + steps : baseIndex - steps;
            
            // Valid if target is within bounds
            if (targetIndex >= 0 && targetIndex <= maxIndex) {
                break;
            }
        } while (true);
        
        return {
            base: classes[baseIndex],
            direction: direction,
            steps: steps,
            target: classes[direction === 'up' ? baseIndex + steps : baseIndex - steps]
        };
    }
}