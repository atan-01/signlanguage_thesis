import json
import numpy as np
from typing import Dict, List, Tuple, Optional
from scipy import signal
from scipy.spatial.distance import euclidean
import os
from sklearn.preprocessing import StandardScaler, LabelEncoder
import pickle

class ImprovedFSLFeatureExtractor:
    def __init__(self):
        self.feature_names = []
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        
        # Feature extraction configuration
        self.config = {
            'window_size': 5,
            'smoothing_window': 3,
            'spatial_features': True,
            'temporal_features': True,
            'geometric_features': True,
            'statistical_features': True,
            'trajectory_features': True
        }
        
        self._initialize_feature_names()
        
    def _initialize_feature_names(self):
        """Initialize comprehensive feature names"""
        self.feature_names = []
        
        # Spatial features (30: 15 per hand × 2 hands)
        for hand_idx in range(2):
            hand_prefix = f"hand{hand_idx}_"
            self.feature_names.extend([
                f"{hand_prefix}avg_span", f"{hand_prefix}avg_finger_spread", 
                f"{hand_prefix}avg_orientation", f"{hand_prefix}std_orientation",
                f"{hand_prefix}palm_center_x", f"{hand_prefix}palm_center_y",
                f"{hand_prefix}palm_std_x", f"{hand_prefix}palm_std_y",
                f"{hand_prefix}palm_range_x", f"{hand_prefix}palm_range_y",
                f"{hand_prefix}thumb_bend", f"{hand_prefix}index_bend",
                f"{hand_prefix}middle_bend", f"{hand_prefix}ring_bend", f"{hand_prefix}pinky_bend"
            ])
        
        # Enhanced temporal features (12: 6 per hand × 2 hands)
        for hand_idx in range(2):
            hand_prefix = f"hand{hand_idx}_"
            self.feature_names.extend([
                f"{hand_prefix}avg_velocity", f"{hand_prefix}std_velocity",
                f"{hand_prefix}avg_acceleration", f"{hand_prefix}max_acceleration",
                f"{hand_prefix}velocity_changes", f"{hand_prefix}smooth_ratio"
            ])
        
        # Geometric features (4: 2 per hand × 2 hands)
        for hand_idx in range(2):
            hand_prefix = f"hand{hand_idx}_"
            self.feature_names.extend([
                f"{hand_prefix}thumb_index_dist", f"{hand_prefix}wrist_middle_dist"
            ])
        
        # Statistical features (8: 4 per hand × 2 hands)
        for hand_idx in range(2):
            hand_prefix = f"hand{hand_idx}_"
            self.feature_names.extend([
                f"{hand_prefix}mean_x", f"{hand_prefix}mean_y",
                f"{hand_prefix}std_x", f"{hand_prefix}std_y"
            ])
        
        # NEW: Enhanced trajectory features (16: 8 per hand × 2 hands)
        for hand_idx in range(2):
            hand_prefix = f"hand{hand_idx}_"
            self.feature_names.extend([
                f"{hand_prefix}circularity", f"{hand_prefix}angularity",
                f"{hand_prefix}corner_count", f"{hand_prefix}path_regularity",
                f"{hand_prefix}direction_changes", f"{hand_prefix}straightness",
                f"{hand_prefix}curvature_variance", f"{hand_prefix}symmetry_score"
            ])
        
        # Global motion features (6)
        self.feature_names.extend([
            "avg_hands_detected", "hand_separation_change",
            "relative_motion", "dominant_hand_activity",
            "synchronization_score", "overall_complexity"
        ])
    
    def extract_features_from_dataset(self, dataset_path: str) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """Extract features from the entire dataset"""
        with open(dataset_path, 'r') as f:
            dataset = json.load(f)
        
        all_features = []
        all_labels = []
        
        print(f"Extracting enhanced features from {len(dataset)} signs...")
        
        for sign_name, sequences in dataset.items():
            print(f"Processing {sign_name}: {len(sequences)} sequences")
            
            for i, sequence in enumerate(sequences):
                try:
                    features = self.extract_sequence_features(sequence['frames'])
                    if features is not None and len(features) > 0:
                        all_features.append(features)
                        all_labels.append(sign_name)
                    else:
                        print(f"  Warning: Failed to extract features from sequence {i+1}")
                except Exception as e:
                    print(f"  Error processing sequence {i+1}: {e}")
                    continue
        
        if not all_features:
            raise ValueError("No valid sequences found in dataset for feature extraction.")
        
        X = np.array(all_features)
        y = np.array(all_labels)
        
        print(f"Extracted {X.shape[0]} feature vectors with {X.shape[1]} features each")
        print(f"Expected feature count: {len(self.feature_names)}")
        
        return X, y, self.feature_names
    
    def extract_sequence_features(self, frames: List[Dict]) -> Optional[np.ndarray]:
        """Extract enhanced features from a single sequence"""
        if not frames or len(frames) < 5:
            return None
        
        try:
            landmarks_sequence = self.preprocess_sequence(frames)
            if landmarks_sequence is None:
                return None
            
            features = []
            
            # Spatial features (30)
            if self.config['spatial_features']:
                spatial_features = self.extract_spatial_features(landmarks_sequence)
                features.extend(spatial_features)
            
            # Enhanced temporal features (12)
            if self.config['temporal_features']:
                temporal_features = self.extract_enhanced_temporal_features(landmarks_sequence)
                features.extend(temporal_features)
            
            # Geometric features (4)
            if self.config['geometric_features']:
                geometric_features = self.extract_geometric_features(landmarks_sequence)
                features.extend(geometric_features)
            
            # Statistical features (8)
            if self.config['statistical_features']:
                statistical_features = self.extract_statistical_features(landmarks_sequence)
                features.extend(statistical_features)
            
            # NEW: Enhanced trajectory features (16)
            if self.config['trajectory_features']:
                trajectory_features = self.extract_trajectory_features(landmarks_sequence)
                features.extend(trajectory_features)
            
            # Global motion features (6)
            global_features = self.extract_global_features(landmarks_sequence, frames)
            features.extend(global_features)
            
            return np.array(features)
            
        except Exception as e:
            print(f"Error in extract_sequence_features: {e}")
            return None
    
    def preprocess_sequence(self, frames: List[Dict]) -> Optional[np.ndarray]:
        """Convert raw frame data to structured landmarks array"""
        try:
            sequence_landmarks = []
            
            for frame in frames:
                frame_landmarks = []
                hands = frame.get('hands', [])
                
                # Ensure exactly 2 hands (pad with zeros if needed)
                while len(hands) < 2:
                    hands.append({'landmarks': [{'x': 0, 'y': 0, 'z': 0}] * 21})
                
                for hand in hands[:2]:
                    hand_landmarks = []
                    landmarks = hand.get('landmarks', [])
                    
                    # Ensure exactly 21 landmarks per hand
                    while len(landmarks) < 21:
                        landmarks.append({'x': 0, 'y': 0, 'z': 0})
                    
                    for landmark in landmarks[:21]:
                        hand_landmarks.append([
                            float(landmark.get('x', 0)),
                            float(landmark.get('y', 0)),
                            float(landmark.get('z', 0))
                        ])
                    
                    frame_landmarks.append(hand_landmarks)
                
                sequence_landmarks.append(frame_landmarks)
            
            landmarks_array = np.array(sequence_landmarks, dtype=np.float32)
            landmarks_array = self.smooth_sequence(landmarks_array)
            landmarks_array = self.normalize_sequence(landmarks_array)
            
            return landmarks_array
            
        except Exception as e:
            print(f"Error in preprocess_sequence: {e}")
            return None
    
    def smooth_sequence(self, landmarks_array: np.ndarray) -> np.ndarray:
        """Apply smoothing filter to reduce noise"""
        if landmarks_array.shape[0] < self.config['smoothing_window']:
            return landmarks_array
        
        try:
            window = np.ones(self.config['smoothing_window']) / self.config['smoothing_window']
            smoothed = landmarks_array.copy()
            
            for hand in range(landmarks_array.shape[1]):
                for landmark in range(landmarks_array.shape[2]):
                    for coord in range(landmarks_array.shape[3]):
                        sequence = landmarks_array[:, hand, landmark, coord]
                        if np.any(sequence != 0):
                            smoothed_seq = np.convolve(sequence, window, mode='same')
                            smoothed[:, hand, landmark, coord] = smoothed_seq
            
            return smoothed
        except Exception as e:
            print(f"Error in smoothing: {e}")
            return landmarks_array
    
    def normalize_sequence(self, landmarks_array: np.ndarray) -> np.ndarray:
        """Normalize landmarks relative to wrist position"""
        try:
            normalized = landmarks_array.copy()
            
            for frame in range(landmarks_array.shape[0]):
                for hand in range(landmarks_array.shape[1]):
                    wrist = landmarks_array[frame, hand, 0]
                    if np.any(wrist != 0):
                        normalized[frame, hand, :, :] = landmarks_array[frame, hand, :, :] - wrist
            
            return normalized
        except Exception as e:
            print(f"Error in normalization: {e}")
            return landmarks_array
    
    def extract_spatial_features(self, landmarks_sequence: np.ndarray) -> List[float]:
        """Extract spatial features (same as before but more robust)"""
        features = []
        
        for hand_idx in range(2):
            try:
                if hand_idx >= landmarks_sequence.shape[1]:
                    features.extend([0] * 15)
                    continue
                
                hand_landmarks = landmarks_sequence[:, hand_idx, :, :2]
                
                if not np.any(hand_landmarks):
                    features.extend([0] * 15)
                    continue
                
                # Hand span
                thumb_tip = hand_landmarks[:, 4]
                pinky_tip = hand_landmarks[:, 20]
                hand_spans = []
                for i in range(len(thumb_tip)):
                    if not (np.allclose(thumb_tip[i], 0) or np.allclose(pinky_tip[i], 0)):
                        hand_spans.append(euclidean(thumb_tip[i], pinky_tip[i]))
                features.append(np.mean(hand_spans) if hand_spans else 0)
                
                # Finger spread
                finger_tips = [4, 8, 12, 16, 20]
                spreads = []
                for frame in range(landmarks_sequence.shape[0]):
                    frame_spreads = []
                    for i in range(len(finger_tips)-1):
                        tip1 = hand_landmarks[frame, finger_tips[i]]
                        tip2 = hand_landmarks[frame, finger_tips[i+1]]
                        if not (np.allclose(tip1, 0) or np.allclose(tip2, 0)):
                            frame_spreads.append(euclidean(tip1, tip2))
                    if frame_spreads:
                        spreads.append(np.mean(frame_spreads))
                features.append(np.mean(spreads) if spreads else 0)
                
                # Hand orientation
                wrist = hand_landmarks[:, 0]
                middle_mcp = hand_landmarks[:, 9]
                orientations = []
                for frame in range(len(wrist)):
                    if not (np.allclose(wrist[frame], 0) or np.allclose(middle_mcp[frame], 0)):
                        vec = middle_mcp[frame] - wrist[frame]
                        angle = np.arctan2(vec[1], vec[0])
                        orientations.append(angle)
                
                avg_orientation = np.mean(orientations) if orientations else 0
                std_orientation = np.std(orientations) if orientations else 0
                features.extend([avg_orientation, std_orientation])
                
                # Palm position statistics
                palm_center = np.mean(hand_landmarks, axis=2)
                palm_positions = []
                for frame in range(len(palm_center)):
                    if not np.allclose(palm_center[frame], 0):
                        palm_positions.append(palm_center[frame])
                
                if palm_positions:
                    palm_positions = np.array(palm_positions)
                    features.extend([
                        np.mean(palm_positions[:, 0]), np.mean(palm_positions[:, 1]),
                        np.std(palm_positions[:, 0]), np.std(palm_positions[:, 1]),
                        np.max(palm_positions[:, 0]) - np.min(palm_positions[:, 0]),
                        np.max(palm_positions[:, 1]) - np.min(palm_positions[:, 1])
                    ])
                else:
                    features.extend([0] * 6)
                
                # Finger bends (simplified)
                finger_indices = [[1,2,3,4], [5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]]
                finger_bends = []
                
                for finger in finger_indices:
                    finger_landmarks = hand_landmarks[:, finger, :]
                    bends = []
                    for frame in range(landmarks_sequence.shape[0]):
                        base = finger_landmarks[frame, 0]
                        tip = finger_landmarks[frame, -1]
                        if not (np.allclose(base, 0) or np.allclose(tip, 0)):
                            bend = euclidean(base, tip)
                            bends.append(bend)
                    finger_bends.append(np.mean(bends) if bends else 0)
                
                features.extend(finger_bends)
                
            except Exception as e:
                print(f"Error in spatial features for hand {hand_idx}: {e}")
                features.extend([0] * 15)
        
        # Ensure exactly 30 features
        while len(features) < 30:
            features.append(0)
        return features[:30]
    
    def extract_enhanced_temporal_features(self, landmarks_sequence: np.ndarray) -> List[float]:
        """Extract enhanced temporal features with better motion analysis"""
        features = []
        
        for hand_idx in range(2):
            try:
                if hand_idx >= landmarks_sequence.shape[1] or landmarks_sequence.shape[0] < 2:
                    features.extend([0] * 6)
                    continue
                
                wrist_positions = landmarks_sequence[:, hand_idx, 0, :2]
                
                # Calculate velocities
                velocities = []
                for i in range(1, len(wrist_positions)):
                    if not (np.allclose(wrist_positions[i], 0) or np.allclose(wrist_positions[i-1], 0)):
                        velocity = euclidean(wrist_positions[i], wrist_positions[i-1])
                        velocities.append(velocity)
                
                if velocities:
                    features.extend([
                        np.mean(velocities),  # avg velocity
                        np.std(velocities)    # velocity consistency
                    ])
                else:
                    features.extend([0, 0])
                
                # Calculate accelerations
                accelerations = []
                if len(velocities) > 1:
                    for i in range(1, len(velocities)):
                        acceleration = abs(velocities[i] - velocities[i-1])
                        accelerations.append(acceleration)
                
                if accelerations:
                    features.extend([
                        np.mean(accelerations),  # avg acceleration
                        np.max(accelerations)    # max acceleration
                    ])
                else:
                    features.extend([0, 0])
                
                # Velocity change patterns
                velocity_changes = len([i for i in range(1, len(velocities)) if abs(velocities[i] - velocities[i-1]) > np.std(velocities) * 0.5]) if len(velocities) > 1 else 0
                features.append(velocity_changes)
                
                # Movement smoothness
                if len(velocities) > 2:
                    smooth_ratio = 1 - (np.std(velocities) / (np.mean(velocities) + 1e-8))
                    features.append(max(0, smooth_ratio))
                else:
                    features.append(0)
                
            except Exception as e:
                print(f"Error in temporal features for hand {hand_idx}: {e}")
                features.extend([0] * 6)
        
        # Ensure exactly 12 features
        while len(features) < 12:
            features.append(0)
        return features[:12]
    
    def extract_geometric_features(self, landmarks_sequence: np.ndarray) -> List[float]:
        """Extract geometric features"""
        features = []
        
        for hand_idx in range(2):
            try:
                if hand_idx >= landmarks_sequence.shape[1]:
                    features.extend([0, 0])
                    continue
                
                hand_landmarks = landmarks_sequence[:, hand_idx, :, :2]
                if not np.any(hand_landmarks):
                    features.extend([0, 0])
                    continue
                
                # Thumb-index distance
                thumb_index_dists = []
                for i in range(len(hand_landmarks)):
                    if not (np.allclose(hand_landmarks[i, 4], 0) or np.allclose(hand_landmarks[i, 8], 0)):
                        dist = euclidean(hand_landmarks[i, 4], hand_landmarks[i, 8])
                        thumb_index_dists.append(dist)
                features.append(np.mean(thumb_index_dists) if thumb_index_dists else 0)
                
                # Wrist-middle distance
                wrist_middle_dists = []
                for i in range(len(hand_landmarks)):
                    if not (np.allclose(hand_landmarks[i, 0], 0) or np.allclose(hand_landmarks[i, 12], 0)):
                        dist = euclidean(hand_landmarks[i, 0], hand_landmarks[i, 12])
                        wrist_middle_dists.append(dist)
                features.append(np.mean(wrist_middle_dists) if wrist_middle_dists else 0)
                
            except Exception as e:
                print(f"Error in geometric features for hand {hand_idx}: {e}")
                features.extend([0, 0])
        
        # Ensure exactly 4 features
        while len(features) < 4:
            features.append(0)
        return features[:4]
    
    def extract_statistical_features(self, landmarks_sequence: np.ndarray) -> List[float]:
        """Extract statistical features"""
        features = []
        
        for hand_idx in range(2):
            try:
                if hand_idx >= landmarks_sequence.shape[1]:
                    features.extend([0, 0, 0, 0])
                    continue
                
                hand_landmarks = landmarks_sequence[:, hand_idx, :, :2].reshape(-1, 2)
                if not np.any(hand_landmarks):
                    features.extend([0, 0, 0, 0])
                    continue
                
                # Filter out zero landmarks
                valid_landmarks = hand_landmarks[~np.all(hand_landmarks == 0, axis=1)]
                
                if len(valid_landmarks) > 0:
                    features.extend([
                        np.mean(valid_landmarks[:, 0]),
                        np.mean(valid_landmarks[:, 1]),
                        np.std(valid_landmarks[:, 0]),
                        np.std(valid_landmarks[:, 1])
                    ])
                else:
                    features.extend([0, 0, 0, 0])
                
            except Exception as e:
                print(f"Error in statistical features for hand {hand_idx}: {e}")
                features.extend([0, 0, 0, 0])
        
        # Ensure exactly 8 features
        while len(features) < 8:
            features.append(0)
        return features[:8]
    
    def extract_trajectory_features(self, landmarks_sequence: np.ndarray) -> List[float]:
        """NEW: Extract enhanced trajectory features to distinguish gesture shapes"""
        features = []
        
        for hand_idx in range(2):
            try:
                if hand_idx >= landmarks_sequence.shape[1]:
                    features.extend([0] * 8)
                    continue
                
                # Use wrist position for trajectory analysis
                wrist_positions = landmarks_sequence[:, hand_idx, 0, :2]
                
                # Filter out zero positions
                valid_positions = []
                for pos in wrist_positions:
                    if not np.allclose(pos, 0):
                        valid_positions.append(pos)
                
                if len(valid_positions) < 5:
                    features.extend([0] * 8)
                    continue
                
                valid_positions = np.array(valid_positions)
                
                # 1. Circularity score
                circularity = self.calculate_circularity(valid_positions)
                features.append(circularity)
                
                # 2. Angularity score (corner detection)
                angularity = self.calculate_angularity(valid_positions)
                features.append(angularity)
                
                # 3. Corner count
                corner_count = self.count_corners(valid_positions)
                features.append(corner_count)
                
                # 4. Path regularity
                regularity = self.calculate_path_regularity(valid_positions)
                features.append(regularity)
                
                # 5. Direction changes
                direction_changes = self.count_direction_changes(valid_positions)
                features.append(direction_changes)
                
                # 6. Straightness index
                straightness = self.calculate_straightness(valid_positions)
                features.append(straightness)
                
                # 7. Curvature variance
                curvature_variance = self.calculate_curvature_variance(valid_positions)
                features.append(curvature_variance)
                
                # 8. Symmetry score
                symmetry = self.calculate_symmetry_score(valid_positions)
                features.append(symmetry)
                
            except Exception as e:
                print(f"Error in trajectory features for hand {hand_idx}: {e}")
                features.extend([0] * 8)
        
        # Ensure exactly 16 features
        while len(features) < 16:
            features.append(0)
        return features[:16]
    
    def calculate_circularity(self, positions: np.ndarray) -> float:
        """Calculate how circular a path is (1.0 = perfect circle, 0.0 = not circular)"""
        if len(positions) < 5:
            return 0.0
        
        try:
            center = np.mean(positions, axis=0)
            radii = [np.linalg.norm(pos - center) for pos in positions]
            
            if np.mean(radii) == 0:
                return 0.0
            
            # Circularity = 1 - coefficient of variation of radii
            circularity = 1 - (np.std(radii) / np.mean(radii))
            return max(0, min(1, circularity))
        except:
            return 0.0
    
    def calculate_angularity(self, positions: np.ndarray) -> float:
        """Calculate how angular/sharp a path is (good for detecting squares)"""
        if len(positions) < 4:
            return 0.0
        
        try:
            sharp_angles = 0
            for i in range(2, len(positions)):
                v1 = positions[i-1] - positions[i-2]
                v2 = positions[i] - positions[i-1]
                
                norm1, norm2 = np.linalg.norm(v1), np.linalg.norm(v2)
                if norm1 > 0 and norm2 > 0:
                    cos_angle = np.dot(v1, v2) / (norm1 * norm2)
                    cos_angle = np.clip(cos_angle, -1, 1)
                    angle = np.arccos(cos_angle)
                    
                    # Count sharp angles (< 120 degrees)
                    if angle < 2 * np.pi / 3:
                        sharp_angles += 1
            
            return sharp_angles / max(1, len(positions) - 2)
        except:
            return 0.0
    
    def count_corners(self, positions: np.ndarray) -> float:
        """Count distinct corners in the path"""
        if len(positions) < 6:
            return 0.0
        
        try:
            corners = 0
            angle_threshold = np.pi / 3  # 60 degrees
            
            for i in range(2, len(positions) - 2):
                v1 = positions[i] - positions[i-2]
                v2 = positions[i+2] - positions[i]
                
                norm1, norm2 = np.linalg.norm(v1), np.linalg.norm(v2)
                if norm1 > 0 and norm2 > 0:
                    cos_angle = np.dot(v1, v2) / (norm1 * norm2)
                    cos_angle = np.clip(cos_angle, -1, 1)
                    angle = np.arccos(cos_angle)
                    
                    if angle > angle_threshold:
                        corners += 1
            
            return min(corners, 8)  # Cap at 8 to normalize
        except:
            return 0.0
    
    def calculate_path_regularity(self, positions: np.ndarray) -> float:
        """Calculate how regular/consistent the path spacing is"""
        if len(positions) < 3:
            return 0.0
        
        try:
            distances = []
            for i in range(1, len(positions)):
                dist = np.linalg.norm(positions[i] - positions[i-1])
                distances.append(dist)
            
            if len(distances) == 0 or np.mean(distances) == 0:
                return 0.0
            
            regularity = 1 - (np.std(distances) / np.mean(distances))
            return max(0, min(1, regularity))
        except:
            return 0.0
    
    def count_direction_changes(self, positions: np.ndarray) -> float:
        """Count significant direction changes"""
        if len(positions) < 3:
            return 0.0
        
        try:
            direction_changes = 0
            threshold = np.pi / 6  # 30 degrees
            
            for i in range(1, len(positions) - 1):
                v1 = positions[i] - positions[i-1]
                v2 = positions[i+1] - positions[i]
                
                norm1, norm2 = np.linalg.norm(v1), np.linalg.norm(v2)
                if norm1 > 0 and norm2 > 0:
                    cos_angle = np.dot(v1, v2) / (norm1 * norm2)
                    cos_angle = np.clip(cos_angle, -1, 1)
                    angle = np.arccos(cos_angle)
                    
                    if angle > threshold:
                        direction_changes += 1
            
            return min(direction_changes, 20) / 20.0  # Normalize
        except:
            return 0.0
    
    def calculate_straightness(self, positions: np.ndarray) -> float:
        """Calculate how straight the overall path is"""
        if len(positions) < 2:
            return 0.0
        
        try:
            total_path_length = sum(np.linalg.norm(positions[i] - positions[i-1]) 
                                  for i in range(1, len(positions)))
            direct_distance = np.linalg.norm(positions[-1] - positions[0])
            
            if total_path_length == 0:
                return 0.0
            
            straightness = direct_distance / total_path_length
            return min(1, straightness)
        except:
            return 0.0
    
    def calculate_curvature_variance(self, positions: np.ndarray) -> float:
        """Calculate variance in curvature along the path"""
        if len(positions) < 4:
            return 0.0
        
        try:
            curvatures = []
            for i in range(1, len(positions) - 1):
                v1 = positions[i] - positions[i-1]
                v2 = positions[i+1] - positions[i]
                
                # Calculate curvature approximation
                cross_product = np.cross(v1, v2)
                v1_norm = np.linalg.norm(v1)
                
                if v1_norm > 0:
                    curvature = abs(cross_product) / (v1_norm ** 3)
                    curvatures.append(curvature)
            
            return np.std(curvatures) if curvatures else 0.0
        except:
            return 0.0
    
    def calculate_symmetry_score(self, positions: np.ndarray) -> float:
        """Calculate how symmetric the path is"""
        if len(positions) < 4:
            return 0.0
        
        try:
            center = np.mean(positions, axis=0)
            
            # Check symmetry by comparing distances from center
            distances = [np.linalg.norm(pos - center) for pos in positions]
            
            if len(distances) < 4:
                return 0.0
            
            # Compare first half with second half (reversed)
            mid = len(distances) // 2
            first_half = distances[:mid]
            second_half = distances[-mid:][::-1]  # reversed
            
            if len(first_half) != len(second_half) or len(first_half) == 0:
                return 0.0
            
            # Calculate correlation between halves
            if np.std(first_half) > 0 and np.std(second_half) > 0:
                correlation = np.corrcoef(first_half, second_half)[0, 1]
                return max(0, correlation) if not np.isnan(correlation) else 0.0
            else:
                return 0.0
        except:
            return 0.0
    
    def extract_global_features(self, landmarks_sequence: np.ndarray, frames: List[Dict]) -> List[float]:
        """Extract global motion features across both hands"""
        features = []
        
        try:
            # 1. Average hands detected
            avg_hands = np.mean([len(frame.get('hands', [])) for frame in frames])
            features.append(avg_hands)
            
            # 2. Hand separation change
            if landmarks_sequence.shape[1] >= 2:
                separations = []
                for frame in range(landmarks_sequence.shape[0]):
                    left_wrist = landmarks_sequence[frame, 0, 0, :2]
                    right_wrist = landmarks_sequence[frame, 1, 0, :2]
                    
                    if not (np.allclose(left_wrist, 0) or np.allclose(right_wrist, 0)):
                        separation = np.linalg.norm(left_wrist - right_wrist)
                        separations.append(separation)
                
                if len(separations) > 1:
                    separation_change = abs(separations[-1] - separations[0])
                    features.append(separation_change)
                else:
                    features.append(0)
            else:
                features.append(0)
            
            # 3. Relative motion (which hand moves more)
            left_motion = self.calculate_hand_motion(landmarks_sequence, 0)
            right_motion = self.calculate_hand_motion(landmarks_sequence, 1)
            total_motion = left_motion + right_motion
            
            if total_motion > 0:
                relative_motion = abs(left_motion - right_motion) / total_motion
            else:
                relative_motion = 0
            features.append(relative_motion)
            
            # 4. Dominant hand activity
            if total_motion > 0:
                dominant_activity = max(left_motion, right_motion) / total_motion
            else:
                dominant_activity = 0
            features.append(dominant_activity)
            
            # 5. Hand synchronization score
            sync_score = self.calculate_hand_synchronization(landmarks_sequence)
            features.append(sync_score)
            
            # 6. Overall complexity (combination of various factors)
            complexity = self.calculate_gesture_complexity(landmarks_sequence)
            features.append(complexity)
            
        except Exception as e:
            print(f"Error in global features: {e}")
            features = [0] * 6
        
        # Ensure exactly 6 features
        while len(features) < 6:
            features.append(0)
        return features[:6]
    
    def calculate_hand_motion(self, landmarks_sequence: np.ndarray, hand_idx: int) -> float:
        """Calculate total motion for a specific hand"""
        if hand_idx >= landmarks_sequence.shape[1] or landmarks_sequence.shape[0] < 2:
            return 0.0
        
        try:
            wrist_positions = landmarks_sequence[:, hand_idx, 0, :2]
            total_motion = 0
            
            for i in range(1, len(wrist_positions)):
                if not (np.allclose(wrist_positions[i], 0) or np.allclose(wrist_positions[i-1], 0)):
                    motion = np.linalg.norm(wrist_positions[i] - wrist_positions[i-1])
                    total_motion += motion
            
            return total_motion
        except:
            return 0.0
    
    def calculate_hand_synchronization(self, landmarks_sequence: np.ndarray) -> float:
        """Calculate how synchronized the two hands are"""
        if landmarks_sequence.shape[1] < 2 or landmarks_sequence.shape[0] < 3:
            return 0.0
        
        try:
            left_velocities = []
            right_velocities = []
            
            for i in range(1, landmarks_sequence.shape[0]):
                # Left hand velocity
                left_pos = landmarks_sequence[i, 0, 0, :2]
                left_prev = landmarks_sequence[i-1, 0, 0, :2]
                if not (np.allclose(left_pos, 0) or np.allclose(left_prev, 0)):
                    left_vel = np.linalg.norm(left_pos - left_prev)
                    left_velocities.append(left_vel)
                
                # Right hand velocity
                right_pos = landmarks_sequence[i, 1, 0, :2]
                right_prev = landmarks_sequence[i-1, 1, 0, :2]
                if not (np.allclose(right_pos, 0) or np.allclose(right_prev, 0)):
                    right_vel = np.linalg.norm(right_pos - right_prev)
                    right_velocities.append(right_vel)
            
            # Calculate correlation between velocity patterns
            min_len = min(len(left_velocities), len(right_velocities))
            if min_len > 2:
                left_vel = left_velocities[:min_len]
                right_vel = right_velocities[:min_len]
                
                if np.std(left_vel) > 0 and np.std(right_vel) > 0:
                    correlation = np.corrcoef(left_vel, right_vel)[0, 1]
                    return max(0, correlation) if not np.isnan(correlation) else 0.0
            
            return 0.0
        except:
            return 0.0
    
    def calculate_gesture_complexity(self, landmarks_sequence: np.ndarray) -> float:
        """Calculate overall gesture complexity"""
        try:
            complexity_factors = []
            
            # Factor 1: Number of active landmarks
            active_landmarks = 0
            total_possible = landmarks_sequence.shape[0] * landmarks_sequence.shape[1] * landmarks_sequence.shape[2]
            
            for frame in range(landmarks_sequence.shape[0]):
                for hand in range(landmarks_sequence.shape[1]):
                    for landmark in range(landmarks_sequence.shape[2]):
                        if not np.allclose(landmarks_sequence[frame, hand, landmark], 0):
                            active_landmarks += 1
            
            if total_possible > 0:
                landmark_density = active_landmarks / total_possible
                complexity_factors.append(landmark_density)
            
            # Factor 2: Motion variance
            motion_variances = []
            for hand in range(landmarks_sequence.shape[1]):
                hand_motion = self.calculate_hand_motion(landmarks_sequence, hand)
                motion_variances.append(hand_motion)
            
            if motion_variances:
                motion_complexity = np.std(motion_variances) if len(motion_variances) > 1 else 0
                complexity_factors.append(min(1, motion_complexity))
            
            # Factor 3: Temporal changes
            temporal_changes = 0
            for hand in range(landmarks_sequence.shape[1]):
                for landmark in range(landmarks_sequence.shape[2]):
                    positions = landmarks_sequence[:, hand, landmark, :2]
                    valid_positions = positions[~np.all(positions == 0, axis=1)]
                    
                    if len(valid_positions) > 1:
                        position_std = np.mean(np.std(valid_positions, axis=0))
                        temporal_changes += position_std
            
            normalized_temporal = min(1, temporal_changes / 10)  # Normalize
            complexity_factors.append(normalized_temporal)
            
            # Combine factors
            return np.mean(complexity_factors) if complexity_factors else 0.0
            
        except:
            return 0.0

