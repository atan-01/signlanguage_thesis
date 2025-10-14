// ClientSideMotionClassifier.js - Optimized motion sign recognition for client-side use

class ClientSideMotionClassifier {
    constructor() {
        this.model = null;
        this.scaler = null;
        this.labelEncoder = null;
        this.classNames = [];
        this.modelLoaded = false;
        
        // Optimized settings
        this.sequenceLength = 12; // Reduced from 30 for speed
        this.minConfidence = 0.4; // Lower threshold for faster detection
        this.predictionCooldown = 150; // ms between predictions (was 500ms)
        this.lastPredictionTime = 0;
    }
    
    async loadModel(modelType = 'words') {
        try {
            console.log(`Loading ${modelType} motion model...`);
            
            const response = await fetch(`/static/models/${modelType}/model_data.json`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const modelData = await response.json();
            
            this.model = modelData.trees;
            this.scaler = {
                mean: new Float32Array(modelData.scaler_mean),
                scale: new Float32Array(modelData.scaler_scale)
            };
            this.classNames = modelData.classes;
            this.labelEncoder = modelData.label_encoder;
            
            this.modelLoaded = true;
            console.log(`✓ ${modelType} motion model loaded: ${this.classNames.length} signs`);
            return true;
            
        } catch (error) {
            console.error(`Failed to load motion model: ${error}`);
            this.modelLoaded = false;
            return false;
        }
    }
    
    extractFastFeatures(landmarksSequence) {
        // OPTIMIZED: Only extract 28 critical features (was 76)
        // Focuses on motion, not static properties
        
        if (!landmarksSequence || landmarksSequence.length < 3) {
            return null;
        }
        
        const features = [];
        
        // Process each hand (2 hands)
        for (let handIdx = 0; handIdx < 2; handIdx++) {
            const handFeatures = this.extractHandMotionFeatures(landmarksSequence, handIdx);
            features.push(...handFeatures);
        }
        
        // Hand synchronization (2 features)
        features.push(...this.extractSyncFeatures(landmarksSequence));
        
        return Float32Array.from(features);
    }
    
    extractHandMotionFeatures(landmarksSequence, handIdx) {
        // 14 features per hand
        const features = [];
        
        try {
            // Get wrist positions over time
            const wristPositions = [];
            for (let frame of landmarksSequence) {
                if (frame.hands && frame.hands[handIdx]) {
                    const landmarks = frame.hands[handIdx].landmarks;
                    if (landmarks && landmarks[0]) {
                        wristPositions.push([landmarks[0].x, landmarks[0].y]);
                    }
                }
            }
            
            if (wristPositions.length < 2) {
                return Array(14).fill(0);
            }
            
            // 1-4: Velocity features
            const velocities = [];
            for (let i = 1; i < wristPositions.length; i++) {
                const dx = wristPositions[i][0] - wristPositions[i-1][0];
                const dy = wristPositions[i][1] - wristPositions[i-1][1];
                const vel = Math.sqrt(dx*dx + dy*dy);
                velocities.push(vel);
            }
            
            if (velocities.length > 0) {
                features.push(Math.max(...velocities)); // Peak velocity
                features.push(this.mean(velocities)); // Average velocity
                features.push(this.std(velocities)); // Velocity variance
                features.push(this.countPeaks(velocities)); // Number of movement peaks
            } else {
                features.push(0, 0, 0, 0);
            }
            
            // 5-7: Direction and path features
            const directions = [];
            for (let i = 1; i < wristPositions.length; i++) {
                const dx = wristPositions[i][0] - wristPositions[i-1][0];
                const dy = wristPositions[i][1] - wristPositions[i-1][1];
                const angle = Math.atan2(dy, dx);
                directions.push(angle);
            }
            
            features.push(this.calculateAngularVariance(directions)); // Direction changes
            features.push(this.calculateStraightness(wristPositions)); // Path straightness
            features.push(this.calculateCircularity(wristPositions)); // Circular motion
            
            // 8-9: Position range
            const xCoords = wristPositions.map(p => p[0]);
            const yCoords = wristPositions.map(p => p[1]);
            features.push(Math.max(...xCoords) - Math.min(...xCoords)); // X range
            features.push(Math.max(...yCoords) - Math.min(...yCoords)); // Y range
            
            // 10-14: Hand pose features (simplified)
            const handPoseFeatures = this.extractHandPoseFeatures(landmarksSequence, handIdx);
            features.push(...handPoseFeatures);
            
        } catch (error) {
            console.error(`Error extracting hand features: ${error}`);
            return Array(14).fill(0);
        }
        
        return features.slice(0, 14);
    }
    
    extractHandPoseFeatures(landmarksSequence, handIdx) {
        // 5 features for hand configuration
        const features = [];
        
        try {
            const allFrameFeatures = [];
            
            for (let frame of landmarksSequence) {
                if (!frame.hands || !frame.hands[handIdx]) continue;
                
                const landmarks = frame.hands[handIdx].landmarks;
                if (!landmarks || landmarks.length < 21) continue;
                
                // Finger spread
                const fingerTips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
                let spread = 0;
                for (let i = 0; i < fingerTips.length - 1; i++) {
                    const tip1 = landmarks[fingerTips[i]];
                    const tip2 = landmarks[fingerTips[i+1]];
                    const dist = Math.sqrt(
                        Math.pow(tip2.x - tip1.x, 2) + 
                        Math.pow(tip2.y - tip1.y, 2)
                    );
                    spread += dist;
                }
                allFrameFeatures.push(spread);
            }
            
            if (allFrameFeatures.length > 0) {
                features.push(this.mean(allFrameFeatures)); // Average spread
                features.push(this.std(allFrameFeatures)); // Spread variance
                features.push(Math.max(...allFrameFeatures)); // Max spread
                features.push(Math.min(...allFrameFeatures)); // Min spread
                features.push((Math.max(...allFrameFeatures) - Math.min(...allFrameFeatures)) / (this.mean(allFrameFeatures) + 0.001)); // Spread change ratio
            } else {
                features.push(0, 0, 0, 0, 0);
            }
            
        } catch (error) {
            features.push(0, 0, 0, 0, 0);
        }
        
        return features;
    }
    
    extractSyncFeatures(landmarksSequence) {
        // 2 features: hand synchronization
        const features = [];
        
        try {
            const leftVelocities = [];
            const rightVelocities = [];
            
            for (let i = 1; i < landmarksSequence.length; i++) {
                // Left hand
                if (landmarksSequence[i].hands[0] && landmarksSequence[i-1].hands[0]) {
                    const l1 = landmarksSequence[i-1].hands[0].landmarks[0];
                    const l2 = landmarksSequence[i].hands[0].landmarks[0];
                    const vel = Math.sqrt(Math.pow(l2.x - l1.x, 2) + Math.pow(l2.y - l1.y, 2));
                    leftVelocities.push(vel);
                }
                
                // Right hand
                if (landmarksSequence[i].hands[1] && landmarksSequence[i-1].hands[1]) {
                    const r1 = landmarksSequence[i-1].hands[1].landmarks[0];
                    const r2 = landmarksSequence[i].hands[1].landmarks[0];
                    const vel = Math.sqrt(Math.pow(r2.x - r1.x, 2) + Math.pow(r2.y - r1.y, 2));
                    rightVelocities.push(vel);
                }
            }
            
            // Synchronization score
            if (leftVelocities.length > 0 && rightVelocities.length > 0) {
                const minLen = Math.min(leftVelocities.length, rightVelocities.length);
                let correlation = 0;
                
                for (let i = 0; i < minLen; i++) {
                    correlation += leftVelocities[i] * rightVelocities[i];
                }
                
                features.push(correlation / (minLen + 0.001));
                features.push(Math.abs(this.mean(leftVelocities) - this.mean(rightVelocities))); // Velocity difference
            } else {
                features.push(0, 0);
            }
            
        } catch (error) {
            features.push(0, 0);
        }
        
        return features;
    }
    
    // Helper functions
    mean(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    
    std(arr) {
        if (arr.length === 0) return 0;
        const m = this.mean(arr);
        const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }
    
    countPeaks(arr) {
        let peaks = 0;
        for (let i = 1; i < arr.length - 1; i++) {
            if (arr[i] > arr[i-1] && arr[i] > arr[i+1]) {
                peaks++;
            }
        }
        return peaks;
    }
    
    calculateAngularVariance(directions) {
        if (directions.length < 2) return 0;
        const changes = [];
        for (let i = 1; i < directions.length; i++) {
            let diff = Math.abs(directions[i] - directions[i-1]);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            changes.push(diff);
        }
        return this.mean(changes);
    }
    
    calculateStraightness(positions) {
        if (positions.length < 2) return 0;
        
        const totalDist = [];
        for (let i = 1; i < positions.length; i++) {
            const dx = positions[i][0] - positions[i-1][0];
            const dy = positions[i][1] - positions[i-1][1];
            totalDist.push(Math.sqrt(dx*dx + dy*dy));
        }
        
        const total = totalDist.reduce((a, b) => a + b, 0);
        const direct = Math.sqrt(
            Math.pow(positions[positions.length-1][0] - positions[0][0], 2) +
            Math.pow(positions[positions.length-1][1] - positions[0][1], 2)
        );
        
        return total > 0 ? direct / total : 0;
    }
    
    calculateCircularity(positions) {
        if (positions.length < 4) return 0;
        
        const center = [
            this.mean(positions.map(p => p[0])),
            this.mean(positions.map(p => p[1]))
        ];
        
        const radii = positions.map(p => 
            Math.sqrt(Math.pow(p[0] - center[0], 2) + Math.pow(p[1] - center[1], 2))
        );
        
        const avgRadius = this.mean(radii);
        if (avgRadius === 0) return 0;
        
        const circularity = 1 - (this.std(radii) / avgRadius);
        return Math.max(0, Math.min(1, circularity));
    }
    
    scaleFeatures(features) {
        if (!this.scaler) return features;
        
        const scaled = new Float32Array(features.length);
        for (let i = 0; i < features.length; i++) {
            scaled[i] = (features[i] - this.scaler.mean[i]) / (this.scaler.scale[i] + 0.001);
        }
        return scaled;
    }
    
    predict(landmarksSequence) {
        if (!this.modelLoaded) {
            return { sign: 'model_error', confidence: 0 };
        }
        
        const now = Date.now();
        if (now - this.lastPredictionTime < this.predictionCooldown) {
            return { sign: 'cooling_down', confidence: 0 };
        }
        
        try {
            const features = this.extractFastFeatures(landmarksSequence);
            if (!features) {
                return { sign: 'no_features', confidence: 0 };
            }
            
            const scaledFeatures = this.scaleFeatures(features);
            const votes = {};
            
            // Vote through random forest trees
            for (let tree of this.model) {
                const prediction = this.predictTree(tree, scaledFeatures);
                votes[prediction] = (votes[prediction] || 0) + 1;
            }
            
            const bestPrediction = Object.keys(votes).reduce((a, b) => 
                votes[a] > votes[b] ? a : b
            );
            
            const confidence = votes[bestPrediction] / this.model.length;
            
            if (confidence < this.minConfidence) {
                return { sign: 'uncertain', confidence: 0 };
            }
            
            this.lastPredictionTime = now;
            
            return {
                sign: this.classNames[bestPrediction],
                confidence: confidence
            };
            
        } catch (error) {
            console.error('Prediction error:', error);
            return { sign: 'error', confidence: 0 };
        }
    }
    
    predictTree(tree, features) {
        let node = tree.root;
        
        while (!node.isLeaf) {
            const value = features[node.featureIndex];
            node = value <= node.threshold ? node.left : node.right;
        }
        
        return node.prediction;
    }
}

window.ClientSideMotionClassifier = ClientSideMotionClassifier;