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

@room_bp.route(('/<room_code>'), methods=["POST", "GET"])
def room(room_code):
    """Main translator page - requires login"""
    from home import rooms  # Import rooms here to avoid circular imports
    
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