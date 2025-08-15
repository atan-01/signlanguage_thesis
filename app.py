from flask import Flask
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os
from supabase import create_client, Client
from auth import auth_bp
from translator import translator_bp, detector  # Remove the socketio imports
from home import home_bp
from room import room_bp  # Remove init_socketio import
from learn import learn_bp
from socketio_events import init_all_socketio_events  # Import centralized events
    
# Load environment variables, access .env file
load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-this-in-production')
    
    # Initialize Supabase
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')
    
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")
    
    supabase: Client = create_client(supabase_url, supabase_key)
    
    # Store supabase client in app config for access in blueprints
    app.config['SUPABASE'] = supabase
    
    # Initialize SocketIO
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(translator_bp)
    app.register_blueprint(home_bp)
    app.register_blueprint(room_bp)
    app.register_blueprint(learn_bp)
    
    # Initialize ALL SocketIO events in one place
    init_all_socketio_events(socketio, supabase, detector)
    
    return app, socketio

if __name__ == '__main__':
    print("Starting Sign Language Detection Server with Supabase...")
    print("Make sure to:")
    print("1. Set up your .env file with Supabase credentials")
    print("2. Create the database tables in Supabase dashboard")
    print("3. Place your model_alphabetc.p file in the same directory")
    
    app, socketio = create_app()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)