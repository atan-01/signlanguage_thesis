from flask import session, current_app, request, jsonify
from flask_socketio import emit, join_room, leave_room, send
import numpy as np

import time
import cv2
import base64
import io
from PIL import Image

def get_user_by_id(user_id, supabase_client):
    """Get user by ID from Supabase"""
    try:
        result = supabase_client.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

def get_user_by_username(username, supabase_client):
    """Get user by username from Supabase"""
    try:
        result = supabase_client.table('users').select('*').eq('username', username).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by username: {e}")
        return None

def get_participants_with_profiles(participants, supabase):
    """Get participant data with profile pictures"""
    participants_data = []
    for participant_username in participants:
        user_data = get_user_by_username(participant_username, supabase)
        if user_data:
            participants_data.append({
                'username': participant_username,
                'profile_picture': user_data.get('profile_picture')
            })
        else:
            participants_data.append({
                'username': participant_username,
                'profile_picture': None
            })
    return participants_data

def normalize_hand_landmarks(landmarks):
    """Normalize landmarks relative to wrist position and hand scale (same as training)"""
    coords = np.array([[lm['x'], lm['y'], lm['z']] for lm in landmarks])
    
    # Use wrist as center (landmark 0)
    center = coords[0]
    coords = coords - center
    
    # Calculate scale using distance from wrist to middle finger MCP (landmark 9)
    scale = np.linalg.norm(coords[9] - coords[0])
    if scale > 0:
        coords = coords / scale
    
    return coords

def flatten_hand_with_features(hand):
    """Extract both raw coordinates and engineered features (same as training)"""
    landmarks = hand['landmarks']
    coords = normalize_hand_landmarks(landmarks)
    
    raw_features = coords.flatten()
    
    # Engineered features
    additional_features = []
    
    # Distance features (key finger distances)
    key_points = {
        'wrist': 0, 'thumb_tip': 4, 'index_tip': 8, 
        'middle_tip': 12, 'ring_tip': 16, 'pinky_tip': 20
    }
    
    # Distances from wrist to fingertips
    wrist = coords[0]
    for name, idx in key_points.items():
        if name != 'wrist':
            dist = np.linalg.norm(coords[idx] - wrist)
            additional_features.append(dist)
    
    # Inter-finger distances
    finger_tips = [4, 8, 12, 16, 20]
    for i in range(len(finger_tips)-1):
        for j in range(i+1, len(finger_tips)):
            dist = np.linalg.norm(coords[finger_tips[i]] - coords[finger_tips[j]])
            additional_features.append(dist)
    
    # Hand span and orientation features
    x_coords = coords[:, 0]
    y_coords = coords[:, 1]
    hand_width = np.max(x_coords) - np.min(x_coords)
    hand_height = np.max(y_coords) - np.min(y_coords)
    additional_features.extend([hand_width, hand_height])
    
    return np.concatenate([raw_features, additional_features])

def process_landmarks_for_prediction(hands_data):
    """Process landmark data for model prediction (same as training)"""
    if not hands_data or len(hands_data) == 0:
        return None
        
    processed_data = []
    
    try:
        if len(hands_data) == 1:
            # Single hand
            hand = hands_data[0]
            features = flatten_hand_with_features(hand)
            # Pad for missing second hand (zeros)
            padding_size = len(features)
            features = np.concatenate([features, np.zeros(padding_size)])
            
        elif len(hands_data) == 2:
            # Two hands - maintain consistent order
            hand1, hand2 = hands_data[0], hands_data[1]
            
            # Sort by hand label for consistency (Left first, then Right)
            if hand1['label'] == 'Right' and hand2['label'] == 'Left':
                left_features = flatten_hand_with_features(hand2)
                right_features = flatten_hand_with_features(hand1)
            else:
                left_features = flatten_hand_with_features(hand1)
                right_features = flatten_hand_with_features(hand2)
            
            features = np.concatenate([left_features, right_features])
        else:
            return None
        
        # Validate feature vector
        if np.any(np.isnan(features)) or np.any(np.isinf(features)):
            return None
            
        return features.reshape(1, -1)  # Reshape for model prediction
        
    except Exception as e:
        print(f"Error processing landmarks: {e}")
        return None

