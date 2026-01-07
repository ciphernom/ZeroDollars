import { MLManager } from './ml-manager.js';
import { MathUtils } from '../utils/math-utils.js';
import { SmartCoverEngine } from './smartcover.js';

/**
 * Predictive modeling for budget forecasting and anomaly detection.
 * Implements Multinomial and Poisson-Gamma models for insight generation.
 */
export class BudgetForecaster {
    constructor(envelopes, accounts) {
        this.envelopes = Array.from(envelopes.values());
        this.accounts = Array.from(accounts.values());
        this.dataByMonth = {};
        this.multinomialFit = null;
        this.poissonGammaFit = null;
    }
/**
     * Pre-processes transaction data, grouping it by month and category (envelope).
     */
    preprocessData() {
        this.dataByMonth = {};
        const allEnvelopeIds = new Set(this.envelopes.map(e => e.id));
        // Process envelope (categorized) spending
        this.envelopes.forEach(env => {
            env.transactions.forEach(tx => {
                // FIX: Added !tx.deleted check
                if (tx.type === 'spend' && !tx.deleted) { 
                    const month = new Date(tx.date).toISOString().slice(0, 7);
                
                    const amount = Math.abs(tx.amount); // Use positive value
                    if (!this.dataByMonth[month]) {
                        this.dataByMonth[month] = { total: 0 };
                        allEnvelopeIds.forEach(id => { this.dataByMonth[month][id] = 0; });
        
                    }
                    this.dataByMonth[month][env.id] = (this.dataByMonth[month][env.id] || 0) + amount;
                    this.dataByMonth[month].total += amount;
                }
            });
        });
        // Add uncategorized (TBB) spending from accounts
        this.accounts.forEach(acc => {
            acc.transactions.forEach(tx => {
                // FIX: Added !tx.deleted check
                if (tx.type === 'spend' && !tx.jarId && !tx.deleted) { 
                    const month = new Date(tx.date).toISOString().slice(0, 7);
                    
                    const amount = Math.abs(tx.amount);
                    if (!this.dataByMonth[month]) {
                        this.dataByMonth[month] = { total: 0 };
                        allEnvelopeIds.forEach(id => { this.dataByMonth[month][id] = 0; });
                
                    }
                    // Add to a special 'uncategorized' bucket
                    this.dataByMonth[month]['uncategorized'] = (this.dataByMonth[month]['uncategorized'] || 0) + amount;
                    this.dataByMonth[month].total += amount;
                }
      
            });
        });
        // Ensure all months have all categories
        const allCategories = [...allEnvelopeIds, 'uncategorized'];
        Object.values(this.dataByMonth).forEach(monthData => {
            allCategories.forEach(catId => {
                if (monthData[catId] === undefined) {
                    monthData[catId] = 0;
                }
            });
        });
    }
    /**
     * Fits a Compound Poisson-Gamma model.
     * Best for irregular spending (e.g. "Car Repairs" happening 2x a year).
     * - Poisson: How many times per month do we spend?
     * - Gamma: How much is the average transaction?
     */
    fitPoissonGamma() {
        const envelopeStats = {};
        const months = Object.keys(this.dataByMonth).length || 1;

        this.envelopes.forEach(env => {
            // 1. Get all individual spend transactions (positive magnitude)
            const spends = env.transactions
                .filter(tx => tx.type === 'spend' && !tx.deleted)
                .map(tx => Math.abs(tx.amount));

            // 2. Calculate Poisson Lambda (Average transactions per month)
            const count = spends.length;
            const lambda = count / months; // e.g., 0.5 tx/month

            if (count < 2) {
                // Not enough data, mark as insufficient
                envelopeStats[env.id] = { lambda: 0, meanAmount: 0, varianceAmount: 0 };
                return;
            }

            // 3. Calculate Gamma Parameters (Amount distribution)
            const meanAmount = spends.reduce((a, b) => a + b, 0) / count;
            const varianceAmount = spends.reduce((a, b) => a + Math.pow(b - meanAmount, 2), 0) / (count - 1);

            // Gamma parameters (alpha = shape, beta = rate)
            // Mean = alpha / beta, Variance = alpha / beta^2
            // alpha = mean^2 / variance
            // beta = mean / variance
            
            // Handle zero variance edge case (fixed bills)
            const alpha = varianceAmount > 0 ? (meanAmount ** 2) / varianceAmount : Infinity;
            const beta = varianceAmount > 0 ? meanAmount / varianceAmount : Infinity;

            envelopeStats[env.id] = {
                lambda,      // Frequency rate
                meanAmount,  // Severity mean
                varianceAmount,
                alpha,
                beta,
                count
            };
        });

        this.poissonGammaFit = envelopeStats;
        return this.poissonGammaFit;
    }
    /**
     * Forecasts using the Poisson-Gamma fit.
     * Returns Expected Value (EV) and risk intervals (VaR).
     */
    forecastPoissonGamma(forecastPeriods = 3) {
        if (!this.poissonGammaFit) this.fitPoissonGamma();
        const forecasts = {};
        
        // Helper: Get next N months keys
        const nextMonths = [];
        const today = new Date();
        for(let i=1; i<=forecastPeriods; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            nextMonths.push(d.toISOString().slice(0, 7));
        }

        nextMonths.forEach(monthKey => {
            const predicted = {};
            const confIntervals = {};
            let totalForecast = 0;

            this.envelopes.forEach(env => {
                const stats = this.poissonGammaFit[env.id];
                if (!stats || stats.lambda === 0) return;

                // Expected Monthly Spend = Lambda * MeanAmount
                const expectedValue = stats.lambda * stats.meanAmount;
                
                // Variance of Aggregate Process = Lambda * (Mean^2 + Var)
                // This captures volatility in BOTH timing and amount
                const aggregateVariance = stats.lambda * (Math.pow(stats.meanAmount, 2) + stats.varianceAmount);
                const aggregateStdDev = Math.sqrt(aggregateVariance);

                // 95% Confidence Interval (approximate normal for aggregate)
                // For very sparse data (lambda < 1), this approximation is loose but useful
                const z = 1.96;
                
                predicted[env.id] = expectedValue;
                confIntervals[env.id] = {
                    lower: Math.max(0, expectedValue - z * aggregateStdDev),
                    upper: expectedValue + z * aggregateStdDev
                };
                
                totalForecast += expectedValue;
            });

            forecasts[monthKey] = {
                predicted: predicted, // This format matches what SmartCover expects
                total: totalForecast,
                confidenceIntervals: confIntervals,
                isForecast: true
            };
        });

        return forecasts;
    }
    /**
     * AI Logic: Rank jars to find money for "Rolling with the Punches".
     * Uses the SmartCoverEngine to analyze every available signal.
     */
async rankJarsForCovering(deficit, targetJarId, scheduledTxs) {
        // 1. Create a State Shim
        const stateShim = {
            data: {
                scheduled: {
                    values: () => (scheduledTxs || []).values() 
                }
            }
        };

        // 2. Instantiate the Intelligence Engine
        const engine = new SmartCoverEngine(this, stateShim);

        // 3. Execute Ranking
        // [FIX] Added 'await' because engine.rankJarsForCovering is async
        const results = await engine.rankJarsForCovering(deficit, targetJarId);

        // 4. Return formatted candidates
        return results.map(r => ({
            jar: r.jar,
            available: r.available,
            score: r.score,
            insights: r.insights 
        }));
    }
    
