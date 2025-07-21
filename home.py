from flask import Blueprint, render_template, session, redirect, url_for, current_app, request
from flask_socketio import emit, join_room, leave_room, send
import random
from string import ascii_uppercase

home_bp = Blueprint('home', __name__, url_prefix='/home')

rooms = {}

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

def generate_unique_code(length):
    while True:
        code = ""
        for _ in range(length):  # _ = don't care about the variable
            code += random.choice(ascii_uppercase)
            
        if code not in rooms:
            break
    
    return code

@home_bp.route('/', methods=["POST", "GET"])
def home():
    """Main translator page - requires login""" # add this in EVERY python file aside app and auth
    print("user is in home")
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data:
        return redirect(url_for('auth.index'))
    
    if request.method == "POST":
        name = user_data['username']
        code = request.form.get("code")
        join = request.form.get("join", False)
        create = request.form.get("create", False)

        if join != False and not code:
            return render_template('home.html', user=user_data, error = "Please enter a room code.", code=code)

        room = code
        if create != False:
            room = generate_unique_code(6)
            rooms[room] = {"members": 0, "messages": [], "participants": []}
            session['created'] = True
        elif code not in rooms:
            return render_template('home.html', user=user_data, error = "Room does not exist.", code=code)
        else:
            session['created'] = False

        session["room"] = room  # edit this so that its database related
        session["name"] = name

        return redirect(url_for('room.room', room_code=room))

    return render_template('home.html', user=user_data)