def init_all_socketio_events(socketio, supabase, detector=None):
    """Initialize all SocketIO event handlers"""
    
    from home import rooms, game_states
    
    @socketio.on('connect')
    def handle_connect():
        user_id = session.get('user_id')
        room = session.get('room')
        
        print(f"CONNECT: User {user_id}, Session ID: {request.sid}, Room: {room}")
        
        if not user_id:
            print(f"No user_id in session for {request.sid}")
            return False

        if not user_id:
            return False
            
        user_data = get_user_by_id(user_id, supabase)
        if not user_data:
            return False

        # Check if game is ongoing
        if room and game_states.get(room, {}).get("ongoing", False):
            emit("connection_denied", {"reason": "Game already in progress"})
            return False
        
        model_loaded = detector.model_loaded if detector else False
        emit('status', {'message': 'Connected - Server processing available', 'model_loaded': model_loaded})

    @socketio.on('disconnect')
    def handle_disconnect():
        name = session.get('name')
        room = session.get('room')
        user_id = session.get('user_id')
        is_creator = session.get('created', False)
        
        if hasattr(handle_process_fsl_frame, 'user_buffers'):
            if user_id in handle_process_fsl_frame.user_buffers:
                del handle_process_fsl_frame.user_buffers[user_id]

        if not name:
            return
        
        if room and room in rooms:
            if is_creator:
                emit('room_deleted_by_creator', {
                    'message': f'Room has been closed by creator {name}'
                }, room=room)
                
                del rooms[room]
                print(f"Room {room} deleted due to creator {name} disconnecting")
                return
            
            leave_room(room)
            rooms[room]["members"] -= 1
            
            if user_id and "camera_status" in rooms[room] and user_id in rooms[room]["camera_status"]:
                del rooms[room]["camera_status"][user_id]

            if name in rooms[room].get("participants", []):
                rooms[room]["participants"].remove(name)
                
                participants_with_profiles = get_participants_with_profiles(rooms[room]["participants"], supabase)
                emit('participants_updated', {
                    'participants': participants_with_profiles
                }, room=room)
            
            check_camera_readiness(room, rooms)
            
            if rooms[room]["members"] <= 0:
                del rooms[room]
            
            send({"name": name, "message": "has left the room"}, to=room)
        
        print(f'User {name} disconnected')

    # ===== ROOM MANAGEMENT EVENTS =====
    
    @socketio.on('join_room')
    def handle_join(data):
        room = data.get("room")
        name = data.get("name")

        if room not in rooms:
            return
        
        session["room"] = room
        session["name"] = name
        join_room(room)

        if name not in rooms[room].get("participants", []):
            rooms[room].setdefault("participants", []).append(name)

        rooms[room]["members"] += 1

        user_id = session.get('user_id')
        if "camera_status" not in rooms[room]:
            rooms[room]["camera_status"] = {}
        rooms[room]["camera_status"][user_id] = {
            "username": name,
            "camera_ready": False
        }

        participants_with_profiles = get_participants_with_profiles(rooms[room]["participants"], supabase)
        emit('participants_updated', {'participants': participants_with_profiles}, room=room)

        send({"name": name, "message": "has entered the room"}, to=room)
        check_camera_readiness(room, rooms)

        model_loaded = detector.model_loaded if detector else False
        emit('status', {'message': 'Connected - Server processing', 'model_loaded': model_loaded}, to=request.sid)

        # Send game settings to new joiner (including learning material)
        game_type = rooms[room].get('game_type')
        duration = rooms[room].get('duration', 30)
        gamemode_index = rooms[room].get('gamemode_index')
        learning_material = rooms[room].get('learning_material', 'alphabet')

        if game_type:
            emit('game_type_set', {
                'type': game_type,
                'duration': duration,
                'gamemode_index': gamemode_index,
                'learning_material': learning_material
            }, to=request.sid)

    @socketio.on('message')
    def handle_message(data):
        room = data.get("room")
        name = data.get("name")
        msg = data.get("data")

        if not room or room not in rooms:
            return

        content = {"name": name, "message": msg}
        send(content, to=room)
        rooms[room]["messages"].append(content)

    # ===== CAMERA STATUS EVENTS =====
    
    @socketio.on('camera_ready')
    def handle_camera_ready():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return
            
        if "camera_status" not in rooms[room]:
            rooms[room]["camera_status"] = {}
            
        rooms[room]["camera_status"][user_id]["camera_ready"] = True
        check_camera_readiness(room, rooms)

    @socketio.on('camera_stopped')
    def handle_camera_stopped():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return
            
        if "camera_status" in rooms[room] and user_id in rooms[room]["camera_status"]:
            rooms[room]["camera_status"][user_id]["camera_ready"] = False
            
        check_camera_readiness(room, rooms)

    # ===== GAME SYNCHRONIZATION EVENTS =====
    
    @socketio.on('set_game_type_and_time')
    def handle_game_type(data):
        room = session.get("room")
        game_type = data.get('type')
        gamemode_index = data.get('gamemode_index')
        duration = data.get('duration', 30)
        learning_material = data.get('learning_material', 'alphabet')
        
        if room and room in rooms:
            rooms[room]['game_type'] = game_type
            rooms[room]['duration'] = duration
            rooms[room]['gamemode_index'] = gamemode_index
            rooms[room]['learning_material'] = learning_material
            
            print(f"Room {room}: Game type set to {game_type}, Material: {learning_material}")
            
            emit('game_type_set', {
                'type': game_type, 
                'duration': duration, 
                'gamemode_index': gamemode_index,
                'learning_material': learning_material
            }, room=room)

    @socketio.on('start_game')
    def handle_start_game():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return
            
        if room not in game_states:
            game_states[room] = {}
            
        game_states[room]["ongoing"] = True

        camera_status = rooms[room].get("camera_status", {})
        total_users = len(camera_status)
        ready_users = sum(1 for status in camera_status.values() if status["camera_ready"])
        
        if ready_users == total_users and total_users > 0:
            rooms[room]["scores_saved"] = False
            save_game_instance_to_db(room)
            emit('start_game_countdown', room=room)
            print(f"Game started in room {room}")
        else:
            emit('error', {'message': f'Not all cameras ready. {ready_users}/{total_users} ready.'})
    
    @socketio.on("start_actual_game")
    def start_actual_game():
        room = session.get('room')
        emit('start_game_signal', room=room)

    @socketio.on('creator_participation')
    def handle_creator_participation(data):
        room = session.get('room')
        if room and room in rooms:
            rooms[room]['creator_participated'] = data.get('participates', True)

    @socketio.on('show_game_instruction')
    def handle_show_game_instruction(data):
        room = session.get('room')
        if room:
            # Broadcast to all participants in the room except sender
            emit('display_game_instruction', {
                'gameType': data['gameType']
            }, room=room, skip_sid=request.sid)

    @socketio.on("end_game")
    def handle_end_game(data=None):
        room = session.get('room')
        user_id = session.get('user_id')

        print(f"END GAME: User {user_id} in room {room}, data: {data}")

        if room in game_states:
            game_states[room]["ongoing"] = False

            if data and 'final_score' in data:
                if "final_scores" not in rooms[room]:
                    rooms[room]["final_scores"] = {}
                rooms[room]["final_scores"][user_id] = data['final_score']

            save_game_results(room)

    @socketio.on('score_update')
    def handle_score_update(data):
        user_id = session.get('user_id')
        user_data = get_user_by_id(user_id, supabase)
        username = user_data['username'] if user_data else 'Unknown'
        room = session.get("room")
        score = data.get("score")

        if room and username:
            emit('leaderboard_update', {'username': username, 'score': score}, room=room)

    @socketio.on('room_creator_leaving')
    def handle_room_creator_leaving():
        name = session.get('name')
        room = session.get('room')
        is_creator = session.get('created', False)
        
        if not name or not room or room not in rooms or not is_creator:
            return
            
        emit('room_deleted_by_creator', {
            'message': f'The room creator "{name}" has left. Room is now closed.'
        }, room=room, include_self=False)
        
        if room in rooms:
            del rooms[room]

    # ===== practice PROCESSING EVENTS =====

    @socketio.on('set_learning_material')
    def handle_set_learning_material(data):
        room = session.get('room')
        learning_material = data.get('learningMaterial')
        print("eto yung learning material: ", learning_material)
        if room in rooms:
            rooms[room]['learning_material'] = learning_material
            print(f"Room {room}: Learning material set to {learning_material}")

