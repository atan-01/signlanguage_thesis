# Updated socketio_events.py - Simplified for room/translator only
# Learning materials no longer need server processing!

from flask import session, current_app, request, jsonify
from flask_socketio import emit, join_room, leave_room, send
import numpy as np

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
    
    # Raw coordinates (flattened)
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

        game_type = rooms[room].get('game_type')
        duration = rooms[room].get('duration', 30)
        gamemode_index = rooms[room].get('gamemode_index')

        if game_type:
            emit('game_type_set', {
                'type': game_type,
                'duration': duration,
                'gamemode_index': gamemode_index
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
        
        if room and room in rooms:
            rooms[room]['game_type'] = game_type
            rooms[room]['duration'] = duration
            rooms[room]['gamemode_index'] = gamemode_index
            emit('game_type_set', {
                'type': game_type, 
                'duration': duration, 
                'gamemode_index': gamemode_index
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
                print(f"Stored score for user {user_id}: {data['final_score']}")
                print(f"Current final_scores: {rooms[room]['final_scores']}")

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

    # ===== TRANSLATOR/SERVER PROCESSING EVENTS =====
    # Only used when client-side processing is NOT enabled (translator page)
    
    @socketio.on('join_translator')
    def handle_join_translator():
        """Join a translator session (uses server processing)"""
        user_id = session.get('user_id')
        if not user_id:
            return False
            
        user_data = get_user_by_id(user_id, supabase)
        if not user_data:
            return False
            
        translator_room = f"translator_{user_id}"
        join_room(translator_room)
        
        model_loaded = detector.model_loaded if detector else False
        emit('status', {'message': 'Connected to translator - Server processing', 'model_loaded': model_loaded})
        print(f"User {user_data['username']} joined translator")

    @socketio.on('leave_translator')
    def handle_leave_translator():
        """Leave translator session"""
        user_id = session.get('user_id')
        if user_id:
            translator_room = f"translator_{user_id}"
            leave_room(translator_room)
            print(f"User left translator session")

    @socketio.on('process_landmarks_translator')
    def handle_translator_landmarks(data):
        """
        Handle landmark processing for TRANSLATOR only
        (Learning materials use client-side processing now)
        """
        if not detector:
            emit('error', {'message': 'Detector not available'})
            return
            
        try:
            landmarks_data = data.get('landmarks')
            
            if landmarks_data is None:
                emit('prediction_result', {
                    'prediction': 'No gesture',
                    'confidence': 0
                })
                return
            
            processed_features = process_landmarks_for_prediction(landmarks_data)
            
            if processed_features is not None:
                result = detector.process_landmarks(processed_features)
                emit('prediction_result', result)
            else:
                emit('prediction_result', {
                    'prediction': 'No gesture',
                    'confidence': 0
                })
            
        except Exception as e:
            print(f"Error processing landmarks in translator: {e}")
            emit('error', {'message': str(e)})

    # NOTE: Removed 'process_landmarks_room' - rooms now use client-side processing!
    # If you need server processing for rooms in the future, add it back

    print("SocketIO events initialized")
    print("✅ Server processing available for: translator")
    print("✅ Client-side processing used by: rooms, learning materials")

    @socketio.on('set_learning_material')
    def handle_set_learning_material(data):
        room = session.get('room')
        learning_material = data.get('learningMaterial')
        print("eto yung learning material: ", learning_material)
        if room in rooms:
            rooms[room]['learning_material'] = learning_material
            print(f"✅ Room {room}: Learning material set to {learning_material}")


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
        
        print(f"Room {room}: {actual_scores}/{expected_participants} scores received")
        
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
            print(f"Saved score: User {user_id} = {final_score}")
        
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