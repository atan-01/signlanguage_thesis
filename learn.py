from flask import Blueprint, render_template, session, redirect, url_for, current_app


learn_bp = Blueprint('learn', __name__, url_prefix='/learn')

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

@learn_bp.route('/')
def learn():
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data: 
        return redirect(url_for('auth.index'))

    return render_template('learn.html')

@learn_bp.route('/<category>')
def learn_category(category):
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data: 
        return redirect(url_for('auth.index'))

    valid_categories = ['alphabet', 'numbers', 'words']
    if category not in valid_categories:
        return "Page not found", 404

    return render_template('learning_materials.html', category=category)
