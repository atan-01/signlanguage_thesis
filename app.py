from flask import Flask, jsonify
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os
import time
from supabase import create_client, Client
from auth import auth_bp
from translator import translator_bp, detector
from home import home_bp
from room import room_bp
from learn import learn_bp
from user_profile import profile_bp
from socketio_events import init_all_socketio_events

# Load environment variables
load_dotenv()

def create_supabase_client_with_retry(url, key, max_retries=3):
    """
    Create Supabase client with retry logic for Railway deployment
    """
    for attempt in range(max_retries):
        try:
            print(f"🔄 Attempting to connect to Supabase (attempt {attempt + 1}/{max_retries})...")
            
            # Simple client creation (no custom options - that was causing the error!)
            client = create_client(url, key)
            
            # Test the connection with a simple query
            print("🧪 Testing Supabase connection...")
            test_result = client.table('users').select('id').limit(1).execute()
            
            print("✅ Supabase connection successful!")
            return client
            
        except Exception as e:
            print(f"❌ Supabase connection attempt {attempt + 1} failed: {e}")
            
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2  # Exponential backoff: 2s, 4s, 6s
                print(f"⏳ Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
            else:
                print("🚨 All Supabase connection attempts failed!")
                raise Exception(f"Failed to connect to Supabase after {max_retries} attempts: {e}")
    
    return None

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', '08ca468790472700391c35315b83d61b49b3f832b9d928659ae5ec5ba6a7cc61')
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')
    
    # DEBUG: Print environment variables
    print(f"🔍 DEBUG: SUPABASE_URL exists: {bool(supabase_url)}")
    print(f"🔍 DEBUG: SUPABASE_KEY exists: {bool(supabase_key)}")
    if supabase_url:
        print(f"🔍 DEBUG: URL starts with: {supabase_url[:30]}...")
    
    if not supabase_url or not supabase_key:
        raise ValueError("❌ SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
    
    # Initialize supabase variable BEFORE try block (fixes UnboundLocalError)
    supabase = None
    
    # Create Supabase client with retry logic
    try:
        supabase = create_supabase_client_with_retry(supabase_url, supabase_key)
        app.config['SUPABASE'] = supabase
    except Exception as e:
        print(f"🚨 CRITICAL: Failed to initialize Supabase: {e}")
        # Set to None so app can still start (but won't work properly)
        app.config['SUPABASE'] = None
        supabase = None
    
    socketio = SocketIO(
        app, 
        cors_allowed_origins="*",
        async_mode='eventlet',
        ping_timeout=60,
        ping_interval=25
    )
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(translator_bp)
    app.register_blueprint(home_bp)
    app.register_blueprint(room_bp)
    app.register_blueprint(learn_bp)
    app.register_blueprint(profile_bp)
    
    initialize_fsl_model(app)
    
    # Verify FSL model
    if hasattr(app, 'fsl_predictor') and app.fsl_predictor is not None:
        print(f"✅ FSL predictor attached to app successfully")
    else:
        print(f"⚠️ FSL predictor NOT attached to app")

    # Initialize SocketIO events (now supabase is always defined)
    init_all_socketio_events(socketio, supabase, detector)
    
    print("✅ App created successfully")
    return app, socketio

def initialize_fsl_model(app):
    """Initialize FSL words predictor"""
    try:
        from simple_fsl_trainer import SimpleFSLPredictor
        
        model_dir = "fsl_movement_model"
        
        if os.path.exists(model_dir):
            app.fsl_predictor = SimpleFSLPredictor(model_dir)
            return True
        else:
            print(f"⚠️ FSL model directory not found: {model_dir}")
            print(f"⚠️ Current directory: {os.getcwd()}")
            print(f"⚠️ FSL words feature will not be available")
            app.fsl_predictor = None
            return False
            
    except ImportError as e:
        print(f"⚠️ Could not import FSL predictor: {e}")
        app.fsl_predictor = None
        return False
        
    except Exception as e:
        print(f"⚠️ Error initializing FSL model: {e}")
        import traceback
        traceback.print_exc()
        app.fsl_predictor = None
        return False


# ============================================
# 🚀 CRITICAL: Create app instance for Gunicorn
# ============================================
app, socketio = create_app()


# ============================================
# 🏠 For local development only
# Railway/Gunicorn will NOT execute this block
# ============================================
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 Starting Sign Language Detection Server (LOCAL DEV)")
    print("=" * 50)
    
    port = int(os.getenv('PORT', 5000))
    
    print(f"✅ Server ready! Open http://localhost:{port}")
    print("=" * 50)
    
    socketio.run(app, debug=True, host='0.0.0.0', port=port)