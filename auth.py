from flask import Blueprint, render_template, request, jsonify, redirect, url_for, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

# Create blueprint
auth_bp = Blueprint('auth', __name__)

# User class for session management
class User:
    def __init__(self, user_data):
        self.id = user_data['id']
        self.username = user_data['username']
        self.email = user_data['email']
        self.total_score = user_data.get('total_score', 0)
        self.games_played = user_data.get('games_played', 0)
        self.best_streak = user_data.get('best_streak', 0)
        self.created_at = user_data.get('created_at')
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'total_score': self.total_score,
            'games_played': self.games_played,
            'best_streak': self.best_streak,
            'created_at': self.created_at
        }

# Database helper functions
def create_user(username, email, password, role):
    """Create a new user in Supabase"""
    supabase = current_app.config['SUPABASE']
    password_hash = generate_password_hash(password)
    
    try:
        result = supabase.table('users').insert({
            'username': username,
            'email': email,
            'password_hash': password_hash,
            'role': role, 
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

def get_user_by_email(email):
    """Get user by email from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('email', email).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by email: {e}")
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
            return redirect(url_for('home.home'))  # Assuming home is your post-login route
    return redirect(url_for('auth.login'))  # Redirect to /login

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

    return render_template('index.html')  # Render login form

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role')

        if get_user_by_username(username):
            return jsonify({'error': 'Username already exists'}), 400

        if get_user_by_email(email):
            return jsonify({'error': 'Email already exists'}), 400

        user_data = create_user(username, email, password, role)
        if user_data:
            session['user_id'] = user_data['id']
            print(f"New user registered: {username} ({email})")
            return jsonify({'success': True, 'redirect': url_for('home.home')})
        else:
            return jsonify({'error': 'Registration failed'}), 500

    return render_template('index.html')  # Could be a shared form with login

@auth_bp.route('/logout')
def logout():
    user_id = session.get('user_id')
    if user_id:
        user_data = get_user_by_id(user_id)
        if user_data:
            print(f"User logged out: {user_data['username']}")

    session.pop('user_id', None)
    return redirect(url_for('auth.login'))