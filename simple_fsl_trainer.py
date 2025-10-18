# simple_fsl_trainer.py - Simple Random Forest trainer for FSL motion recognition
import numpy as np
import json
import os
from typing import Dict, List, Tuple
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score
import joblib

class SimpleFSLTrainer:
    """
    Simple FSL trainer using only Random Forest
    No TensorFlow, no plotting, just core functionality
    """
    
    def __init__(self):
        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.feature_names = []
        self.class_names = []
        
    def load_features(self, features_dir: str) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """Load features from the feature extraction output"""
        # Check if files exist
        features_file = os.path.join(features_dir, "features.npy")
        labels_file = os.path.join(features_dir, "labels.npy")
        names_file = os.path.join(features_dir, "feature_names.json")
        
        if not os.path.exists(features_file):
            raise FileNotFoundError(f"Features file not found: {features_file}")
        if not os.path.exists(labels_file):
            raise FileNotFoundError(f"Labels file not found: {labels_file}")
        if not os.path.exists(names_file):
            raise FileNotFoundError(f"Feature names file not found: {names_file}")
        
        # Load numpy arrays
        X = np.load(features_file)
        y = np.load(labels_file)
        
        # Load feature names
        with open(names_file, 'r') as f:
            feature_names = json.load(f)
        
        # Validate dimensions
        if X.shape[1] != len(feature_names):
            print(f"Warning: Feature count mismatch. Data has {X.shape[1]}, names has {len(feature_names)}")
        
        self.feature_names = feature_names
        self.class_names = list(np.unique(y))
        
        print(f"Loaded features: {X.shape}")
        print(f"Classes: {self.class_names}")
        
        return X, y, feature_names
    
    def prepare_data(self, X: np.ndarray, y: np.ndarray, test_size: float = 0.2) -> Dict:
        """Prepare data for training"""
        # Encode labels
        self.label_encoder = LabelEncoder()
        y_encoded = self.label_encoder.fit_transform(y)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=test_size, random_state=42, stratify=y_encoded
        )
        
        # Scale features
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        data = {
            'X_train': X_train_scaled,
            'X_test': X_test_scaled,
            'y_train': y_train,
            'y_test': y_test
        }
        
        print(f"Training set: {X_train.shape}")
        print(f"Test set: {X_test.shape}")
        
        return data
    
    def train_model(self, data: Dict, n_estimators: int = 200) -> Dict:
        """Train Random Forest model"""
        print(f"\nTraining Random Forest with {n_estimators} trees...")
        
        # Create and train model
        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=20,
            min_samples_split=5,
            random_state=42,
            n_jobs=-1
        )
        
        self.model.fit(data['X_train'], data['y_train'])
        
        # Make predictions
        y_pred_train = self.model.predict(data['X_train'])
        y_pred_test = self.model.predict(data['X_test'])
        
        # Calculate accuracies
        train_accuracy = accuracy_score(data['y_train'], y_pred_train)
        test_accuracy = accuracy_score(data['y_test'], y_pred_test)
        
        # Cross-validation
        cv_scores = cross_val_score(self.model, data['X_train'], data['y_train'], cv=5)
        
        # Generate classification report
        report = classification_report(
            data['y_test'], y_pred_test, 
            target_names=self.class_names, 
            output_dict=True
        )
        
        results = {
            'train_accuracy': train_accuracy,
            'test_accuracy': test_accuracy,
            'cv_mean': cv_scores.mean(),
            'cv_std': cv_scores.std(),
            'classification_report': report
        }
        
        print(f"Train accuracy: {train_accuracy:.4f}")
        print(f"Test accuracy: {test_accuracy:.4f}")
        print(f"CV accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std() * 2:.4f})")
        
        # Print per-class results
        print(f"\nPer-class results:")
        for class_name in self.class_names:
            precision = report[class_name]['precision']
            recall = report[class_name]['recall']
            f1 = report[class_name]['f1-score']
            support = int(report[class_name]['support'])
            print(f"{class_name:12}: P={precision:.3f}, R={recall:.3f}, F1={f1:.3f}, N={support}")
        
        return results
    
    def get_feature_importance(self, top_n: int = 20) -> List[Tuple[str, float]]:
        """Get top N most important features"""
        if self.model is None:
            print("Model not trained yet")
            return []
        
        if not hasattr(self.model, 'feature_importances_'):
            print("Model does not support feature importance")
            return []
        
        # Get feature importance
        importance = self.model.feature_importances_
        
        # Create list of (feature_name, importance) tuples
        feature_importance = list(zip(self.feature_names, importance))
        
        # Sort by importance (descending)
        feature_importance.sort(key=lambda x: x[1], reverse=True)
        
        print(f"\nTop {top_n} most important features:")
        for i, (feature, imp) in enumerate(feature_importance[:top_n]):
            print(f"{i+1:2d}. {feature:20}: {imp:.4f}")
        
        return feature_importance[:top_n]
    
    def save_model(self, output_dir: str = "fsl_models"):
        """Save trained model and metadata"""
        if self.model is None:
            print("No model to save")
            return
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Save Random Forest model
        joblib.dump(self.model, os.path.join(output_dir, "random_forest_model.pkl"))
        
        # Save preprocessing objects
        joblib.dump(self.scaler, os.path.join(output_dir, "scaler.pkl"))
        joblib.dump(self.label_encoder, os.path.join(output_dir, "label_encoder.pkl"))
        
        # Save metadata
        metadata = {
            'feature_names': self.feature_names,
            'class_names': self.class_names,
            'num_features': len(self.feature_names),
            'num_classes': len(self.class_names),
            'model_type': 'random_forest'
        }
        
        with open(os.path.join(output_dir, "model_metadata.json"), 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"\nModel saved to {output_dir}")
        print("Files created:")
        print("- random_forest_model.pkl")
        print("- scaler.pkl") 
        print("- label_encoder.pkl")
        print("- model_metadata.json")
        
        return output_dir


