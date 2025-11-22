let detector;
let allCamerasReady = false;
let gameTypeSelected = false;
let participate = true;
let socketio;
let gamemodeindex = 0;
let gametime = 1000;
let selectedGameTime = 30;
let gameduration;
let gameTimerInterval = null;
let isGameEnding = false;
let skipsRemaining = 2;
let selectedLearningMaterial = 'alphabet'; // learning material as in model na gagamitin

// movement
let motionClassifier = null;
let motionBuffer = [];
let isCapturingMotion = false;
let motionFrameInterval = null;

const gamemodeimages = [
    '/static/images/gm_timestarts.png',
    '/static/images/gm_fillintheblanks.png', 
    '/static/images/gm_aboveorbelow.png'
];

const gamemodenames = ['Timer Starts', 'Fill in the Blanks', 'Above or Below'];

window.addEventListener('DOMContentLoaded', () => {    
    if (window.isRoomCreator) {
        const overlay = document.getElementById('creator-participate');
        if (overlay) {
            updategamemodeimage();
            overlay.style.display = 'flex';
        }
    }

    const messageInput = document.getElementById('message');
    if (messageInput) {
        messageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Initialize detector with CLIENT-SIDE processing for rooms
    detector = new SignLanguageDetector({
        isRoomMode: true,
        enableGameLogic: true,
        useClientSideProcessing: true,
        enableFpsCounter: false,
        processingInterval: 300,
        participate: participate,
        gameMode: 'time_starts',
        onCameraStart: function() {
            console.log('Camera started in room mode');
        },
        onCameraStop: function() {
            console.log('Camera stopped in room mode');
        },
        onProcessingStart: function() {
            console.log('Processing started in room mode - CLIENT SIDE!');
        },
        onProcessingStop: function() {
            console.log('Processing stopped in room mode');
        }
    });

    socketio = detector.socketio;
    socketio.emit('join_room', { room: ROOM_CODE, name: USERNAME });

    updateSkipButton();

    setupRoomSocketHandlers();
});

function setupRoomSocketHandlers() {
    // Chat messages
    socketio.on('message', (data) => {
        createmessage(data.name, data.message, data.type || 'normal');
    });

    // Room management
    socketio.on('participants_updated', function(data) {
        updateParticipantsList(data.participants);
    });

    // Camera readiness (for game start only)
    socketio.on('camera_status_update', function(data) {
        updateCameraStatusDisplay(data);
    });

    socketio.on('all_cameras_ready', function() {
        allCamerasReady = true;
        tryEnableStartGameButton();
    });

    socketio.on('waiting_for_cameras', function(data) {
        if (window.isRoomCreator && startGameButton) {
            startGameButton.disabled = true;
            startGameButton.textContent = `Waiting for cameras (${data.ready}/${data.total})`;
            startGameButton.style.backgroundColor = '#FFA500';
        }
    });

    // Game synchronization events
    socketio.on('game_type_set', async (data) => {
        display_gamemode.textContent = '';
        selectedGameTime = data.duration;
        display_gamemode.style.backgroundImage = `url(${gamemodeimages[data.gamemode_index]})`;
        gameTypeSelected = true;
        document.getElementById('game-type-display').innerText = `${data.type}`;
        timer_div.textContent = data.duration + 's';
        gameduration = data.duration;
        document.getElementById('game-type-display').style.fontSize = "2rem";
        
        if (data.learning_material) {
            selectedLearningMaterial = data.learning_material;
            console.log(`Game will use ${selectedLearningMaterial} model`);
        }
        
        if (detector && detector.clientSideClassifier) {
            console.log(`Loading ${selectedLearningMaterial} model for participant...`);
            const success = await detector.setModelType(selectedLearningMaterial);
            
            if (success) {
                console.log(`Participant loaded ${selectedLearningMaterial} model successfully`);
                
                if (selectedLearningMaterial === 'number') {
                    detector.asl_classes = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
                    console.log('Participant using numbers as target classes');
                } else if (selectedLearningMaterial === 'alphabet') {
                    detector.customClassNames = {
                        '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'F',
                        '6': 'G', '7': 'H', '8': 'I', '9': 'K', '10': 'L', '11': 'M',
                        '12': 'N', '13': 'O', '14': 'P', '15': 'Q', '16': 'R', '17': 'S',
                        '18': 'T', '19': 'U', '20': 'V', '21': 'W', '22': 'X', '23': 'Y'
                    };
                    detector.asl_classes = Object.values(detector.customClassNames);
                    console.log('Participant using alphabet as target classes');
                }
                
                if (detector.config.enableGameLogic) {
                    // Initialize based on game mode
                    const gameModeMap = {
                        'Timer Starts': 'time_starts',
                        'Fill in the Blanks': 'fill_blanks',
                        'Above or Below': 'above_below'
                    };
                    
                    const gameMode = gameModeMap[data.type];
                    
                    if (gameMode === 'time_starts') {
                        detector.targetletter = detector.asl_classes[Math.floor(Math.random() * detector.asl_classes.length)];
                    } else if (gameMode === 'above_below') {
                        detector.aboveBelowData = detector.generateAboveBelowTarget();
                    }
                    
                    detector.updateGameUI();
                    console.log(`Initial target set for ${gameMode}`);
                }
                
            } else {
                console.error(`Participant failed to load ${selectedLearningMaterial} model`);
                alert(`Warning: Could not load ${selectedLearningMaterial} model`);
            }
        }
        
        // Set the game mode in detector
        const gameModeMap = {
            'Timer Starts': 'time_starts',
            'Fill in the Blanks': 'fill_blanks',
            'Above or Below': 'above_below'
        };
        
        if (detector && gameModeMap[data.type]) {
            await detector.setGameMode(gameModeMap[data.type]);
        }
        
        tryEnableStartGameButton();
    });

    socketio.on('display_game_instruction', function(data) {
        displayGameInstruction(data.imageName, data.gameType);
    });

    socketio.on('start_game_countdown', function(){
        game_countdown.style.position = 'fixed';
        game_countdown.style.display = 'flex';
        let gcountdowntime = 3;
        game_countdown.textContent = gcountdowntime;
        const gcountdowninterval = setInterval(() =>{
            gcountdowntime--
            if(gcountdowntime <= 0){
                clearInterval(gcountdowninterval);
                game_countdown.style.display = 'none';
                game_countdown.style.position = 'none';
                socketio.emit('start_actual_game');
            }
            else {
            game_countdown.textContent = gcountdowntime;
            }
        }, 1000);
    });

    socketio.on('start_game_signal', function () {
        const stopBtn = document.getElementById('stopBtn');
        
        isGameEnding = false;
        skipsRemaining = 2; // Reset skips at game start
        updateSkipButton();
        
        if (!participate) {
            document.getElementById('leaderboard').style.display = 'flex';
            btn_closeleaderboard.disabled = true;
            btn_closeleaderboard.style.opacity = '0.6';
        }

        if (stopBtn) stopBtn.disabled = true;
        
        // Reset game state
        detector.resetScore();
        detector.startGame();
        detector.startProcessing();

        let timeLeft = selectedGameTime;
        timer_div.textContent = `${timeLeft}s`;
        if(waiting_to_start){
            document.querySelector('.waiting_text').textContent = "Game On Progress";
            waiting_to_start.style.backgroundColor = '#4CAF50';
        }

        if (gameTimerInterval) {
            clearInterval(gameTimerInterval);
        }

        // timer
        gameTimerInterval = setInterval(() => {
            timeLeft--;
            timer_div.textContent = `${timeLeft}s`;
            
            if (timeLeft <= 0) {
                clearInterval(gameTimerInterval);
                gameTimerInterval = null;
                
                if (isGameEnding) return;
                isGameEnding = true;
                
                endGameCleanup();
            }
        }, 1000);
    }); 

    // Leaderboard updates
    socketio.on('leaderboard_update', function(data) {
        const list = document.getElementById('leaderboard-list');
        const existingRows = list.getElementsByClassName('leaderboard-row');

        let found = false;

        for (let row of existingRows) {
            const usernameSpan = row.querySelector('.username');
            if (usernameSpan && usernameSpan.textContent === data.username) {
                const scoreSpan = row.querySelector('.score');
                scoreSpan.textContent = data.score;
                found = true;
                break;
            }
        }

        if (!found) {
            const newRow = document.createElement('div');
            newRow.className = 'leaderboard-row';
            newRow.innerHTML = `
                <span class="username">${data.username}</span>
                <span class="score">${data.score}</span>
            `;
            list.appendChild(newRow);
        }
    });

    // Room deletion
    socketio.on('room_deleted_by_creator', function(data) {
        console.log('Room deleted by creator:', data.message);
        
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div class="notif-leave">
                <h3>🚪 Room Closed</h3>
                <p>${data.message}</p>
                <button onclick="this.parentElement.parentElement.remove(); window.location.href = '${window.location.origin}/home/';" 
                        style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    OK
                </button>
            </div>
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
            `;        
        if (detector) {
            detector.stopCamera();
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            window.location.href = `${window.location.origin}/home/`;
        }, 5000);
    });
}

function endGameCleanup() {
    detector.stopProcessing();
    
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) stopBtn.disabled = false;
    
    skipsRemaining = 2;
    updateSkipButton();

    alert("Time's up!");
    
    if (participate) {
        document.getElementById('leaderboard').style.display = 'flex';
    }
    
    if (display_gamemode) {
        display_gamemode.style.pointerEvents = "auto";
        display_gamemode.style.opacity = "1";
        display_gamemode.style.cursor = "pointer";
    }
    
    if (startGameButton && window.isRoomCreator) {
        startGameButton.disabled = false;
    }

    if(waiting_to_start){
        waiting_to_start.style.display = 'inline-flex';
        document.querySelector('.waiting_text').textContent = "Waiting to start";
        waiting_to_start.style.backgroundColor = '#7153A4';
    }
    
    timer_div.textContent = gameduration + 's';
    btn_closeleaderboard.disabled = false;
    btn_closeleaderboard.style.opacity = "1";
    
    const finalScore = detector.getScore();
    socketio.emit('end_game', { final_score: finalScore });
}

const messages = document.getElementById("messages");
const startGameButton = document.getElementById('startgameBtn');
const gamemodediv = document.querySelector('.gamemode');
const btn_prev = document.getElementById('btn_prev');
const btn_next = document.getElementById('btn_next');
const modenamediv = document.querySelector('.modename');
const btn_close = document.querySelector('.btn_close');
const btn_confirm = document.querySelector('.btn_confirm');
const timer_div = document.querySelector('.timer_display');
const sendButton = document.getElementById("send_btn");
const display_gamemode = document.querySelector('.display_gamemode');
const waiting_to_start = document.querySelector('.waiting_to_start');
const game_countdown = document.getElementById('game-countdown');
const participants_container = document.querySelector('.participants-container'); 
const btn_closeleaderboard = document.querySelector('.btn_closeleaderboard');
const selectModelDropdown = document.getElementById('select-model');
const gameTimeSelect = document.getElementById('game-time');

// Room-specific functions
function updategamemodeimage() {
    gamemodediv.style.backgroundImage = `url(${gamemodeimages[gamemodeindex]})`;
    modenamediv.textContent = gamemodenames[gamemodeindex];
}

btn_next.addEventListener('click', function(e) {
    gamemodeindex = (gamemodeindex + 1) % gamemodeimages.length;
    updategamemodeimage();
});

btn_prev.addEventListener('click', function(e) {
    gamemodeindex = (gamemodeindex - 1 + gamemodeimages.length) % gamemodeimages.length;
    updategamemodeimage();
});

function handleConfirmButton() {
    // check if learning material is selected
    if (!selectedLearningMaterial || selectedLearningMaterial === '' || selectModelDropdown.value === '') {
        alert('ERROR: Please select a learning material (Alphabet or Numbers)');
        return false;
    }
    
    // check if game time is selected
    const gameTimeValue = gameTimeSelect.value;
    if (!gameTimeValue || gameTimeValue === '') {
        alert('ERROR: Please select a game time');
        return false;
    }
    selectedGameTime = parseInt(gameTimeValue);
    
    const participateRadio = document.getElementById('flexRadioDefault1');
    const notParticipateRadio = document.getElementById('flexRadioDefault2');
    
    // check if participation is selected
    if (!participateRadio.checked && !notParticipateRadio.checked) {
        alert('ERROR: Please select whether you want to participate or not');
        return false;
    }
    
    // check learning material & game mode compatibility
    const selectedGameType = modenamediv.textContent;
    const isTimerStartsOrAboveBelow = selectedGameType === 'Timer Starts' || 
                                       selectedGameType === 'Above or Below' || 
                                       gamemodeindex === 0 || 
                                       gamemodeindex === 2;
    
    if ((selectedLearningMaterial === 'number') && !isTimerStartsOrAboveBelow) {
        alert(`ERROR: ${selectedLearningMaterial.charAt(0).toUpperCase() + selectedLearningMaterial.slice(1)} only supports "Timer Starts" and "Above or Below" game modes!\n\nPlease select one of these modes before confirming.`);
        return false;
    }
    
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (participateRadio.checked) {
        participate = true;
        socketio.emit('creator_participation', { participates: true });
        detector.setParticipation(true);
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = false;
        socketio.emit('camera_stopped');
        updateSkipButton();
        console.log('User chose to participate');
    } else if (notParticipateRadio.checked) {
        participate = false;
        socketio.emit('creator_participation', { participates: false });
        detector.setParticipation(false);
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
        updateSkipButton();
        if (detector.stream) {
            detector.stream.getTracks().forEach(track => track.stop());
            detector.stream = null;
        }
        if (detector.elements.videoElement) {
            detector.elements.videoElement.srcObject = null;
        }

        if (stopBtn) {
            stopBtn.className = "btn";
            stopBtn.textContent = "Start Camera";
            stopBtn.disabled = true;
            stopBtn.id = "startBtn";
        }
 
        socketio.emit('camera_ready');
        console.log('User chose not to participate');
    }
    
    let selectedType = modenamediv.textContent;

    socketio.emit('set_game_type_and_time', { 
        type: selectedType,
        duration: selectedGameTime,
        gamemode_index: gamemodeindex,
        learning_material: selectedLearningMaterial
    });
    
    document.getElementById('creator-participate').style.display = 'none';
    console.log('Settings confirmed:', {
        participate: participate,
        gameTime: selectedGameTime,
        gameType: selectedType,
        learningMaterial: selectedLearningMaterial
    });
    
    // instruction
    showGameInstruction(selectedType);
    
    return true;
}

function showGameInstruction(gameType) {
    const instructionImages = {
        'Timer Starts': 'timerstarts_instruction.png',
        'Fill in the Blanks': 'fillintheblanks_instruction.png',
        'Above or Below': 'aboveorbelow_instruction.png'
    };
    
    const imageName = instructionImages[gameType];
    
    if (!imageName) {
        console.error('No instruction image found for game type:', gameType);
        return;
    }
    
    socketio.emit('show_game_instruction', { 
        imageName: imageName,
        gameType: gameType 
    });
    
    // show instruction to creatortoo
    displayGameInstruction(imageName, gameType);
}

function displayGameInstruction(imageName, gameType) {
    const instructionDiv = document.getElementById('gameinstruction');
    
    if (!instructionDiv) {
        console.error('Game instruction div not found');
        return;
    }
    
    // Create instruction overlay
    instructionDiv.innerHTML = `
        <div class="instruction-overlay">
            <div class="instruction-content">
                <img src="/static/images/${imageName}" alt="${gameType} instruction" class="instruction-image">
                <button class="instruction-close-btn" onclick="closeGameInstruction()">Got it!</button>
            </div>
        </div>
    `;
    
    instructionDiv.style.display = 'block';
    
    // Auto-close after 10 seconds
    setTimeout(() => {
        closeGameInstruction();
    }, 50000);
}

function closeGameInstruction() {
    const instructionDiv = document.getElementById('gameinstruction');
    if (instructionDiv) {
        instructionDiv.style.display = 'none';
        instructionDiv.innerHTML = '';
    }
}

// Other room functions
function openparticipants() {
    participants_container.style.display = 'flex';
}

function closeparticipants() {
    participants_container.style.display = 'none';
}

btn_close.addEventListener('click', () => {
    document.getElementById('creator-participate').style.display = 'none';
});

if (btn_confirm) {
    
    btn_confirm.removeEventListener('click', handleConfirmButton); // Remove old listeners
    btn_confirm.addEventListener('click', handleConfirmButton); // Add new listener
}

function openGameModeOverlay() {
    if (window.isRoomCreator) {
        const overlay = document.getElementById('creator-participate');
        if (overlay) {
            updategamemodeimage();
            overlay.style.display = 'flex';
        }
    }
}

function closeLeaderboard() {
    document.getElementById('leaderboard').style.display = 'none';
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
}

function updateParticipantsList(participants) {
    const participantList = document.getElementById('participantList');
    participantList.innerHTML = '';
    
    participants.forEach(function(participant) {
        const listItem = document.createElement('li');
        listItem.className = 'participant-item';
        
        const img = document.createElement('img');
        img.src = `/static/${participant.profile_picture}`;
        img.alt = 'pfp';
        img.className = 'participant-pfp';
        
        const span = document.createElement('span');
        span.className = 'participant-name';
        span.textContent = participant.username;
        
        listItem.appendChild(img);
        listItem.appendChild(span);
        participantList.appendChild(listItem);
    });
}

// Chat functions
function sendMessage() {
    const message = document.getElementById("message");
    if (message.value == "") return;
    socketio.emit("message", {
        room: ROOM_CODE,
        name: USERNAME,
        data: message.value
    });
    message.value = "";
};

function tryEnableStartGameButton() {
    if (window.isRoomCreator && allCamerasReady && gameTypeSelected && startGameButton) {
        startGameButton.disabled = false;
        startGameButton.textContent = 'Start Game (All Ready!)';
        startGameButton.style.backgroundColor = '#4CAF50';
    }
}

function startGame() {
    socketio.emit('start_game');
    if (display_gamemode) {
        display_gamemode.style.pointerEvents = "none";
        display_gamemode.style.opacity = "0.6";
        display_gamemode.style.cursor = "default";
    }
}

function updateCameraStatusDisplay(data) {
    allCamerasReady = data.ready === data.total && data.total > 0;

    const statusdiv = document.getElementById('camera-status');
    if (statusdiv) {
        statusdiv.textContent = `${data.ready}/${data.total} cameras ready`;
    }
    tryEnableStartGameButton();
}

function updateSkipButton() {
    const skipBtn = document.querySelector('.skip');
    if (!skipBtn) return;
    
    if (!participate) {
        skipBtn.style.display = 'none';
    } else {
        skipBtn.style.display = 'block';
        skipBtn.textContent = `Skip = ${skipsRemaining}`;
        
        if (skipsRemaining === 0) {
            skipBtn.disabled = true;
            skipBtn.style.opacity = '0.5';
            skipBtn.style.cursor = 'not-allowed';
        } else {
            skipBtn.disabled = false;
            skipBtn.style.opacity = '1';
            skipBtn.style.cursor = 'pointer';
        }
    }
}

function skip() {
    if (skipsRemaining > 0 && participate) {
        skipsRemaining--;
        updateSkipButton();
        
        if (detector) {
            if (detector.gameMode === 'time_starts') {
                detector.generateNewTarget();
            } else if (detector.gameMode === 'fill_blanks') {
                detector.skipFillBlanks();
            } else if (detector.gameMode === 'above_below') {
                detector.skipAboveBelow();
            }
        }
    }
}

function exitroom() {  
    if (window.isRoomCreator) {
        console.log('Room creator leaving - room will be deleted');
        socketio.emit('room_creator_leaving');
        
        setTimeout(() => {
        if (detector) {
            detector.stopCamera();
        }
        try {
            socketio.disconnect();
            window.location.href = `${window.location.origin}/home/`;
        } catch (error) {
            console.error('Error during disconnect:', error);
            window.location.href = `${window.location.origin}/home/`;
        }
        }, 100);
    } else {
        if (detector) {
            detector.stopCamera();
        }
        try {
            socketio.disconnect();
            window.location.href = `${window.location.origin}/home/`;
        } catch (error) {
            console.error('Error during disconnect:', error);
            window.location.href = `${window.location.origin}/home/`;
        }
    }
}

if (startGameButton) {
    startGameButton.addEventListener('click', function() {
        console.log('Start game button clicked, isRoomCreator:', window.isRoomCreator);
        startGameButton.disabled = true;
        startGame();
    });
}

if (selectModelDropdown) {
    selectModelDropdown.addEventListener('change', async function(event) {
        selectedLearningMaterial = event.target.value;
        console.log(`Learning material selected: ${selectedLearningMaterial}`);
        
        if (selectedLearningMaterial === 'number') {
            // Force Timer Starts gamemode
            gamemodeindex = 0;
            updategamemodeimage();
        }
        
        // Pre-load the model when creator selects it
        if (detector && detector.clientSideClassifier) {
            const success = await detector.setModelType(selectedLearningMaterial);
            
            if (success) {
                console.log(`${selectedLearningMaterial} model pre-loaded successfully`);
                showModelLoadedNotification(selectedLearningMaterial);
                console.log("Emitting learning material:", selectedLearningMaterial);
                socketio.emit('set_learning_material', {learningMaterial: selectedLearningMaterial });
            } else {
                console.error(`Failed to pre-load ${selectedLearningMaterial} model`);
                alert(`Failed to load ${selectedLearningMaterial} model. Please check that the model file exists at /static/models/${selectedLearningMaterial}/asl_randomforest.json`);
                selectModelDropdown.value = ''; // Reset dropdown
                selectedLearningMaterial = 'alphabet'; // Reset to default
            }
        } else {
            console.error('Detector or classifier not available yet');
        }
    });
}

function showModelLoadedNotification(modelType) {
    const notification = document.createElement('div');
    notification.className = 'model-notification';
    
    const modelDisplay = modelType.charAt(0).toUpperCase() + modelType.slice(1);
    notification.textContent = `${modelDisplay} model loaded`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('hide');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);
}


// Cleanup
window.addEventListener('beforeunload', function() {
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
    }
    
    if (window.isRoomCreator && socketio && socketio.connected) {
        socketio.emit('room_creator_leaving');
    }
    
    if (detector) {
        detector.stopCamera();
    }
});