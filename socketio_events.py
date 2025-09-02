from flask import session, current_app, request
from flask_socketio import emit, join_room, leave_room, send
import cv2
import numpy as np
import base64
import io
from PIL import Image

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

def init_all_socketio_events(socketio, supabase, detector=None):
    """Initialize all SocketIO event handlers for the entire application"""
    
    # Import rooms here to avoid circular imports
    from home import rooms
    
    @socketio.on('connect')
    def handle_connect():
        user_id = session.get('user_id')
        room = session.get('room')
        
        print(f"User {user_id} attempting to connect to room {room}")
        
        if not user_id:
            print("No user_id in session")
            return False
            
        user_data = get_user_by_id(user_id)
        if not user_data:
            print("User data not found")
            return False
        
        # Handle room-specific connection
        if room and room in rooms:
            name = user_data['username']
            join_room(room)

            if name not in rooms[room].get("participants", []):
                rooms[room].setdefault("participants", []).append(name)

            emit('participants_updated', {'participants': rooms[room]["participants"]}, room=room)
            send({"name": name, "message": "has entered the room"}, to=room)
            rooms[room]["members"] += 1
            
            # Initialize camera status tracking for this user
            if "camera_status" not in rooms[room]:
                rooms[room]["camera_status"] = {}
            
            rooms[room]["camera_status"][user_id] = {
                "username": name,
                "camera_ready": False
            }
            
            print(f"{name} joined room {room}")
            check_camera_readiness(room, rooms)
        
        # Send status with detector info if available
        model_loaded = detector.model_loaded if detector else False
        emit('status', {'message': 'Connected', 'model_loaded': model_loaded})

    @socketio.on('disconnect')
    def handle_disconnect():
        name = session.get('name')  # Use username from session
        room = session.get('room')
        is_creator = session.get('created', False)  # Check if user created the room
        
        if not name:
            return
        
        # Handle room-specific disconnection
        if room and room in rooms:
            # Check if the disconnecting user is the room creator
            if is_creator:
                # Creator is disconnecting - delete the room
                emit('room_deleted_by_creator', {
                    'message': f'Room has been closed by creator {name}'
                }, room=room)
                
                # Clean up the room
                del rooms[room]
                print(f"Room {room} deleted due to creator {name} disconnecting")
                return
            
            # Regular participant leaving logic...
            leave_room(room)
            rooms[room]["members"] -= 1
            
            if name in rooms[room].get("participants", []):
                rooms[room]["participants"].remove(name)
                emit('participants_updated', {
                    'participants': rooms[room]["participants"]
                }, room=room)
            
            print(f"{name} has left the room {room}")
            
            # Clean up empty rooms
            if rooms[room]["members"] <= 0:
                del rooms[room]
                print(f"Room {room} has been deleted - no members left")
            
            send({"name": name, "message": "has left the room"}, to=room)
        
        print(f'User {name} disconnected')

    # ===== ROOM-SPECIFIC EVENTS =====
    # Room-specific events
    @socketio.on('join_room')
    def handle_join(data):
        room = data.get("room")
        name = data.get("name")

        if room not in rooms:
            return

        join_room(room)

        # Send the current game mode & time if already set
        game_type = rooms[room].get('game_type')
        duration = rooms[room].get('duration', 30)

        if game_type:
            emit('game_type_set', {'type': game_type, 'duration': duration}, to=request.sid)

    @socketio.on('message')
    def handle_message(data):
        room = session.get("room")
        if room not in rooms:
            return
        
        content = {
            "name": session.get("name"),
            "message": data["data"]
        }
        send(content, to=room)
        rooms[room]["messages"].append(content)
        print(f"{session.get('name')} said: {data['data']}")

    @socketio.on('camera_ready')
    def handle_camera_ready():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return
            
        if "camera_status" not in rooms[room]:
            rooms[room]["camera_status"] = {}
            
        rooms[room]["camera_status"][user_id]["camera_ready"] = True
        
        user_data = get_user_by_id(user_id)
        if user_data:
            print(f"{user_data['username']} camera is ready in room {room}")
            
        check_camera_readiness(room, rooms)

    @socketio.on('camera_stopped')
    def handle_camera_stopped():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return
            
        if "camera_status" in rooms[room] and user_id in rooms[room]["camera_status"]:
            rooms[room]["camera_status"][user_id]["camera_ready"] = False
            
        user_data = get_user_by_id(user_id)
        if user_data:
            print(f"{user_data['username']} camera stopped in room {room}")
            
        check_camera_readiness(room, rooms)

    @socketio.on('set_game_type_and_time')
    def handle_game_type(data):
        room = session.get("room")
        game_type = data.get('type')
        duration = data.get('duration', 30)
        if room and room in rooms:
            rooms[room]['game_type'] = game_type
            rooms[room]['duration'] = data.get('duration', 30)
            emit('game_type_set', {'type': game_type, 'duration': duration}, room=room)

    @socketio.on('start_game')
    def handle_start_game():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return
            
        # Check if all cameras are ready before starting
        if "camera_status" not in rooms[room]:
            emit('error', {'message': 'Camera status not initialized'})
            return
            
        camera_status = rooms[room]["camera_status"]
        total_users = len(camera_status)
        ready_users = sum(1 for status in camera_status.values() if status["camera_ready"])
        
        if ready_users == total_users and total_users > 0:
            emit('start_game_signal', room=room)
            print(f"Game started in room {room}")
        else:
            emit('error', {'message': f'Not all cameras ready. {ready_users}/{total_users} ready.'})

    @socketio.on('score_update')
    def handle_score_update(data):
        user_id = session.get('user_id')
        user_data = get_user_by_id(user_id)
        username = user_data['username']
        room = session.get("room")
        score = data.get("score")

        if room and username:
            emit('leaderboard_update', {'username': username, 'score': score}, room=room)

    @socketio.on('process_frame_room')
    def handle_room_frame(data):
        """Handle sign language detection in room context"""
        room = session.get("room")
        if not room or room not in rooms or not detector:
            emit('error', {'message': 'Room not found or detector not available'})
            return
            
        try:
            image_data = data['image'].split(',')[1]
            image_bytes = base64.b64decode(image_data)
            
            image = Image.open(io.BytesIO(image_bytes))
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            result = detector.process_frame(frame)
            emit('prediction_result', result)
            
        except Exception as e:
            print(f"Error processing frame in room: {e}")
            emit('error', {'message': str(e)})

    print("All SocketIO events initialized successfully")

    # ===== LEARN MODULE EVENTS =====
    @socketio.on('join_learn')
    def handle_join_learn():
        """Join a learn session"""
        user_id = session.get('user_id')
        if not user_id:
            return False
            
        user_data = get_user_by_id(user_id)
        if not user_data:
            return False
            
        learn_room = f"learn_{user_id}"
        join_room(learn_room)
        
        model_loaded = detector.model_loaded if detector else False
        emit('status', {'message': 'Connected to learn module', 'model_loaded': model_loaded})
        print(f"User {user_data['username']} joined learn module")

    @socketio.on('process_frame_learn')
    def handle_learn_frame(data):
        """Handle sign language detection for learning module"""
        if not detector:
            emit('error', {'message': 'Detector not available'})
            return
            
        try:
            image_data = data['image'].split(',')[1]
            image_bytes = base64.b64decode(image_data)
            
            image = Image.open(io.BytesIO(image_bytes))
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            result = detector.process_frame(frame)
            emit('prediction_result', result)
            
        except Exception as e:
            print(f"Error processing frame in learn: {e}")
            emit('error', {'message': str(e)})

    # ===== TRANSLATOR-SPECIFIC EVENTS =====
    # These events are for the general translator functionality
    @socketio.on('join_translator')
    def handle_join_translator():
        """Join a general translator session"""
        user_id = session.get('user_id')
        if not user_id:
            return False
            
        user_data = get_user_by_id(user_id)
        if not user_data:
            return False
            
        # Create a personal translator room for the user
        translator_room = f"translator_{user_id}"
        join_room(translator_room)
        
        model_loaded = detector.model_loaded if detector else False
        emit('status', {'message': 'Connected to translator', 'model_loaded': model_loaded})
        print(f"User {user_data['username']} joined translator")

    @socketio.on('leave_translator')
    def handle_leave_translator():
        """Leave translator session"""
        user_id = session.get('user_id')
        if user_id:
            translator_room = f"translator_{user_id}"
            leave_room(translator_room)
            print(f"User left translator session")

    @socketio.on('process_frame_translator')
    def handle_translator_frame(data):
        """Handle sign language detection for general translator use"""
        #print("Received frame for processing in translator")
        if not detector:
            emit('error', {'message': 'Detector not available'})
            return
            
        try:
            image_data = data['image'].split(',')[1]
            image_bytes = base64.b64decode(image_data)
            
            image = Image.open(io.BytesIO(image_bytes))
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            result = detector.process_frame(frame)
            emit('prediction_result', result)
            
        except Exception as e:
            print(f"Error processing frame in translator: {e}")
            emit('error', {'message': str(e)})

    # ===== ROOM-SPECIFIC EVENTS =====
    # ===== GENERAL EVENTS =====
    @socketio.on('process_frame')
    def handle_frame(data):
        """Handle sign language detection for general use (fallback)"""
        if not detector:
            emit('error', {'message': 'Detector not available'})
            return
            
        try:
            image_data = data['image'].split(',')[1]
            image_bytes = base64.b64decode(image_data)
            
            image = Image.open(io.BytesIO(image_bytes))
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            result = detector.process_frame(frame)
            emit('prediction_result', result)
            
        except Exception as e:
            print(f"Error processing frame: {e}")
            emit('error', {'message': str(e)})

    @socketio.on('room_creator_leaving')
    def handle_room_creator_leaving():
        name = session.get('name')  # Get username from session
        room = session.get('room')
        is_creator = session.get('created', False)  # Check if user created the room
        
        if not name or not room or room not in rooms:
            return
            
        # Check if this user is actually the room creator
        if is_creator:
            print(f"Room creator {name} is leaving room {room}")
            
            # Notify all OTHER participants that room is being deleted
            emit('room_deleted_by_creator', {
                'message': f'The room creator "{name}" has left. Room is now closed.'
            }, room=room, include_self=False)  # include_self=False so creator doesn't get the alert
            
            # Clean up the room
            if room in rooms:
                del rooms[room]
                print(f"Room {room} deleted by creator {name}")
            
        else:
            print(f"Non-creator {name} tried to delete room {room}")


#############################################################################################################

def check_camera_readiness(room, rooms):
    """Check if all users in room have their cameras ready"""
    if room not in rooms or "camera_status" not in rooms[room]:
        return
        
    from flask_socketio import emit
    
    camera_status = rooms[room]["camera_status"]
    total_users = len(camera_status)
    ready_users = sum(1 for status in camera_status.values() if status["camera_ready"])
    
    # Send status update to all users in room
    emit('camera_status_update', {
        'total': total_users,
        'ready': ready_users,
        'users': camera_status
    }, room=room)
    
    if ready_users == total_users and total_users > 0:
        emit('all_cameras_ready', room=room)
        print(f"All cameras ready in room {room}")
    else:
        emit('waiting_for_cameras', {
            'ready': ready_users,
            'total': total_users
        }, room=room)
