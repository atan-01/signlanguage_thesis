from flask import Blueprint, render_template, session, redirect, url_for, current_app, request
import random
from string import ascii_uppercase

home_bp = Blueprint('home', __name__, url_prefix='/home')

rooms = {}
game_states = {}

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
    """Main translator page - requires login"""
    print("user is in home")
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data:
        return redirect(url_for('auth.index'))
    
    msg = request.args.get("msg")
    
    if request.method == "POST":
        name = user_data['username']
        code = request.form.get("code")
        join = request.form.get("join", False)
        create = request.form.get("create", False)

        if join != False and not code:
            return render_template('home.html', user=user_data, error="Please enter a room code.", code=code)

        room = code
        if create != False:
            room = generate_unique_code(6)
            # Only create room in memory - database insertion happens when game starts
            rooms[room] = {
                "members": 0, 
                "messages": [], 
                "participants": [], 
                "creator": name, 
                "creator_id": user_data['id']
            }
            session['created'] = True
            print(f"Room {room} created in memory only")

        elif code not in rooms:
            return render_template('home.html', user=user_data, error="Room does not exist.", code=code)
        else:
            session['created'] = False

        session["room"] = room 
        session["name"] = name

        return redirect(url_for('room.room', room_code=room))

    return render_template('home.html', user=user_data, error=msg)