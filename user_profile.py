from flask import Blueprint, render_template, session, redirect, url_for, current_app, request
from datetime import datetime
from dateutil import parser

profile_bp = Blueprint('profile', __name__, url_prefix='/profile')


def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        user = result.data[0]
        user["created_at"] = format_created_at(user["created_at"])
        return user
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

def get_user_by_username(username):
    """Get user by username from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('username', username).execute()
        if result.data:
            user = result.data[0]
            user["created_at"] = format_created_at(user["created_at"])
            print("User data from Supabase:", user)
            return user
        return None
    except Exception as e:
        print(f"Error getting user by username: {e}")
        return None

@profile_bp.route('/<username>')
def profile(username):
    supabase = current_app.config['SUPABASE']
    
    # Check if user is logged in (for authentication)
    session_user_id = session.get('user_id')
    if not session_user_id:
        return redirect(url_for('auth.index'))
    
    # Get the LOGGED-IN user's data (for navbar)
    logged_in_user = get_user_by_id(session_user_id)
    if not logged_in_user:
        return redirect(url_for('auth.index'))

    # Get the requested user's profile (for main content)
    requested_user = get_user_by_username(username)
    if not requested_user:
        return "User not found", 404

    # Use the REQUESTED user's ID for all queries
    user_id = requested_user['id']

    # Get game sessions where the REQUESTED user participated
    user_game_sessions = supabase.table("game_sessions") \
        .select("*") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute().data
    
    # Get rooms created by the REQUESTED user (last 10)
    created_rooms = supabase.table("rooms") \
        .select("*") \
        .eq("creator_id", user_id) \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute().data

    # Combine room IDs from both game sessions and created rooms
    session_room_ids = [s["room_id"] for s in user_game_sessions]
    created_room_ids = [r["id"] for r in created_rooms]
    all_room_ids = list(set(session_room_ids + created_room_ids))

    # Get all room data
    user_rooms_history = []
    if all_room_ids:
        user_rooms_history = supabase.table("rooms").select("*").in_("id", all_room_ids).execute().data
        
    rooms_by_id = {r["id"]: r for r in user_rooms_history}

    # Process game sessions (add room data and format dates)
    for s in user_game_sessions:
        s["room"] = rooms_by_id.get(s["room_id"])
        s["created_at"] = format_created_at(s["created_at"])
        s["is_creator"] = False
        s["learning_material"] = s["room"]["learning_material"] if s["room"] else None


    # Create fake game sessions for created rooms (where user was creator but didn't participate)
    created_room_sessions = []
    for room in created_rooms:
        # Check if this room already has a game session entry
        if room["id"] not in session_room_ids:
            created_room_sessions.append({
                "room_id": room["id"],
                "room": room,
                "score": None,  # No score for creator who didn't participate
                "created_at": format_created_at(room["created_at"]),
                "is_creator": True,
                "learning_material": room.get("learning_material")
            })

    # Combine and sort all sessions by date (most recent first)
    all_sessions = user_game_sessions + created_room_sessions
    all_sessions.sort(key=lambda x: datetime.strptime(x["created_at"], "%B %d, %Y"), reverse=True)
    
    # Take only the 10 most recent
    all_sessions = all_sessions[:10]

    # Calculate stats (only from actual game sessions with scores)
    scores = [s["score"] for s in user_game_sessions if "score" in s and s["score"] is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0
    best_score = max(scores) if scores else 0
    
    # Total games includes both participated and created
    total_games_participated = len(user_game_sessions)
    total_games_created = len(created_room_sessions)
    total_games = total_games_participated + total_games_created

    return render_template(
        "profile.html",
        user=requested_user,  # Profile being viewed
        logged_in_user=logged_in_user,  # User who is logged in (for navbar)
        user_game_sessions=all_sessions,
        user_rooms_history=user_rooms_history,
        avg_score=avg_score,
        best_score=best_score,
        games_played=total_games,
        games_participated=total_games_participated,
        games_created=total_games_created
    )

@profile_bp.route('/room/<int:room_id>')
def room_details(room_id):
    supabase = current_app.config['SUPABASE']
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data:
        return redirect(url_for('auth.index'))

    # Get the room info
    room_result = supabase.table("rooms").select("*").eq("id", room_id).execute()
    if not room_result.data:
        return "Room not found", 404
    room = room_result.data[0]

    # Get the creator's user info
    creator_result = supabase.table("users").select("username").eq("id", room["creator_id"]).execute()
    creator_username = creator_result.data[0]["username"] if creator_result.data else "Unknown"

    # Get participants (game sessions that joined this room)
    game_sessions = supabase.table("game_sessions").select("*").eq("room_id", room_id).execute().data

    # Replace user_id with actual usernames for participants
    user_ids = list({s["user_id"] for s in game_sessions})
    users = supabase.table("users").select("id, username").in_("id", user_ids).execute().data
    users_by_id = {u["id"]: u["username"] for u in users}

    for s in game_sessions:
        s["username"] = users_by_id.get(s["user_id"], "Unknown")

    return render_template(
        "room_details.html",
        user=user_data,
        room=room,
        creator_username=creator_username,
        participants=game_sessions
    )

def format_created_at(date_str):
    try:
        # Normalize by inserting 'T' if missing between date and time
        if " " in date_str and "T" not in date_str:
            date_str = date_str.replace(" ", "T")

        # If it ends with Z, convert to +00:00 (supabase UTC notation)
        if date_str.endswith('Z'):
            date_str = date_str.replace("Z", "+00:00")

        dt = datetime.fromisoformat(date_str)
        return dt.strftime("%B %d, %Y")

    except Exception:
        # Fallback - handle any remaining formats
        try:
            dt = parser.parse(date_str)
            return dt.strftime("%B %d, %Y")
        except Exception:
            return date_str  # Return original if parsing completely fails
