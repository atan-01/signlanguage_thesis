from flask import Blueprint, render_template, session, redirect, url_for, current_app

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

def get_user_by_username(username):
    """Get user by username from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('username', username).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by username: {e}")
        return None

def get_participants_with_profiles(participants):
    """Get participant data with profile pictures"""
    participants_data = []
    for participant_username in participants:
        user_data = get_user_by_username(participant_username)
        if user_data:
            participants_data.append({
                'username': participant_username,
                'profile_picture': user_data.get('profile_picture')
            })
        else:
            # Fallback if user not found in database
            participants_data.append({
                'username': participant_username,
                'profile_picture': None
            })
    return participants_data

@room_bp.route(('/<room_code>'), methods=["POST", "GET"])
def room(room_code):
    """Main translator page - requires login"""
    from home import rooms, game_states
    
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data: 
        return redirect(url_for('auth.index'))

    if game_states.get(room_code, {}).get("ongoing", False):
        return redirect(url_for('home.home', msg="Game already in progress"))
    
    if room_code is None or session.get("name") is None or room_code not in rooms:
        session.pop("room", None)
        session.pop("name", None)
        return redirect(url_for('home.home'))

    created = session.get('created', False)
    participants = rooms[room_code].get("participants", [])

    if len(participants) >= 30 and session.get("name") not in participants:
        return redirect(url_for('home.home', msg="Room is full (max 30 participants)."))

    room_data = rooms[room_code]
    creator_username = room_data.get("creator", "Unknown")
    
    participants_with_profiles = get_participants_with_profiles(participants)
    
    creator_data = get_user_by_username(creator_username)
    
    return render_template('room.html', 
                         user=user_data, 
                         messages=rooms[room_code]["messages"], 
                         room_code=room_code, 
                         created=created, 
                         participants=participants_with_profiles,
                         creator_username=creator_username,
                         creator_data=creator_data)