// Initialize Socket.IO connection
const socket = io();

// Get DOM elements
const videoElement = document.getElementById('videoElement');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const toggleProcessingBtn = document.getElementById('toggleProcessing');
const statusDiv = document.getElementById('status');
const predictionDiv = document.getElementById('prediction');
const confidenceDiv = document.getElementById('confidence');
const confidenceBar = document.getElementById('confidenceBar');
const fpsCounter = document.getElementById('fpsCounter');

// State variables
let stream = null;
let isProcessing = false;
let processingInterval = null;
let frameCount = 0;
let lastFpsTime = Date.now();

socket.on('status', function(data) {
    statusDiv.textContent = data.message + (data.model_loaded ? ' (Model Ready)' : ' (Demo Mode)');
    statusDiv.className = 'status connected';
    if (!data.model_loaded) {
        statusDiv.textContent += ' - Place model_alphabetc.p file in server directory';
    }
});

socket.on('prediction_result', function(data) {
    predictionDiv.textContent = data.prediction;
    const confidencePercent = Math.round(data.confidence * 100);
    confidenceDiv.textContent = confidencePercent + '%';
    confidenceBar.style.width = confidencePercent + '%';

    // Draw hand landmarks if available
    if (data.landmarks && data.landmarks.length > 0) {
        drawLandmarks(data.landmarks);
    }

    // Update FPS counter
    updateFPS();
});

socket.on('error', function(data) {
    console.error('Server error:', data.message);
    statusDiv.textContent = 'Error: ' + data.message;
    statusDiv.className = 'status disconnected';
});

// Camera functions
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        videoElement.srcObject = stream;

        videoElement.onloadedmetadata = function() {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
        };

        startBtn.disabled = true;
        stopBtn.disabled = false;
        toggleProcessingBtn.disabled = false;

        console.log('Camera started successfully');
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access camera. Please ensure camera permissions are granted.');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    videoElement.srcObject = null;
    stopProcessing();

    startBtn.disabled = false;
    stopBtn.disabled = true;
    toggleProcessingBtn.disabled = true;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    console.log('Camera stopped');
}

function startProcessing() {
    console.log('startProcessing called');
    if (!stream) {
        alert('Please start the camera first');
        return;
    }

    isProcessing = true;
    toggleProcessingBtn.textContent = 'Stop Detection';
    toggleProcessingBtn.classList.add('processing');

    // Send frames to server for processing
    processingInterval = setInterval(() => {
        captureAndSendFrame();
    }, 33); // Send frame every 100ms (10 FPS)

    console.log('Processing started');
}

function stopProcessing() {
    isProcessing = false;
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
    }

    toggleProcessingBtn.textContent = 'Start Detection';
    toggleProcessingBtn.classList.remove('processing');

    // Clear results
    predictionDiv.textContent = 'No gesture';
    confidenceDiv.textContent = '0%';
    confidenceBar.style.width = '0%';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    console.log('Processing stopped');
}

function captureAndSendFrame() {
    console.log('Sending frame to server');
    if (!videoElement.videoWidth || !videoElement.videoHeight) return;

    // Create a temporary canvas to capture the frame
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = videoElement.videoWidth;
    tempCanvas.height = videoElement.videoHeight;

    // Draw the video frame (flip horizontally to match the mirrored video)
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(videoElement, -tempCanvas.width, 0);

    // Convert to base64 and send to server
    const imageData = tempCanvas.toDataURL('image/jpeg', 0.8);
    socket.emit('process_frame', { image: imageData });
}

function drawLandmarks(landmarks) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    landmarks.forEach(hand => {
        const points = hand.points;
        const connections = hand.connections;

        // Draw connections
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.beginPath();

        connections.forEach(([start, end]) => {
            const startPoint = points[start];
            const endPoint = points[end];

            const startX = startPoint[0] * canvas.width;
            const startY = startPoint[1] * canvas.height;
            const endX = endPoint[0] * canvas.width;
            const endY = endPoint[1] * canvas.height;

            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
        });

        ctx.stroke();

        // Draw landmarks
        ctx.fillStyle = '#FF0000';
        points.forEach(point => {
            const x = point[0] * canvas.width;
            const y = point[1] * canvas.height;

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    });
}

function updateFPS() {
    frameCount++;
    const now = Date.now();
    if (now - lastFpsTime >= 1000) {
        const fps = Math.round(frameCount * 1000 / (now - lastFpsTime));
        fpsCounter.textContent = `FPS: ${fps}`;
        frameCount = 0;
        lastFpsTime = now;
    }
}

// Event listeners
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
toggleProcessingBtn.addEventListener('click', function() {
    if (isProcessing) {
        stopProcessing();
    } else {
        startProcessing();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    stopCamera();
});

console.log('Sign Language Detection App Initialized');