    /**
     * Fits a Multinomial model to predict spending *distribution* across categories.
     */
    fitMultinomial() {
        this.preprocessData();
        const data = this.dataByMonth;
        const multinomialFit = {};
        const allCategories = this.envelopes.map(e => e.id);
        if (Object.values(data).some(d => d.uncategorized > 0)) {
            allCategories.push('uncategorized');
        }
        const totalCounts = {};
        let grandTotal = 0;
        allCategories.forEach(cat => totalCounts[cat] = 0);
        for (const group in data) {
            allCategories.forEach(cat => {
                totalCounts[cat] += data[group][cat] || 0;
            });
            grandTotal += data[group].total || 0;
        }
       
        // Base probabilities (overall spending habits)
        const baseProbs = Object.fromEntries(
            Object.entries(totalCounts).map(([cat, count]) => [cat, (count + 1) / (grandTotal + allCategories.length)]) // +1 smoothing
        );
        for (const group in data) {
            const total = data[group].total || 0;
            const observedCounts = {};
            allCategories.forEach(cat => {
                observedCounts[cat] = data[group][cat] || 0;
            });
            multinomialFit[group] = {
                observed: observedCounts,
                predicted: Object.fromEntries(
                    Object.entries(baseProbs).map(([cat, prob]) => [cat, prob * total])
                ),
                total: total
            };
        }
        this.multinomialFit = { fit: multinomialFit, baseProbs, allCategories };
        return this.multinomialFit;
    }
    /**
     * Forecasts future spending distribution using trends.
     */
    forecastMultinomial(forecastPeriods = 3) {
        if (!this.multinomialFit) this.fitMultinomial();
        const forecasts = {};
        const historicalGroups = Object.keys(this.multinomialFit.fit).sort();
        if (historicalGroups.length === 0) return {}; // Not enough data
       
        const baseProbs = this.multinomialFit.baseProbs;
        const allCategories = this.multinomialFit.allCategories;
       
        // Calculate average *total* monthly spending
        const totalObservations = Object.values(this.multinomialFit.fit).reduce((sum, data) => sum + data.total, 0);
        const avgObservations = totalObservations / historicalGroups.length;
        // Get trend info (Simple Linear Regression on proportions)
        const trends = {};
        if (historicalGroups.length > 2) {
            allCategories.forEach(category => {
                const x = historicalGroups.map((_, i) => i); // 0, 1, 2...
                const y = historicalGroups.map(month => {
                    const monthData = this.multinomialFit.fit[month];
                    return (monthData.observed[category] || 0) / (monthData.total || 1);
                });
               
                const n = x.length;
                const sumX = x.reduce((a, b) => a + b, 0);
                const sumY = y.reduce((a, b) => a + b, 0);
                const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
                const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
               
                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                const intercept = (sumY - slope * sumX) / n;
               
                trends[category] = { slope, intercept };
            });
        }
        for (let i = 0; i < forecastPeriods; i++) {
            const lastGroup = historicalGroups[historicalGroups.length - 1];
            const lastDate = new Date(lastGroup + '-02'); // Use 2nd day to avoid TZ issues
            lastDate.setMonth(lastDate.getMonth() + i + 1);
            const newGroup = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;
            const forecastTotal = avgObservations; // Simple forecast: assume average total spend
            const forecastCounts = {};
            const confIntervals = {};
            let sumProbs = 0;
            allCategories.forEach(category => {
                let forecastProb = baseProbs[category];
               
                if (trends[category]) {
                    const futurePeriod = historicalGroups.length + i;
                    forecastProb = trends[category].intercept + trends[category].slope * futurePeriod;
                    forecastProb = Math.max(0, Math.min(1, forecastProb)); // Clamp [0, 1]
                }
               
                forecastCounts[category] = forecastProb; // Store as prob first
                sumProbs += forecastProb;
            });
           
            // Normalize probabilities to sum to 1, then multiply by forecast total
            allCategories.forEach(category => {
                const p = (forecastCounts[category] / sumProbs);
                const predictedCount = p * forecastTotal;
                forecastCounts[category] = predictedCount;
               
                // Binomial CI
                const stderr = Math.sqrt(forecastTotal * p * (1 - p));
                const z = 1.96; // 95%
                confIntervals[category] = {
                    lower: Math.max(0, predictedCount - z * stderr),
                    upper: predictedCount + z * stderr
                };
            });
            forecasts[newGroup] = {
                predicted: forecastCounts,
                total: forecastTotal,
                confidenceIntervals: confIntervals,
                isForecast: true
            };
        }
        return forecasts;
    }
/**
     * Gets insights, including anomalies and forecasts.
     * Updated to support 'poisson-gamma' mode.
     */
    getInsights(modelType = 'multinomial', includeForecast = false, forecastPeriods = 3) {
        // 1. CHOOSE MODEL
        if (modelType === 'poisson-gamma') {
            if (!this.poissonGammaFit) this.fitPoissonGamma();
            
            // For P-G, we primarily return the forecast structure as insights
            // because it handles "anomalies" naturally via its wide confidence intervals.
            return this.forecastPoissonGamma(forecastPeriods);
        }

        // 2. DEFAULT: MULTINOMIAL (Existing logic)
        if (!this.multinomialFit) this.fitMultinomial();
        const insights = {};
        const z = 1.96; // 95% confidence
       
        // Calculate historical CIs and anomalies
        for (const group in this.multinomialFit.fit) {
            const insight = this.multinomialFit.fit[group];
            const observed = insight.observed;
            const predicted = insight.predicted;
            const n = insight.total;
            const confIntervals = {};
            let anomalyScore = 0;
            this.multinomialFit.allCategories.forEach(cat => {
                const p = (predicted[cat] / n) || 0;
                const stderr = Math.sqrt(n * p * (1 - p));
                confIntervals[cat] = {
                    lower: Math.max(0, predicted[cat] - z * stderr),
                    upper: predicted[cat] + z * stderr
                };
               
                if (observed[cat] < confIntervals[cat].lower || observed[cat] > confIntervals[cat].upper) {
                    anomalyScore += 1;
                }
            });
            insights[group] = {
                ...insight,
                confidenceIntervals: confIntervals,
                anomalyScore: anomalyScore / this.multinomialFit.allCategories.length,
                isAnomaly: anomalyScore > 0
            };
        }
        if (includeForecast) {
            const forecasts = this.forecastMultinomial(forecastPeriods);
            Object.assign(insights, forecasts);
        }
        return insights;
    }
/**
     * Projects account balance based on a specific mode.
     * @param {number} startBalance - Current Net Worth or specific account balance.
     * @param {Array} scheduledTxs - List of ScheduledTransaction objects.
     * @param {string} mode - 'scheduled' or 'model'.
     * @param {number} days - How far to project (default 90).
     */
    generateBalanceForecast(startBalance, scheduledTxs, mode = 'scheduled', days = 90) {
        const labels = [];
        const data = [];
        let runningBalance = startBalance;
        
        // Prepare Simulation
        const startDate = new Date();
        startDate.setHours(0,0,0,0);

        // --- 1. PREPARE MODEL DATA (If in Model Mode) ---
        // We calculate a "Daily Burn Rate" based on the ML prediction of total monthly spend.
        // This represents "Business as Usual" outflow (Rent + Coffee + Groceries).
        let dailyBurn = 0;
        if (mode === 'model') {
            // Get forecast for next 3 months
            const forecasts = this.forecastMultinomial(3); 
            // Use the first future month as the baseline
            const nextMonthKey = Object.keys(forecasts).sort()[0]; 
            
            if (nextMonthKey && forecasts[nextMonthKey]) {
                // Total predicted spend for the month / 30 days
                dailyBurn = forecasts[nextMonthKey].total / 30;
            }
        }

        // --- 2. MAP SCHEDULED ITEMS TO TIMELINE ---
        // We separate Income and Expenses because:
        // - 'scheduled' mode uses (Income - Expense)
        // - 'model' mode uses (Income - DailyBurn) *Model predicts outflow, not inflow*
        const dailyIncome = {};
        const dailyBillExpenses = {};

        scheduledTxs.forEach(bill => {
            // Clone date to avoid mutating the original object
            let cursorDate = new Date(bill.nextDate());
            cursorDate.setHours(0,0,0,0);

            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + days);

            // Default to expense if type is missing (backward compatibility)
            const billType = bill.type || 'expense';

            // Loop to generate all occurrences within the forecast range
            while (cursorDate <= endDate) {
                const dateKey = cursorDate.toISOString().split('T')[0];

                if (billType === 'income') {
                    dailyIncome[dateKey] = (dailyIncome[dateKey] || 0) + bill.amount;
                } else {
                    dailyBillExpenses[dateKey] = (dailyBillExpenses[dateKey] || 0) + bill.amount;
                }

                // Advance cursor based on frequency
                switch(bill.frequency) {
                    case 'weekly': cursorDate.setDate(cursorDate.getDate() + 7); break;
                    case 'fortnightly': cursorDate.setDate(cursorDate.getDate() + 14); break;
                    case 'monthly': cursorDate.setMonth(cursorDate.getMonth() + 1); break;
                    case 'quarterly': cursorDate.setMonth(cursorDate.getMonth() + 3); break;
                    case 'half-yearly': cursorDate.setMonth(cursorDate.getMonth() + 6); break;
                    case 'yearly': cursorDate.setFullYear(cursorDate.getFullYear() + 1); break;
                    case 'once': cursorDate = new Date(8640000000000000); break; // Exit loop
                    default: cursorDate.setDate(cursorDate.getDate() + 30); 
                }
            }
        });