###########################################################################################################
# word related socket

    @socketio.on('join_fsl_learning')
    def handle_join_fsl_learning():
        """Join FSL words learning session"""
        user_id = session.get('user_id')
        if not user_id:
            return False
        
        user_data = get_user_by_id(user_id, supabase)
        if not user_data:
            return False
        
        fsl_room = f"fsl_learning_{user_id}"
        join_room(fsl_room)
        
        # Check if FSL predictor is available
        fsl_available = hasattr(current_app, 'fsl_predictor') and current_app.fsl_predictor is not None
        
        emit('status', {
            'connected': True,
            'fsl_available': fsl_available,
            'message': 'Connected to FSL words learning' if fsl_available else 'Connected (FSL model not available)'
        })
        
        print(f"User {user_data['username']} joined FSL words learning")

    @socketio.on('leave_fsl_learning')
    def handle_leave_fsl_learning():
        """
        Cleanup when user finishes learning session
        """
        user_id = session.get('user_id')
        if user_id:
            # Clean up this user's motion buffer
            if hasattr(handle_process_fsl_frame, 'user_buffers'):
                if user_id in handle_process_fsl_frame.user_buffers:
                    del handle_process_fsl_frame.user_buffers[user_id]
            
            # Clean up frame counter
            if hasattr(handle_process_fsl_frame, 'frame_counters'):
                if user_id in handle_process_fsl_frame.frame_counters:
                    del handle_process_fsl_frame.frame_counters[user_id]
            
            # Clean up no hands counter
            if hasattr(handle_process_fsl_frame, 'no_hands_counter'):
                if user_id in handle_process_fsl_frame.no_hands_counter:
                    del handle_process_fsl_frame.no_hands_counter[user_id]
            
            print(f"Cleaned up FSL session for user {user_id}")

    @socketio.on('get_supported_signs')
    def handle_get_supported_signs():
        """Send list of supported FSL words"""
        try:
            if hasattr(current_app, 'fsl_predictor') and current_app.fsl_predictor:
                signs = current_app.fsl_predictor.class_names
            else:
                # Default list if model not loaded
                signs = ['Blue', 'Green', 'Hi-Hello', 'Orange', 'Red', 'Yellow', 
                        'Grandmother', 'Shy', 'Sad', 'Apple', 'Who', 'Which']
            
            emit('supported_signs', {'signs': signs})
            
        except Exception as e:
            print(f"Error getting supported signs: {e}")
            emit('error', {'message': 'Could not load supported signs'})

    @socketio.on('process_fsl_frame')
    def handle_process_fsl_frame(data):
        user_id = session.get('user_id')
        if not user_id:
            emit('error', {'message': 'Not authenticated'})
            return
        
        if not hasattr(current_app, 'fsl_predictor') or not current_app.fsl_predictor:
            emit('prediction_result', {
                'prediction': 'FSL model not loaded',
                'confidence': 0.0
            })
            return
        
        import time
        import cv2
        import numpy as np
        import base64
        import io
        from PIL import Image
        
        start_time = time.time()
        
        try:
            image_data = data['image'].split(',')[1]
            image_bytes = base64.b64decode(image_data)
            
            pil_image = Image.open(io.BytesIO(image_bytes))
            frame = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            
            landmarks_data = extract_fsl_landmarks_from_frame(frame)
            
            if landmarks_data:
                # Initialize motion buffer and counters for this user if not exists
                if not hasattr(handle_process_fsl_frame, 'user_buffers'):
                    handle_process_fsl_frame.user_buffers = {}
                
                if not hasattr(handle_process_fsl_frame, 'frame_counters'):
                    handle_process_fsl_frame.frame_counters = {}
                
                if user_id not in handle_process_fsl_frame.user_buffers:
                    handle_process_fsl_frame.user_buffers[user_id] = []
                    handle_process_fsl_frame.frame_counters[user_id] = 0

                # Initialize no_hands_streak tracker
                if not hasattr(handle_process_fsl_frame, 'no_hands_streak'):
                    handle_process_fsl_frame.no_hands_streak = {}
                
                # Reset no-hands streak since we detected hands
                handle_process_fsl_frame.no_hands_streak[user_id] = 0
                
                handle_process_fsl_frame.user_buffers[user_id].append(landmarks_data)
                
                if len(handle_process_fsl_frame.user_buffers[user_id]) > 30:
                    handle_process_fsl_frame.user_buffers[user_id].pop(0)
                
                buffer_size = len(handle_process_fsl_frame.user_buffers[user_id])
                
                handle_process_fsl_frame.frame_counters[user_id] += 1
                frame_count = handle_process_fsl_frame.frame_counters[user_id]
                
                # Collecting phase: show progress
                if buffer_size < 15:
                    if buffer_size % 3 == 0:  # Update every 3 frames
                        emit('prediction_result', {
                            'prediction': f'Collecting motion ({buffer_size}/15)',
                            'confidence': 0.0,
                            'processing_time': time.time() - start_time,
                            'buffer_size': buffer_size
                        })
                    return
                
                # Prediction phase: only predict every 3 frames
                if frame_count % 3 != 0:
                    return
                
                # Make prediction
                try:
                    sequence_frames = handle_process_fsl_frame.user_buffers[user_id].copy()
                    prediction_result = current_app.fsl_predictor.predict(sequence_frames)
                    processing_time = time.time() - start_time
                    
                    # Send result to client
                    result = {
                        'prediction': prediction_result['prediction'],
                        'confidence': prediction_result['confidence'] / 100.0,
                        'model_used': prediction_result.get('model_used', 'random_forest'),
                        'processing_time': processing_time,
                        'buffer_size': buffer_size,
                        'all_probabilities': prediction_result.get('all_probabilities', {})
                    }
                    
                    emit('prediction_result', result)
                    
                except Exception as e:
                    print(f"Prediction error: {e}")
                    emit('prediction_result', {
                        'prediction': 'prediction_error',
                        'confidence': 0.0,
                        'processing_time': time.time() - start_time
                    })
            else:
                #  nO HANDS DETECTED - RESET BUFFER AFTER A FEW FRAMES
                if not hasattr(handle_process_fsl_frame, 'no_hands_streak'):
                    handle_process_fsl_frame.no_hands_streak = {}
                
                if user_id not in handle_process_fsl_frame.no_hands_streak:
                    handle_process_fsl_frame.no_hands_streak[user_id] = 0
                
                handle_process_fsl_frame.no_hands_streak[user_id] += 1
                
                # After 5 consecutive frames with no hands, clear the buffer
                if handle_process_fsl_frame.no_hands_streak[user_id] >= 5:
                    if hasattr(handle_process_fsl_frame, 'user_buffers') and user_id in handle_process_fsl_frame.user_buffers:
                        old_size = len(handle_process_fsl_frame.user_buffers[user_id])
                        handle_process_fsl_frame.user_buffers[user_id] = []
                        handle_process_fsl_frame.frame_counters[user_id] = 0
                        print(f"Cleared buffer ({old_size} frames) - no hands for 5 frames")
                    
                    handle_process_fsl_frame.no_hands_streak[user_id] = 0
                
                # Only send "no hands" message every 10 frames
                if handle_process_fsl_frame.no_hands_streak[user_id] % 10 == 1:
                    emit('prediction_result', {
                        'prediction': 'No hands detected',
                        'confidence': 0.0,
                        'processing_time': time.time() - start_time
                    })
                    
        except Exception as e:
            print(f"Frame processing error: {e}")
            import traceback
            traceback.print_exc()
            emit('error', {'message': f'Frame processing failed: {str(e)}'})



