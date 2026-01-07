// js/services/ml.worker.js
import { MLManager } from './ml-manager.js';
import { BudgetForecaster } from './forecaster.js';
import { Utils } from '../utils/index.js';

// DEBUG: Log immediately to confirm the file parses and imports succeed
console.log("🔧 ML Worker: Loaded and ready.");

self.onmessage = async (e) => {
    // DEBUG: Log receipt of data
    console.log("🔧 ML Worker: Received message:", e.data?.type);
    
    const { type, payload, id } = e.data;
    const start = performance.now();

    try {
        let result;
        switch (type) {
            case 'TRAIN_ALL':
                console.log("🔧 ML Worker: Starting TRAIN_ALL...");
                
                // 1. Hydrate Static Rules (CRITICAL STEP)
                if (payload.keywordRules) {
                    MLManager.KEYWORD_RULES = payload.keywordRules;
                }

                // 2. Train Naive Bayes (Now with keywords!)
                const nbModel = MLManager.trainNaiveBayes(payload.envelopes);
                
                // 3. Compute Clusters
                const clusters = MLManager.computeClusters(payload.envelopes);
                
                // 3. Generate Forecasts
                const forecaster = new BudgetForecaster(payload.envelopes, payload.accounts);
                // Get historical + 3 months future
                const insights = forecaster.getInsights('multinomial', true, 3);
                
                result = {
                    naiveBayesModel: nbModel,
                    clusters: clusters, 
                    forecastInsights: insights
                };
                break;
                
            case 'ANALYZE_IMPORT':
                console.log("🔧 ML Worker: Starting ANALYZE_IMPORT...");
                // 1. Setup Worker Environment
                // We must hydrate the static rules because the worker is a separate instance
                MLManager.KEYWORD_RULES = payload.keywordRules;
                
                const { rawTransactions, envelopes, naiveBayesModel } = payload;
                let categorizedTxs = [];
                let uncategorizedTxs = [];
                
                // 2. Run Layer 1 (Keywords) & Layer 2 (Bayes)
                const envIds = envelopes.map(e => e.id);
                
                rawTransactions.forEach(txData => {
                    // prediction logic ported from UI manager
                    let predictedJarId = MLManager.getJarIdFromKeywords(txData.payee, envelopes);
                    
                    if (!predictedJarId && naiveBayesModel) {
                        predictedJarId = MLManager.predictJar(txData.payee, naiveBayesModel, envIds);
                    }

                    const processedTx = {
                        ...txData,
                        predictedJarId
                    };

                    if (predictedJarId) {
                        categorizedTxs.push(processedTx);
                    } else {
                        uncategorizedTxs.push(processedTx);
                    }
                });

                // 3. Run Layer 3 (Clustering)
                const uncategorizedClusters = MLManager.clusterUncategorized(uncategorizedTxs);
                
                // 4. Re-merge clusters into categorized list
                uncategorizedClusters.forEach(cluster => {
                    const clusterName = cluster.name;
                    cluster.txs.forEach(tx => {
                        // --- FIX: Removed syntax error here (comment was broken across lines) ---
                        tx.predictedJarId = clusterName; // Use name as temp ID for UI grouping
                        
                        categorizedTxs.push(tx);
                        
                        // Remove from uncategorized
                        const idx = uncategorizedTxs.findIndex(u => u.id === tx.id);
                        if (idx > -1) uncategorizedTxs.splice(idx, 1);
                    });
                });
                
                result = { categorizedTxs, uncategorizedTxs, clusters: uncategorizedClusters };
                break;

            default:
                throw new Error(`Unknown worker task: ${type}`);
        }

        const duration = (performance.now() - start).toFixed(2);
        console.log(`🔧 ML Worker: Finished ${type} in ${duration}ms`);
        
        // Send success
        self.postMessage({ type: 'SUCCESS', id, payload: result });
        
    } catch (error) {
        console.error("🔧 ML Worker Error:", error);
        self.postMessage({ type: 'ERROR', id, error: error.message });
    }
};
