class ClientSideASLClassifier {
    constructor() {
        this.currentModelType = null; // 'alphabet' or 'number'
        this.trees = null;
        this.scalerMean = null;
        this.scalerScale = null;
        this.customClassNames = {};
        this.isModelLoaded = false;
    }
    
    async loadModel(modelType = 'alphabet') {
        try {
            // Prevent reloading the same model
            if (this.currentModelType === modelType && this.isModelLoaded) {
                console.log(`Model ${modelType} already loaded`);
                return true;
            }

            const modelPath = `/static/models/${modelType}/asl_randomforest.json`;
            console.log(`Loading model from: ${modelPath}`);
            
            const response = await fetch(modelPath);
            if (!response.ok) {
                throw new Error(`Failed to load model: ${response.status}`);
            }
            
            const modelData = await response.json();
            
            this.trees = modelData.trees;
            this.scalerMean = modelData.scaler_mean;
            this.scalerScale = modelData.scaler_scale;
            this.currentModelType = modelType;
            
            // Create class mapping based on model type
            if (modelType === 'alphabet') {
                const alphabetMapping = {
                    "0": "A", "1": "B", "2": "C", "3": "D", "4": "E", "5": "F",
                    "6": "G", "7": "H", "8": "I", "9": "K", "10": "L", "11": "M",
                    "12": "N", "13": "O", "14": "P", "15": "Q", "16": "R", "17": "S",
                    "18": "T", "19": "U", "20": "V", "21": "W", "22": "X", "23": "Y"
                };
                
                this.customClassNames = {};
                modelData.classes.forEach((className, index) => {
                    this.customClassNames[index] = alphabetMapping[className];
                });
            } else if (modelType === 'number') {
                const numberMapping = {
                    "0": "1", "1": "2", "2": "3", "3": "4",
                    "4": "5", "5": "6", "6": "7", "7": "8", "8": "9"
                };
                
                this.customClassNames = {};
                modelData.classes.forEach((className, index) => {
                    this.customClassNames[index] = numberMapping[className] || className;
                });
            }
            
            this.isModelLoaded = true;
            console.log(`${modelType} model loaded successfully. Class mapping:`, this.customClassNames);
            return true;
            
        } catch (error) {
            console.error(`Failed to load ${modelType} model:`, error);
            this.trees = null;
            this.isModelLoaded = false;
            return false;
        }
    }
    
    getCurrentModelType() {
        return this.currentModelType;
    }
    
    applyScaling(features) {
        if (!this.scalerMean || !this.scalerScale) {
            console.error('Scaler parameters not loaded');
            return features;
        }
        
        const scaledFeatures = features.map((value, index) => {
            return (value - this.scalerMean[index]) / this.scalerScale[index];
        });
        
        return scaledFeatures;
    }
    
    normalizeHandLandmarks(landmarks) {
        const coords = landmarks.map(lm => [lm.x, lm.y, lm.z]);
        
        const center = coords[0];
        const centeredCoords = coords.map(coord => [
            coord[0] - center[0],
            coord[1] - center[1], 
            coord[2] - center[2]
        ]);
        
        const landmark9 = centeredCoords[9];
        const scale = Math.sqrt(
            landmark9[0] * landmark9[0] + 
            landmark9[1] * landmark9[1] + 
            landmark9[2] * landmark9[2]
        );
  
        if (scale > 0) {
            return centeredCoords.map(coord => [
                coord[0] / scale,
                coord[1] / scale,
                coord[2] / scale
            ]);
        }
        
        return centeredCoords;
    }
    
    extractFeatures(handsData) {
        if (!handsData || handsData.length === 0) {
            return null;
        }
        
        let features = [];
        
        if (handsData.length === 1) {
            const hand = handsData[0];
            const normalizedCoords = this.normalizeHandLandmarks(hand.landmarks);
            const handFeatures = this.extractHandFeatures(normalizedCoords);
            
            features = [...handFeatures, ...new Array(handFeatures.length).fill(0)];
            
        } else if (handsData.length >= 2) {
            const hand1 = handsData[0];
            const hand2 = handsData[1];
            
            const hand1Features = this.extractHandFeatures(
                this.normalizeHandLandmarks(hand1.landmarks)
            );
            const hand2Features = this.extractHandFeatures(
                this.normalizeHandLandmarks(hand2.landmarks)
            );
            features = [...hand1Features, ...hand2Features];
        }
        
        return features;
    }
    
    extractHandFeatures(normalizedCoords) {
        const rawFeatures = normalizedCoords.flat();
        const additionalFeatures = [];
        
        const keyPoints = [0, 4, 8, 12, 16, 20];
        const wrist = normalizedCoords[0];
        
        for (let i = 1; i < keyPoints.length; i++) {
            const idx = keyPoints[i];
            const tip = normalizedCoords[idx];
            const dist = Math.sqrt(
                Math.pow(tip[0] - wrist[0], 2) +
                Math.pow(tip[1] - wrist[1], 2) +
                Math.pow(tip[2] - wrist[2], 2)
            );
            additionalFeatures.push(dist);
        }
        
        const fingerTips = [4, 8, 12, 16, 20];
        for (let i = 0; i < fingerTips.length - 1; i++) {
            for (let j = i + 1; j < fingerTips.length; j++) {
                const tip1 = normalizedCoords[fingerTips[i]];
                const tip2 = normalizedCoords[fingerTips[j]];
                const dist = Math.sqrt(
                    Math.pow(tip1[0] - tip2[0], 2) +
                    Math.pow(tip1[1] - tip2[1], 2) +
                    Math.pow(tip1[2] - tip2[2], 2)
                );
                additionalFeatures.push(dist);
            }
        }
        
        const xCoords = normalizedCoords.map(coord => coord[0]);
        const yCoords = normalizedCoords.map(coord => coord[1]);
        const handWidth = Math.max(...xCoords) - Math.min(...xCoords);
        const handHeight = Math.max(...yCoords) - Math.min(...yCoords);
        additionalFeatures.push(handWidth, handHeight);
        
        const result = [...rawFeatures, ...additionalFeatures];
        return result;
    }
    
    predict(handsData) {
        if (!this.trees || !this.isModelLoaded) {
            return { prediction: 'Model loading...', confidence: 0 };
        }
        
        const features = this.extractFeatures(handsData);
        if (!features) {
            return { prediction: 'No gesture', confidence: 0 };
        }
        
        const scaledFeatures = this.applyScaling(features);
        
        const votes = {};
        
        this.trees.forEach(tree => {
            const prediction = this.predictTree(tree, scaledFeatures);
            votes[prediction] = (votes[prediction] || 0) + 1;
        });
        
        const bestPrediction = Object.keys(votes).reduce((a, b) => 
            votes[a] > votes[b] ? a : b
        );
        
        const confidence = votes[bestPrediction] / this.trees.length;
        const predictionLabel = this.customClassNames[bestPrediction] || bestPrediction;

        return {
            prediction: predictionLabel,
            confidence: confidence
        };
    }
    
    predictTree(tree, features) {
        let node = tree.root;
        
        while (!node.isLeaf) {
            const featureValue = features[node.featureIndex];
            if (featureValue <= node.threshold) {
                node = node.left;
            } else {
                node = node.right;
            }
        }
        
        return node.prediction;
    }
}

window.ClientSideASLClassifier = ClientSideASLClassifier;