        // --- 3. RUN DAILY SIMULATION ---
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dateKey = currentDate.toISOString().split('T')[0];

            // A. Apply Scheduled Income (Always applies in both modes)
            // Since the ML model usually only predicts spending, we must inject known income manually.
            if (dailyIncome[dateKey]) {
                runningBalance += dailyIncome[dateKey];
            }

            // B. Apply Outflows based on Mode
            if (mode === 'model') {
                // Subtract average daily spend (Smoothed "Business as Usual")
                // This covers both variable spend AND historical bills implicitly
                runningBalance -= dailyBurn;
            } else {
                // 'scheduled' Mode: Subtract ONLY specific scheduled bills
                // "Runway" view: If I stop spending on variable items, how long do I last?
                if (dailyBillExpenses[dateKey]) {
                    runningBalance -= dailyBillExpenses[dateKey];
                }
            }

            labels.push(dateKey);
            data.push(Math.round(runningBalance));
        }

        return { labels, data };
    }

/**
     * Insight 1: Budget Pacing
     * Calculates if the user is spending faster or slower than time is passing.
     */
    analyzePacing(currentMonthStr) {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dayOfMonth = now.getDate();
        const monthProgress = dayOfMonth / daysInMonth; // e.g., 0.5 for mid-month

        const pacingData = [];

        this.envelopes.forEach(env => {
            const budget = env.budgets[currentMonthStr] || 0;
            if (budget <= 0) return;

            // Calculate spend for this month
            const spent = Math.abs(env.transactions
                .filter(tx => tx.type === 'spend' && new Date(tx.date).toISOString().slice(0, 7) === currentMonthStr)
                .reduce((sum, tx) => sum + tx.amount, 0));

            const spendProgress = spent / budget;
            
            // Threshold: If spend progress is 10% higher than time progress
            if (spendProgress > (monthProgress + 0.10)) {
                pacingData.push({
                    id: env.id,
                    name: env.name,
                    status: 'danger', // Overspending
                    message: `${Math.round(spendProgress * 100)}% spent, but month is only ${Math.round(monthProgress * 100)}% done.`
                });
            } else if (spendProgress < (monthProgress - 0.10)) {
                pacingData.push({
                    id: env.id,
                    name: env.name,
                    status: 'success', // Underspending
                    message: `On track! Only ${Math.round(spendProgress * 100)}% spent.`
                });
            }
        });

        return pacingData.sort((a, b) => (a.status === 'danger' ? -1 : 1)); // Show danger first
    }

