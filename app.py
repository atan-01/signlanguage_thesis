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
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-this-in-production')
    
    # Initialize Supabase
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')
    
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")
    
    supabase: Client = create_client(supabase_url, supabase_key)
    app.config['SUPABASE'] = supabase
    
    # Initialize SocketIO
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(translator_bp)
    app.register_blueprint(home_bp)
    app.register_blueprint(room_bp)
    app.register_blueprint(learn_bp)
    app.register_blueprint(profile_bp)

    # 🔥 CRITICAL: Initialize FSL model BEFORE socketio events
    print("\n" + "="*50)
    print("🔄 Initializing FSL Words Model...")
    print("="*50)
    
    initialize_fsl_model(app)
    
    # Verify FSL model is accessible
    if hasattr(app, 'fsl_predictor') and app.fsl_predictor is not None:
        print(f"✅ FSL predictor attached to app successfully")
        print(f"✅ Model ready for socket handlers")
    else:
        print(f"⚠️  FSL predictor NOT attached to app")
        print(f"⚠️  FSL words feature will not work")
    
    print("="*50 + "\n")

    # Initialize ALL SocketIO events (FSL predictor must exist before this!)
    init_all_socketio_events(socketio, supabase, detector)

    return app, socketio


def initialize_fsl_model(app):
    """
    Initialize FSL (Filipino Sign Language) words predictor
    """
    try:
        # Import the FSL predictor
        from simple_fsl_trainer import SimpleFSLPredictor
        
        # Path to your trained FSL model
        model_dir = "fsl_models_improved"
        
        if os.path.exists(model_dir):
            print(f"📁 Found model directory: {model_dir}")
            
            # List files in directory for debugging
            model_files = os.listdir(model_dir)
            print(f"📄 Model files: {model_files}")
            
            # Load the predictor
            app.fsl_predictor = SimpleFSLPredictor(model_dir)
            
            print(f"✅ FSL words model loaded successfully")
            print(f"📚 Supports {len(app.fsl_predictor.class_names)} FSL words:")
            
            # Print words in a nice format
            words = ', '.join(app.fsl_predictor.class_names)
            print(f"   {words}")
            
            return True
            
        else:
            print(f"❌ FSL model directory not found: {model_dir}")
            print(f"   Current directory: {os.getcwd()}")
            print(f"   FSL words feature will not be available")
            
            app.fsl_predictor = None
            return False
            
    except ImportError as e:
        print(f"❌ Could not import FSL predictor: {e}")
        print(f"   Install required packages: pip install scikit-learn mediapipe opencv-python")
        app.fsl_predictor = None
        return False
        
    except Exception as e:
        print(f"❌ Error initializing FSL model: {e}")
        import traceback
        traceback.print_exc()
        app.fsl_predictor = None
        return False


def check_fsl_dependencies():
    """
    Check if all required dependencies for FSL words are installed
    """
    print("\n" + "="*50)
    print("Checking FSL Dependencies...")
    print("="*50)
    
    missing_deps = []
    
    try:
        import mediapipe
        print("✓ MediaPipe available")
    except ImportError:
        missing_deps.append("mediapipe")
        print("✗ MediaPipe not available")
    
    try:
        import sklearn
        print("✓ Scikit-learn available")
    except ImportError:
        missing_deps.append("scikit-learn")
        print("✗ Scikit-learn not available")
    
    try:
        import cv2
        print("✓ OpenCV available")
    except ImportError:
        missing_deps.append("opencv-python")
        print("✗ OpenCV not available")
    
    try:
        from PIL import Image
        print("✓ Pillow available")
    except ImportError:
        missing_deps.append("pillow")
        print("✗ Pillow not available")
    
    if missing_deps:
        print(f"\n⚠️  Missing dependencies: {', '.join(missing_deps)}")
        print(f"Install with: pip install {' '.join(missing_deps)}")
        print("="*50 + "\n")
        return False
    else:
        print("\n✅ All FSL dependencies are installed")
        print("="*50 + "\n")
        return True


def check_fsl_model_status():
    """
    Check if FSL model is trained and ready
    """
    print("\n" + "="*50)
    print("Checking FSL Model Status...")
    print("="*50)
    
    model_dir = "fsl_models_improved"
    required_files = [
        'random_forest_model.pkl',
        'scaler.pkl',
        'label_encoder.pkl',
        'model_metadata.json'
    ]
    
    if not os.path.exists(model_dir):
        print(f"❌ FSL model directory not found: {model_dir}")
        print(f"   Current directory: {os.getcwd()}")
        print("="*50 + "\n")
        return False
    
    print(f"✓ Model directory found: {model_dir}")
    
    missing_files = []
    for file in required_files:
        file_path = os.path.join(model_dir, file)
        if os.path.exists(file_path):
            size = os.path.getsize(file_path) / 1024  # KB
            print(f"   ✓ {file} ({size:.1f} KB)")
        else:
            print(f"   ✗ {file} (MISSING)")
            missing_files.append(file)
    
    if missing_files:
        print(f"\n⚠️  Missing files: {', '.join(missing_files)}")
        print("="*50 + "\n")
        return False
    
    print(f"\n✅ All FSL model files present")
    print("="*50 + "\n")
    return True


if __name__ == '__main__':
    print("\n" + "🚀 "*25)
    print("Starting Sign Language Detection Server")
    print("🚀 "*25 + "\n")
    
    # Check dependencies first
    deps_ok = check_fsl_dependencies()
    model_ok = check_fsl_model_status()
    
    if not deps_ok:
        print("⚠️  WARNING: Some dependencies are missing")
        print("   FSL words feature may not work properly\n")
    
    if not model_ok:
        print("⚠️  WARNING: FSL model files not found")
        print("   FSL words feature will not be available\n")
    
    # Create and run app
    app, socketio = create_app()
    
    print("\n" + "✅ "*25)
    print("Server ready! Open http://localhost:5000")
    print("✅ "*25 + "\n")
    
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)