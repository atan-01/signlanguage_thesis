from flask import Blueprint, render_template, session, redirect, url_for, current_app, request
from flask_socketio import emit, join_room, leave_room, send
import random
from string import ascii_uppercase
from home import rooms
import cv2
import numpy as np
import base64
import io
from PIL import Image

room_bp = Blueprint('room', __name__, url_prefix='/room')

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

@room_bp.route(('/<room_code>'), methods=["POST", "GET"])
def room(room_code):
    """Main translator page - requires login"""
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data: 
        return redirect(url_for('auth.index'))
    
    if room_code is None or session.get("name") is None or room_code not in rooms:
        session.pop("room", None)
        session.pop("name", None)
        return redirect(url_for('home.home'))

    created = session.get('created', False)

    participants = rooms[room_code].get("participants", [])

    return render_template('room.html', user=user_data, messages=rooms[room_code]["messages"], room_code=room_code, created=created, participants=participants)

# SocketIO Events
def init_socketio(socketio, supabase, detector=None):
    """Initialize SocketIO event handlers"""

    @socketio.on('connect')
    def handle_connect():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return False
            
        user_data = get_user_by_id(user_id)
        if not user_data:
            return False
            
        name = user_data['username']
        
        join_room(room)

        if name not in rooms[room].get("participants", []):
            rooms[room].setdefault("participants", []).append(name) # setdefault = creates one if does not exist

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
        
        # Send status with detector info if available
        model_loaded = detector.model_loaded if detector else False
        emit('status', {'message': 'Connected to room', 'model_loaded': model_loaded})
        
        # Send initial camera status
        check_camera_readiness(room)

    @socketio.on('message')
    def message(data):
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
            
        check_camera_readiness(room)

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
            
        check_camera_readiness(room)

    def check_camera_readiness(room):
        """Check if all users in room have their cameras ready"""
        if room not in rooms or "camera_status" not in rooms[room]:
            return
            
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

    @socketio.on('set_game_type')
    def handle_game_type(data):
        room = session.get("room")
        game_type = data.get('type')
        if room and room in rooms:
            rooms[room]['game_type'] = game_type
            emit('game_type_set', {'type': game_type}, room=room)

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
            
            # Send result back to the user who sent the frame
            emit('prediction_result', result)
            
        except Exception as e:
            print(f"Error processing frame in room: {e}")
            emit('error', {'message': str(e)})

    @socketio.on('disconnect')
    def handle_disconnect():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room:
            return
            
        user_data = get_user_by_id(user_id)
        if not user_data:
            return
        
        name = user_data['username']
        leave_room(room)

        if room in rooms:
            rooms[room]["members"] -= 1
            
            if name in rooms[room].get("participants", []):
                rooms[room]["participants"].remove(name)
                
                # Broadcast updated participant list to ALL remaining users
                emit('participants_updated', {
                    'participants': rooms[room]["participants"]
                }, room=room)

            # Remove user from camera status
            if "camera_status" in rooms[room] and user_id in rooms[room]["camera_status"]:
                del rooms[room]["camera_status"][user_id]
                check_camera_readiness(room)
            
            print(f"{name} has left the room {room}")
            
            if rooms[room]["members"] <= 0:
                del rooms[room]
                print(f"Room {room} has been deleted")

        send({"name": name, "message": "has left the room"}, to=room)
        print(f'User {user_data["username"]} disconnected')
    