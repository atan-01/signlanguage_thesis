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
    """Main translator page - requires login""" # add this in EVERY python file aside app and auth
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data: 
        return redirect(url_for('auth.index'))
    
    if room_code is None or session.get("name") is None or room_code not in rooms: # room_Code from home.py
        # Clear session data if room doesn't exist
        session.pop("room", None)
        session.pop("name", None)
        return redirect(url_for('home.home'))  # Redirect to home instead of auth.index

    return render_template('room.html', user=user_data, messages=rooms[room_code]["messages"], room_code=room_code)
    

# SocketIO Events
def init_socketio(socketio, supabase, detector=None):
    """Initialize SocketIO event handlers"""

    @socketio.on('connect')
    def handle_connect():
        user_id = session.get('user_id')
        room = session.get('room')
        
        if not user_id or not room or room not in rooms:
            return False  # Reject connection
            
        user_data = get_user_by_id(user_id)
        if not user_data:
            return False
            
        name = user_data['username']
        
        join_room(room)
        send({"name": name, "message": "has entered the room"}, to=room) # sends data to socketio.on message in room.js, "message" is the name of the event it calls
        rooms[room]["members"] += 1
        
        print(f"{name} joined room {room}")
        
        # Send status with detector info if available
        model_loaded = detector.model_loaded if detector else False
        emit('status', {
            'message': 'Welcome!',
            'model_loaded': model_loaded
        })


    @socketio.on('message')
    def message(data):
        room = session.get("room")
        if room not in rooms:
            return
        
        content = {
            "name": session.get("name"),
            "message": data["data"]         # {data: message.value} from room.js
        }
        send(content, to=room)
        rooms[room]["messages"].append(content)
        print(f"{session.get('name')} said: {data['data']}")

    @socketio.on('process_frame_room')
    def handle_room_frame(data):
        """Handle sign language detection in room context"""
        room = session.get("room")
        if not room or room not in rooms or not detector:
            emit('error', {'message': 'Room not found or detector not available'})
            return
            
        print(f"Received frame for processing in room {room}")
        try:
            image_data = data['image'].split(',')[1]
            image_bytes = base64.b64decode(image_data)
            
            image = Image.open(io.BytesIO(image_bytes))
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            result = detector.process_frame(frame)
            
            # Send result back to the user who sent the frame
            emit('prediction_result', result)
            
            # Optionally, you can also broadcast the detected sign to the room
            #if result['prediction'] != "No gesture" and result['confidence'] > 0.5:
            #    user_data = get_user_by_id(session.get('user_id'))
            #    if user_data:
            #        sign_message = {
            #            "name": user_data['username'],
            #            "message": f"🤟 Signed: {result['prediction']} (confidence: {int(result['confidence']*100)}%)",
            #            "type": "sign_detection"
            #        }
            #        send(sign_message, to=room)
            #        rooms[room]["messages"].append(sign_message)
            
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
            print(f"{name} has left the room {room}")
            
            if rooms[room]["members"] <= 0:
                del rooms[room]
                print(f"Room {room} has been deleted")

        send({"name": name, "message": "has left the room"}, to=room)

        print(f'User {user_data["username"]} disconnected')