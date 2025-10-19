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
    
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")
    
    supabase: Client = create_client(supabase_url, supabase_key)
    app.config['SUPABASE'] = supabase
    
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    # blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(translator_bp)
    app.register_blueprint(home_bp)
    app.register_blueprint(room_bp)
    app.register_blueprint(learn_bp)
    app.register_blueprint(profile_bp)
    
    initialize_fsl_model(app)
    
    # Verify FSL model is accessible
    if hasattr(app, 'fsl_predictor') and app.fsl_predictor is not None:
        print(f"FSL predictor attached to app successfully")
    else:
        print(f"FSL predictor NOT attached to app")

    # Initialize ALL SocketIO events (FSL predictor must exist before this!)
    init_all_socketio_events(socketio, supabase, detector)

    return app, socketio

def initialize_fsl_model(app):
    # FSL words predictor
    try:
        from simple_fsl_trainer import SimpleFSLPredictor
        
        model_dir = "fsl_movement_model"
        
        if os.path.exists(model_dir):
            # Load the predictor
            app.fsl_predictor = SimpleFSLPredictor(model_dir)

            return True
            
        else:
            print(f"    FSL model directory not found: {model_dir}")
            print(f"    Current directory: {os.getcwd()}")
            print(f"    FSL words feature will not be available")
            
            app.fsl_predictor = None
            return False
            
    except ImportError as e:
        print(f"    Could not import FSL predictor: {e}")
        print(f"    Install required packages: pip install scikit-learn mediapipe opencv-python")
        app.fsl_predictor = None
        return False
        
    except Exception as e:
        print(f"    Error initializing FSL model: {e}")
        import traceback
        traceback.print_exc()
        app.fsl_predictor = None
        return False

if __name__ == '__main__':
    print("Starting Sign Language Detection Server")
    port = int(os.getenv('PORT', 5000))
    app, socketio = create_app()

    print("Server ready! Open http://localhost:5000")
    socketio.run(app, debug=False, host='0.0.0.0', port=port)