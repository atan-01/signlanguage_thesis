from flask import Blueprint, render_template, session, redirect, url_for, current_app
import cv2
import mediapipe as mp
import pickle
import numpy as np
from collections import deque
import os

# Create blueprint
translator_bp = Blueprint('translator', __name__, url_prefix='/main')

# Sign Language Detector Class
class WebSignLanguageDetector:
    def __init__(self, model_path='./model_alphabetc.p', confidence_threshold=0.7):
        self.model_loaded = False
        self.model_path = model_path
        
        self.load_model()
        
        #mediapipe components
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=confidence_threshold,
            min_tracking_confidence=0.5
        )
        
        self.prediction_window = deque(maxlen=5) #10
        self.confidence_window = deque(maxlen=5) #10
        
        self.stable_prediction = "No gesture"
        self.detection_confidence = 0.0
        
        self.custom_class_names = {
            '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'F',
            '6': 'G', '7': 'H', '8': 'I', '9': 'K', '10': 'L', '11': 'M',
            '12': 'N', '13': 'O', '14': 'P', '15': 'Q', '16': 'R', '17': 'T',
            '18': 'U', '19': 'V', '20': 'W', '21': 'X', '22': 'Y', '23': 'ILY'
        }

    def load_model(self):
        try:
            if os.path.exists(self.model_path):
                with open(self.model_path, 'rb') as f:
                    model_data = pickle.load(f)
                
                self.model = model_data['model']
                self.scaler = model_data['scaler']
                self.label_encoder = model_data['label_encoder']
                self.classes = model_data['classes']
                self.model_loaded = True
                print(f"Model loaded successfully: {model_data.get('model_name', 'Unknown')}")
            else:
                print(f"Model file not found: {self.model_path}")
                print("Running in demo mode without actual predictions")
        except Exception as e:
            print(f"Error loading model: {e}")
            print("Running in demo mode without actual predictions")

    def normalize_hand_landmarks(self, landmarks):
        coords = np.array([(lm.x, lm.y, lm.z) for lm in landmarks])
        center = coords[0]
        coords = coords - center
        scale = np.linalg.norm(coords[9] - coords[0])
        if scale > 0:
            coords = coords / scale
        return coords

    def extract_features_from_hand(self, landmarks):
        coords = self.normalize_hand_landmarks(landmarks)
        raw_features = coords.flatten()
        additional_features = []

        key_points = [0, 4, 8, 12, 16, 20]
        wrist = coords[0]
        for idx in key_points[1:]:
            dist = np.linalg.norm(coords[idx] - wrist)
            additional_features.append(dist)

        finger_tips = [4, 8, 12, 16, 20]
        for i in range(len(finger_tips) - 1):
            for j in range(i + 1, len(finger_tips)):
                dist = np.linalg.norm(coords[finger_tips[i]] - coords[finger_tips[j]])
                additional_features.append(dist)

        x_coords = coords[:, 0]
        y_coords = coords[:, 1]
        hand_width = np.max(x_coords) - np.min(x_coords)
        hand_height = np.max(y_coords) - np.min(y_coords)
        additional_features.extend([hand_width, hand_height])

        return np.concatenate([raw_features, additional_features])

    def validate_hand_detection(self, landmarks):
        coords = np.array([(lm.x, lm.y, lm.z) for lm in landmarks])
        hand_span = np.max(coords, axis=0) - np.min(coords, axis=0)
        
        if hand_span[0] < 0.05 or hand_span[1] < 0.05:
            return False
        if hand_span[0] > 0.8 or hand_span[1] > 0.8:
            return False

        distances = [np.linalg.norm(coords[i] - coords[i + 1]) for i in range(len(coords) - 1)]
        if np.mean(distances) < 0.01:
            return False

        return True

    def process_frame(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_frame)
        
        prediction = "No gesture"
        confidence = 0.0
        landmarks_data = []
        
        if results.multi_hand_landmarks and results.multi_handedness:
            hands_data = []
            valid_hands = 0

            for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
                if not self.validate_hand_detection(hand_landmarks.landmark):
                    continue

                try:
                    landmarks_points = []
                    for lm in hand_landmarks.landmark:
                        landmarks_points.append([lm.x, lm.y])
                    
                    landmarks_data.append({
                        'points': landmarks_points,
                        'connections': [[i, j] for i, j in self.mp_hands.HAND_CONNECTIONS]
                    })
                    
                    if self.model_loaded:
                        features = self.extract_features_from_hand(hand_landmarks.landmark)
                        hands_data.append({
                            'features': features,
                            'label': handedness.classification[0].label
                        })
                        valid_hands += 1
                except Exception as e:
                    print(f"Error processing hand: {e}")
                    continue

            if self.model_loaded and valid_hands > 0:
                if len(hands_data) == 1:
                    features = np.concatenate([hands_data[0]['features'], np.zeros_like(hands_data[0]['features'])])
                else:
                    features = np.concatenate([hands_data[0]['features'], hands_data[1]['features']])

                try:
                    scaled = self.scaler.transform([features])
                    probs = self.model.predict_proba(scaled)[0]
                    top_index = np.argmax(probs)
                    confidence = float(probs[top_index])
                    label = self.label_encoder.inverse_transform([top_index])[0]
                    
                    self.prediction_window.append(label)
                    self.confidence_window.append(confidence)
                    
                    if len(self.prediction_window) > 0:
                        most_common = max(set(self.prediction_window), key=self.prediction_window.count)
                        prediction = self.custom_class_names.get(most_common, most_common)
                        confidence = float(np.mean(self.confidence_window))
                
                except Exception as e:
                    print(f"Error making prediction: {e}")
            else:
                prediction = "Hand detected" if landmarks_data else "No gesture"
                confidence = 0.8 if landmarks_data else 0.0

        return {
            'prediction': prediction,
            'confidence': confidence,
            'landmarks': landmarks_data,
            'model_loaded': self.model_loaded
        }

# Initialize detector
detector = WebSignLanguageDetector()

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
@translator_bp.route('/')
def main():
    """Main translator page - requires login"""
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data:
        return redirect(url_for('auth.index'))
    
    return render_template('main_hand.html', user=user_data)