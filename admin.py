from flask import Blueprint, render_template, session, redirect, url_for, current_app, request, jsonify
import json
import os
from datetime import datetime

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

def is_admin():
    """Check if current user is admin"""
    user_id = session.get('user_id')
    if not user_id:
        return False
    
    user = get_user_by_id(user_id)
    return user and user.get('role') == 'Admin'

@admin_bp.route('/dashboard')
def dashboard():
    """Admin dashboard - accessible from anywhere"""
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    current_user = get_user_by_id(user_id)
    if not current_user or current_user.get('role') != 'Admin':
        return "Access denied - Admin only", 403
    
    supabase = current_app.config['SUPABASE']
    
    # Fetch all data
    try:
        users = supabase.table('users').select('*').order('created_at', desc=True).execute()
        rooms = supabase.table('rooms').select('*').order('created_at', desc=True).execute()
        game_sessions = supabase.table('game_sessions').select('*').order('created_at', desc=True).execute()
        
        # Load words from JSON
        words_path = os.path.join('static', 'models', 'words.json')
        with open(words_path, 'r', encoding='utf-8') as f:
            words_data = json.load(f)
        
        return render_template('admin_dashboard.html',
                             user=current_user,
                             users=users.data,
                             rooms=rooms.data,
                             game_sessions=game_sessions.data,
                             words=words_data['words'])
    except Exception as e:
        print(f"Error loading admin dashboard: {e}")
        import traceback
        traceback.print_exc()
        return f"Error loading dashboard: {str(e)}", 500

# USER MANAGEMENT APIs
@admin_bp.route('/api/users', methods=['POST'])
def add_user():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    supabase = current_app.config['SUPABASE']
    
    try:
        result = supabase.table('users').insert({
            'username': data['username'],
            'role': data.get('role', 'user'),
            'grade': data.get('grade', '')
        }).execute()
        return jsonify({'success': True, 'data': result.data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    supabase = current_app.config['SUPABASE']
    
    try:
        result = supabase.table('users').update({
            'username': data['username'],
            'role': data['role'],
            'grade': data.get('grade', '')
        }).eq('id', user_id).execute()
        return jsonify({'success': True, 'data': result.data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    supabase = current_app.config['SUPABASE']
    
    try:
        result = supabase.table('users').delete().eq('id', user_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ROOM MANAGEMENT APIs
@admin_bp.route('/api/rooms/<room_id>', methods=['DELETE'])
def delete_room(room_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    supabase = current_app.config['SUPABASE']
    
    try:
        result = supabase.table('rooms').delete().eq('id', room_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# GAME SESSION MANAGEMENT APIs
@admin_bp.route('/api/game_sessions/<session_id>', methods=['DELETE'])
def delete_game_session(session_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    supabase = current_app.config['SUPABASE']
    
    try:
        result = supabase.table('game_sessions').delete().eq('id', session_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# WORDS MANAGEMENT APIs
@admin_bp.route('/api/words', methods=['GET'])
def get_words():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        words_path = os.path.join('static', 'models', 'words.json')
        with open(words_path, 'r', encoding='utf-8') as f:
            words_data = json.load(f)
        return jsonify(words_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/words', methods=['POST'])
def add_word():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    
    try:
        words_path = os.path.join('static', 'models', 'words.json')
        with open(words_path, 'r', encoding='utf-8') as f:
            words_data = json.load(f)
        
        words_data['words'].append({
            'word': data['word'],
            'emoji': data['emoji']
        })
        
        with open(words_path, 'w', encoding='utf-8') as f:
            json.dump(words_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/words/<int:index>', methods=['PUT'])
def update_word(index):
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    
    try:
        words_path = os.path.join('static', 'models', 'words.json')
        with open(words_path, 'r', encoding='utf-8') as f:
            words_data = json.load(f)
        
        if 0 <= index < len(words_data['words']):
            words_data['words'][index] = {
                'word': data['word'],
                'emoji': data['emoji']
            }
            
            with open(words_path, 'w', encoding='utf-8') as f:
                json.dump(words_data, f, ensure_ascii=False, indent=2)
            
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Index out of range'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/words/<int:index>', methods=['DELETE'])
def delete_word(index):
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        words_path = os.path.join('static', 'models', 'words.json')
        with open(words_path, 'r', encoding='utf-8') as f:
            words_data = json.load(f)
        
        if 0 <= index < len(words_data['words']):
            words_data['words'].pop(index)
            
            with open(words_path, 'w', encoding='utf-8') as f:
                json.dump(words_data, f, ensure_ascii=False, indent=2)
            
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Index out of range'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500