/**
     * Insight 2: Price Change Detective (Two-Sided)
     * Uses ML Clustering + Student's t-test to find significant price hikes OR drops.
     */
   detectPriceChanges() {
        const insights = [];
        const historyByPayee = {};

        // 1. Group strictly by Normalized Payee (ignore Jars/Categories)
        this.accounts.forEach(acc => {
            acc.transactions.forEach(tx => {
                if (tx.type === 'spend' && !tx.deleted && tx.amount < 0) {
                    // Clean: "Netflix.com*123" -> "NETFLIX"
                    // We allow slightly longer names to distinguish distinct services
                    const rawName = tx.note || 'Unknown';
                    const payee = rawName.toUpperCase()
                        .replace(/[0-9]/g, '') // Remove numbers
                        .replace(/[^A-Z ]/g, '') // Remove symbols
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2) // Take first 2 words max (e.g. "ADOBE CREATIVE")
                        .join(' ');

                    if (payee.length < 3) return;
                    
                    if (!historyByPayee[payee]) historyByPayee[payee] = [];
                    historyByPayee[payee].push({ 
                        date: new Date(tx.date), 
                        amount: Math.abs(tx.amount) 
                    });
                }
            });
        });

        // 2. Analyze each Payee Group
        Object.entries(historyByPayee).forEach(([payee, txs]) => {
            // Need minimal history (3 historic + 1 current)
            if (txs.length < 4) return;

            // Sort by date ascending
            txs.sort((a, b) => a.date - b.date);
            
            // Split: Latest Transaction vs History
            const latest = txs[txs.length - 1];
            // History is everything BEFORE the latest
            const history = txs.slice(0, -1); 
            
            // Optimization: If history is huge, just take last 12 months
            const recentHistory = history.slice(-12);
            const amounts = recentHistory.map(h => h.amount);

            const n = amounts.length;
            if (n < 3) return; 

            // --- STATISTICAL ANALYSIS ---
            const mean = MathUtils.mean(amounts);
            const stdDev = MathUtils.standardDeviation(amounts);
            const latestAmt = latest.amount;

            // A. Stability Gate (Coefficient of Variation)
            const cv = mean === 0 ? 0 : (stdDev / mean);
            
            // If CV > 0.1 (10%), it's too volatile. Ignore.
            if (cv > 0.1) return; 

            // B. Two-Sided Hypothesis Testing
            const predictionStdErr = stdDev * Math.sqrt(1 + (1/n));
            let tScore = 0;
            
            if (stdDev === 0) {
                // Perfect history. Infinite sigma if changed.
                if (latestAmt !== mean) tScore = (latestAmt > mean) ? 99 : -99;
            } else {
                tScore = (latestAmt - mean) / predictionStdErr;
            }

            // C. Significance Thresholds
            // We use |t| > 3.0 (approx 99% confidence)
            const isSignificant = Math.abs(tScore) > 3.0;
            // Must change by at least $1.00
            const meaningfulDiff = Math.abs(latestAmt - mean) > 100; 
            
            // Special case: Perfect history needs 2% buffer
            const isHardChange = (stdDev === 0) && (Math.abs(latestAmt - mean) > mean * 0.02);

            if ((isSignificant || isHardChange) && meaningfulDiff) {
                const diff = latestAmt - mean;
                const isHike = diff > 0;
                
                insights.push({
                    name: payee, // e.g. "NETFLIX"
                    diff: diff,
                    type: isHike ? 'hike' : 'drop',
                    message: `${isHike ? 'Price hike' : 'Price drop'} detected: ${isHike ? '+' : '-'}$${(Math.abs(diff)/100).toFixed(2)} (Score: ${tScore.toFixed(1)}σ)`
                });
            }
        });

        return insights;
    }    
    
    
    static calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        if (str1.toLowerCase() === str2.toLowerCase()) return 1;

        // Reuse existing tokenizer from your provided code
        const tokensA = new Set(MLManager.tokenizeWithNgrams(str1));
        const tokensB = new Set(MLManager.tokenizeWithNgrams(str2));

        if (tokensA.size === 0 || tokensB.size === 0) return 0;

        // Calculate Jaccard Index
        const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
        const union = new Set([...tokensA, ...tokensB]);

        return intersection.size / union.size;
    }   
    
}
