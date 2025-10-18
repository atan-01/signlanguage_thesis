from flask import Blueprint, render_template, request, jsonify, redirect, url_for, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

# Create blueprint
auth_bp = Blueprint('auth', __name__)

# Database helper functions
def create_user(username, password, role, profile_picture, grade):
    """Create a new user in Supabase"""
    supabase = current_app.config['SUPABASE']
    password_hash = generate_password_hash(password)
    
    try:
        result = supabase.table('users').insert({
            'username': username,
            'password_hash': password_hash,
            'role': role,
            'profile_picture': profile_picture,
            'grade': grade,
            'created_at': datetime.utcnow().isoformat()
        }).execute()
        
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error creating user: {e}")
        return None

def get_user_by_username(username):
    """Get user by username from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('username', username).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user: {e}")
        return None

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

# Routes
@auth_bp.route('/')
def index():
    """Main route - redirect to login or home if already logged in"""
    user_id = session.get('user_id')
    if user_id:
        user_data = get_user_by_id(user_id)
        if user_data:
            return redirect(url_for('home.home'))
    return redirect(url_for('auth.login'))

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        user_data = get_user_by_username(username)

        if user_data and check_password_hash(user_data['password_hash'], password):
            session['user_id'] = user_data['id']
            print(f"User logged in: {username}")
            return jsonify({'success': True, 'redirect': url_for('home.home')})

        return jsonify({'error': 'Invalid username or password'}), 401

    return render_template('index.html')

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        role = data.get('role')
        grade = data.get('grade')
        filename = data.get('profile_picture', 'default.jpg')
        profile_picture = f"images/profile_pictures/{filename}"

        if get_user_by_username(username):
            return jsonify({'error': 'Username already exists'}), 400

        user_data = create_user(username, password, role, profile_picture, grade)
        if user_data:
            session['user_id'] = user_data['id']
            print(f"New user registered: {username}")
            return jsonify({'success': True, 'redirect': url_for('home.home')})
        else:
            return jsonify({'error': 'Registration failed'}), 500

    return render_template('index.html')

@auth_bp.route('/logout')
def logout():
    user_id = session.get('user_id')
    if user_id:
        user_data = get_user_by_id(user_id)
        if user_data:
            print(f"User logged out: {user_data['username']}")

    session.pop('user_id', None)
    return redirect(url_for('auth.login'))