# CLI interface
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Improved FSL Feature Extractor')
    parser.add_argument('--dataset', required=True, help='Path to dataset JSON file')
    parser.add_argument('--output', default='fsl_features_improved', help='Output directory')
    
    args = parser.parse_args()
    
    # Extract features
    extractor = ImprovedFSLFeatureExtractor()
    X, y, feature_names = extractor.extract_features_from_dataset(args.dataset)
    
    # Save features
    import os
    os.makedirs(args.output, exist_ok=True)
    
    np.save(os.path.join(args.output, "features.npy"), X)
    np.save(os.path.join(args.output, "labels.npy"), y)
    
    with open(os.path.join(args.output, "feature_names.json"), 'w') as f:
        json.dump(feature_names, f, indent=2)
    
    print(f"\nImproved features saved to {args.output}")
    print(f"Total features: {X.shape[1]} (was 46, now {len(feature_names)})")
    print(f"New trajectory features added: 16")
    print(f"Enhanced temporal features: 12 (was 4)")
    print(f"Global motion features: 6")
    
    # Show breakdown
    print(f"\nFeature breakdown:")
    print(f"- Spatial: 30 (hand shape, position)")
    print(f"- Enhanced Temporal: 12 (motion patterns)")
    print(f"- Geometric: 4 (hand relationships)")
    print(f"- Statistical: 8 (landmark statistics)")
    print(f"- Trajectory: 16 (path analysis - NEW)")
    print(f"- Global: 6 (multi-hand coordination)")
    print(f"Total: {30+12+4+8+16+6} features")

# Usage instructions:
# python improved_fsl_feature_extractor.py --dataset fsl_motion_data/fsl_dataset.json --output fsl_features_improved