from flask import Flask, jsonify
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os
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

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', '08ca468790472700391c35315b83d61b49b3f832b9d928659ae5ec5ba6a7cc61')
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')
    
    # DEBUG: Print environment variables
    print(f"🔍 DEBUG: SUPABASE_URL exists: {bool(supabase_url)}")
    print(f"🔍 DEBUG: SUPABASE_KEY exists: {bool(supabase_key)}")
    if supabase_url:
        print(f"🔍 DEBUG: Full URL: {supabase_url}")
    
    if not supabase_url or not supabase_key:
        raise ValueError("❌ SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
    
    # Create Supabase client
    print("📦 Creating Supabase client (using gevent)...")
    supabase = None
    try:
        supabase = create_client(supabase_url, supabase_key)
        app.config['SUPABASE'] = supabase
        print("✅ Supabase client created successfully")
        
        # Test connection
        print("🧪 Testing Supabase connection...")
        test_result = supabase.table('users').select('id').limit(1).execute()
        print("✅ Supabase connection test PASSED!")
        
    except Exception as e:
        print(f"❌ Supabase initialization failed: {e}")
        print(f"❌ Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        app.config['SUPABASE'] = None
    
    # Use gevent instead of eventlet
    socketio = SocketIO(
        app, 
        cors_allowed_origins="*",
        async_mode='gevent',  # Changed from 'eventlet'
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

    # Initialize SocketIO events
    init_all_socketio_events(socketio, supabase, detector)
    
    # ============================================
    # 🏥 HEALTH CHECK ENDPOINT
    # ============================================
    @app.route('/health')
    def health_check():
        """Test Supabase connectivity"""
        import time
        start_time = time.time()
        
        try:
            supabase_client = app.config.get('SUPABASE')
            if not supabase_client:
                return jsonify({
                    "status": "error", 
                    "supabase": "not_initialized",
                    "message": "Supabase client not initialized"
                }), 500
            
            # Try a simple query
            result = supabase_client.table('users').select('id').limit(1).execute()
            query_time = time.time() - start_time
            
            return jsonify({
                "status": "healthy",
                "supabase": "connected",
                "test_query": "success",
                "query_time_ms": round(query_time * 1000, 2),
                "worker": "gevent"
            })
        except Exception as e:
            query_time = time.time() - start_time
            return jsonify({
                "status": "unhealthy",
                "supabase": "connection_failed",
                "error": str(e),
                "error_type": type(e).__name__,
                "query_time_ms": round(query_time * 1000, 2)
            }), 500
    
    print("✅ App created successfully - ready to accept connections")
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
            app.fsl_predictor = None
            return False
            
    except Exception as e:
        print(f"⚠️ Error initializing FSL model: {e}")
        app.fsl_predictor = None
        return False


# ============================================
# 🚀 Create app instance for Gunicorn
# ============================================
app, socketio = create_app()


# ============================================
# 🏠 For local development only
# ============================================
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 LOCAL DEV MODE")
    print("=" * 50)
    
    port = int(os.getenv('PORT', 5000))
    print(f"✅ Server ready at http://localhost:{port}")
    
    socketio.run(app, debug=True, host='0.0.0.0', port=port)