class SimpleFSLPredictor:
    """
    Simple predictor for FSL motion signs using Random Forest
    """
    
    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.feature_names = []
        self.class_names = []
        self.load_model()
    
    def load_model(self):
        """Load trained model and preprocessing objects"""
        try:
            # Load metadata
            with open(os.path.join(self.model_dir, "model_metadata.json"), 'r') as f:
                metadata = json.load(f)
            
            self.feature_names = metadata['feature_names']
            self.class_names = metadata['class_names']
            
            # Load model and preprocessing objects
            self.model = joblib.load(os.path.join(self.model_dir, "random_forest_model.pkl"))
            self.scaler = joblib.load(os.path.join(self.model_dir, "scaler.pkl"))
            self.label_encoder = joblib.load(os.path.join(self.model_dir, "label_encoder.pkl"))
            
            print(f"Model loaded successfully from {self.model_dir}")
            print(f"Supports {len(self.class_names)} classes: {self.class_names}")
            
        except Exception as e:
            print(f"Error loading model: {e}")
            raise
    
    def extract_features_from_sequence(self, sequence_frames: List[Dict]):
        """Extract features from a sequence using the same extractor as training"""
        try:
            from improved_fsl_feature_extractor import ImprovedFSLFeatureExtractor
            
            extractor = ImprovedFSLFeatureExtractor()
            features = extractor.extract_sequence_features(sequence_frames)
            
            return features
        except Exception as e:
            print(f"Error extracting features: {e}")
            return None
    
    def predict(self, sequence_frames: List[Dict]) -> Dict:
        """Predict FSL sign from sequence frames"""
        if not sequence_frames or len(sequence_frames) < 5:
            return {'prediction': 'insufficient_data', 'confidence': 0.0}
        
        if self.model is None:
            return {'prediction': 'model_not_loaded', 'confidence': 0.0}
        
        try:
            # Extract features
            features = self.extract_features_from_sequence(sequence_frames)
            if features is None:
                return {'prediction': 'feature_extraction_failed', 'confidence': 0.0}
            
            # Scale features
            features_scaled = self.scaler.transform(features.reshape(1, -1))
            
            # Make prediction
            prediction_probs = self.model.predict_proba(features_scaled)[0]
            predicted_class_idx = np.argmax(prediction_probs)
            confidence = float(prediction_probs[predicted_class_idx])
            
            # Convert back to original label
            predicted_sign = self.label_encoder.inverse_transform([predicted_class_idx])[0]
            
            # Get all class probabilities
            all_probabilities = {
                self.class_names[i]: float(prob * 100) 
                for i, prob in enumerate(prediction_probs)
            }
            
            return {
                'prediction': predicted_sign,
                'confidence': confidence * 100,  # Convert to percentage
                'model_used': 'random_forest',
                'all_probabilities': all_probabilities
            }
            
        except Exception as e:
            print(f"Prediction error: {e}")
            return {'prediction': 'prediction_error', 'confidence': 0.0}


# CLI for training
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Simple FSL Random Forest Trainer')
    parser.add_argument('--features-dir', required=True, help='Directory with extracted features')
    parser.add_argument('--output-dir', default='fsl_models', help='Output directory for model')
    parser.add_argument('--trees', type=int, default=200, help='Number of trees in Random Forest')
    
    args = parser.parse_args()
    
    # Initialize trainer
    trainer = SimpleFSLTrainer()
    
    try:
        # Load features
        print("Loading features...")
        X, y, feature_names = trainer.load_features(args.features_dir)
        
        # Prepare data
        print("Preparing data...")
        data = trainer.prepare_data(X, y)
        
        # Train model
        print("Training Random Forest model...")
        results = trainer.train_model(data, n_estimators=args.trees)
        
        # Show feature importance
        trainer.get_feature_importance(top_n=15)
        
        # Save model
        model_dir = trainer.save_model(args.output_dir)
        
        print(f"\nTraining completed successfully!")
        print(f"Final test accuracy: {results['test_accuracy']:.4f}")
        
        # Test the predictor
        print("\nTesting predictor...")
        predictor = SimpleFSLPredictor(model_dir)
        print("Prediction system ready!")
        
    except Exception as e:
        print(f"Training failed: {e}")
        import traceback
        traceback.print_exc()


# paste in terminal to run:
# python fsl_model_trainer.py --features-dir fsl_features_improved --output-dir fsl_models_improved