###########################################################################################################

def check_camera_readiness(room, rooms):
    """Check camera readiness for game start"""
    if room not in rooms or "camera_status" not in rooms[room]:
        return
    
    camera_status = rooms[room]["camera_status"]
    total_users = rooms[room]["members"]
    ready_users = sum(1 for status in camera_status.values() if status["camera_ready"])
    
    emit('camera_status_update', {
        'total': total_users,
        'ready': ready_users,
        'users': camera_status
    }, room=room)
    
    if ready_users == total_users and total_users > 0:
        emit('all_cameras_ready', room=room)
    else:
        emit('waiting_for_cameras', {
            'ready': ready_users,
            'total': total_users
        }, room=room)
        
def save_game_results(room):
    from home import rooms
    
    if room not in rooms or "final_scores" not in rooms[room]:
        return
    
    # Check if we've already saved for this game session
    if rooms[room].get("scores_saved", False):
        return
    
    try:
        supabase = current_app.config['SUPABASE']
        
        # Check if all participants have sent their scores
        expected_participants = len(rooms[room].get("participants", []))
        actual_scores = len(rooms[room]["final_scores"])
        
        # Only save when all participants have sent scores
        if actual_scores < expected_participants:
            print(f"Waiting for more scores in room {room}")
            return
        
        # Get the most recent room record
        room_result = supabase.table('rooms').select('*').eq('room_code', room).order('created_at', desc=True).limit(1).execute()
        
        if not room_result.data:
            return
        
        room_id = room_result.data[0]['id']
        creator_id = room_result.data[0]['creator_id']
        creator_participated = rooms[room].get('creator_participated', True)

        # Save all scores
        for user_id, final_score in rooms[room]["final_scores"].items():
            if user_id == creator_id and not creator_participated:
                print(f"Skipping creator {user_id} - did not participate")
                continue
                
            supabase.table('game_sessions').insert({
                'user_id': user_id,
                'room_id': room_id,
                'score': final_score
            }).execute()

        # Mark as saved and clear for next game
        rooms[room]["scores_saved"] = True
        rooms[room]["final_scores"] = {}

        print(f"All scores saved and cleared for room {room}")
            
    except Exception as e:
        print(f"Error saving game results: {e}")
        
