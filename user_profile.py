from flask import Blueprint, render_template, session, redirect, url_for, current_app, request

profile_bp = Blueprint('profile', __name__, url_prefix='/profile')

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

@profile_bp.route('/<username>')
def profile(username):
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data:
        return redirect(url_for('auth.index'))

    return render_template("profile.html", user=user_data)