def save_game_instance_to_db(room):
    """Save a new game instance when game starts"""
    from home import rooms
    try:
        supabase = current_app.config['SUPABASE']
        
        # Get room creator info
        creator_username = rooms[room].get("creator", "Unknown")
        creator_data = get_user_by_username(creator_username, supabase) if creator_username != "Unknown" else None
        creator_id = creator_data['id'] if creator_data else None
        learning_material = rooms[room].get("learning_material", "alphabet")

        # Insert new game instance
        supabase.table('rooms').insert({
            'room_code': room,
            'game_type': rooms[room].get('game_type', 'Unknown'),
            'duration': rooms[room].get('duration', 30),
            'total_participants': len(rooms[room].get('participants', [])),
            'creator_id': creator_id,
            'learning_material': learning_material
        }).execute()
        print(f"New game instance saved for room {room}")
        
        rooms[room].pop("learning_material", None)
        
    except Exception as e:
        print(f"Error saving game instance: {e}")


#########################################
# word related

def extract_fsl_landmarks_from_frame(frame):
    """
    Extract hand landmarks from frame using MediaPipe
    Returns format compatible with FSL feature extractor
    """
    try:
        import mediapipe as mp
        import time
        
        mp_hands = mp.solutions.hands
        hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5
        )
        
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)
        
        if results.multi_hand_landmarks:
            # Convert to the format expected by FSL feature extractor
            frame_data = {
                'timestamp': time.time(),
                'hands': []
            }
            
            for hand_landmarks in results.multi_hand_landmarks:
                hand_data = {
                    'landmarks': []
                }
                
                for landmark in hand_landmarks.landmark:
                    hand_data['landmarks'].append({
                        'x': landmark.x,
                        'y': landmark.y,
                        'z': landmark.z if hasattr(landmark, 'z') else 0
                    })
                
                frame_data['hands'].append(hand_data)
            
            hands.close()
            return frame_data
        
        hands.close()
        return None
        
    except Exception as e:
        print(f"FSL Landmark extraction error: {e}")
        return None
