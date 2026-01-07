import { MathUtils } from '../utils/math-utils.js';
import { MLManager } from './ml-manager.js';

/**
 * SmartCover Intelligence Engine
 * 
 * This uses EVERY available signal in the app:
 * - ML forecasting (multinomial model)
 * - Naive Bayes categorization
 * - Transaction clustering
 * - Price change detection
 * - Pacing analysis
 * - Anomaly detection
 * - Confidence intervals
 * - Scheduled transactions
 * - Spending velocity
 * - Day-of-week patterns
 * - Payday cycles
 * - Cross-jar correlations
 * - Historical transfer patterns
 * - Recovery time estimation
 * - Cascade risk analysis
 */

export class SmartCoverEngine {
    constructor(forecaster, state) {
        this.forecaster = forecaster;
        this.state = state;
        this.envelopes = forecaster.envelopes;
        this.accounts = forecaster.accounts;
        this.scheduled = Array.from(state.data.scheduled.values());
        this.currentMonth = new Date().toISOString().slice(0, 7);
        
        // Cache expensive computations
        this._cache = {};
    }

    /**
     * Main entry: Rank all jars for covering a deficit
     */
    async rankJarsForCovering(deficit, targetJarId) { 
        // Pre-compute all shared intelligence
        await this._precompute(targetJarId);

        const candidates = [];

        this.envelopes.forEach(env => {
            if (env.id === targetJarId || env.deleted) return;
            if (env.balance <= 0) return;
            if (env.type === 'cc_payment') {
                // Still evaluate but will get massive penalty
            }

            const analysis = this._analyzeJar(env, deficit);
            if (analysis.maxSafe <= 0) return;

            candidates.push({
                jar: env,
                available: analysis.maxSafe,
                liquid: analysis.liquid,
                score: analysis.totalScore,
                confidence: analysis.confidence,
                breakdown: analysis.scores,
                insights: analysis.insights,
                recoveryDays: analysis.recoveryDays,
                cascadeRisk: analysis.cascadeRisk
            });
        });

        // Sort by score, with confidence as tiebreaker
        return candidates.sort((a, b) => {
            if (Math.abs(a.score - b.score) < 5) {
                return b.confidence - a.confidence;
            }
            return b.score - a.score;
        });
    }

    /**
     * Pre-compute expensive shared data
     */
    async _precompute(targetJarId) {
        const c = this._cache;

        // 1. Time context
        c.today = new Date();
        c.dayOfMonth = c.today.getDate();
        c.dayOfWeek = c.today.getDay();
        c.daysInMonth = new Date(c.today.getFullYear(), c.today.getMonth() + 1, 0).getDate();
        c.monthProgress = c.dayOfMonth / c.daysInMonth;
        c.isWeekend = c.dayOfWeek === 0 || c.dayOfWeek === 6;
        c.isEndOfMonth = c.dayOfMonth >= c.daysInMonth - 3;
        c.isStartOfMonth = c.dayOfMonth <= 5;

        // 2. Payday detection (find recurring income patterns)
        c.nextPayday = this._detectNextPayday();
        c.daysUntilPayday = c.nextPayday 
            ? Math.max(0, (c.nextPayday - c.today) / (1000 * 60 * 60 * 24))
            : 14; // Assume 2 weeks if unknown

        // 4. Pacing analysis
        c.pacing = this.forecaster.analyzePacing(this.currentMonth);
        c.pacingMap = new Map(c.pacing.map(p => [p.id, p]));

        // --- NEW: Load Behavioral Profiles ---
        c.behaviorProfiles = new Map();
        if (window.app?.ui?.tracker) {
            await Promise.all(this.envelopes.map(async (env) => {
                const profile = await window.app.ui.tracker.getBehavioralProfile(env.id);
                c.behaviorProfiles.set(env.id, profile);
            }));
        }
        
        // 3. Reserved funds (weighted by proximity)
        c.reservedFunds = this._calculateReservedFunds(21); // 3 week lookahead
        
        // 5. ML Forecasts (3 months out)
        c.forecasts = this._getForecasts(3);

        // 6. Price changes (subscriptions going up?)
        c.priceChanges = this._getPriceChanges();

        // 7. Anomaly detection
        c.anomalies = this._getAnomalies();

        // 8. Confidence intervals
        c.confidenceIntervals = this._getConfidenceIntervals();

        // 9. Spending velocity (acceleration/deceleration)
        c.velocities = this._calculateVelocities();

        // 10. Day-of-week patterns per jar
        c.dowPatterns = this._analyzeDayOfWeekPatterns();

        // 11. Cross-jar correlations
        c.correlations = this._calculateCorrelations(targetJarId);

        // 12. Historical transfer patterns (which jars are usually donors?)
        c.transferHistory = this._analyzeTransferHistory();

        // 13. Cluster health
        c.clusterHealth = this._analyzeClusterHealth();

        // 14. Seasonal patterns
        c.seasonality = this._analyzeSeasonality(c.today.getMonth());

        // 15. Goal deadlines
        c.goalUrgency = this._calculateGoalUrgency();
    }

    /**
     * Analyze a single jar comprehensively
     */
    _analyzeJar(env, deficit) {
        const c = this._cache;
        const scores = {};
        const insights = [];

        // Calculate liquid balance
        const reserved = c.reservedFunds.get(env.id) || 0;
        const liquid = Math.max(0, env.balance - reserved);

        if (liquid <= 0) {
            return { maxSafe: 0, totalScore: -Infinity };
        }

        // --- NEW: Behavioral Vectors ---
        const behavior = c.behaviorProfiles.get(env.id) || { totalDwellMs: 0, donorScore: 0 };
        
        if (behavior.totalDwellMs > 60000) { 
            scores.behavior = -40; // High attention = Protected
            insights.push('🧠 High attention jar (Protected)');
        }
        if (behavior.donorScore > 3.0) {
            scores.donor = 45; // Habitual donor
            insights.push('🧠 You often take from here');
        }

        // ================================================
        // TIER 1: CRITICAL FACTORS (High Impact)
        // ================================================

        // 1. CC Payment Jar (-1000)
        if (env.type === 'cc_payment') {
            scores.ccPayment = -1000;
            insights.push('⚠️ CC Payment jar - absolute last resort');
        } else {
            scores.ccPayment = 0;
        }

        // 2. Pacing Health (-60 to +60)
        const pacingData = c.pacingMap.get(env.id);
        if (pacingData) {
            if (pacingData.status === 'success') {
                scores.pacing = 60;
                insights.push('✅ Under budget this month');
            } else if (pacingData.status === 'danger') {
                scores.pacing = -60;
                insights.push('🔴 Already overspending');
            } else {
                scores.pacing = -25;
                insights.push('⚠️ On track but tight');
            }
        } else {
            scores.pacing = 0;
        }

        // 3. Imminent Expenses (-80 to +30)
        const daysUntil = this._estimateDaysUntilExpense(env);
        if (daysUntil <= 2) {
            scores.imminentExpense = -80;
            insights.push(`🚨 Expense in ${daysUntil} days!`);
        } else if (daysUntil <= 5) {
            scores.imminentExpense = -50;
            insights.push(`⚠️ Expense in ${daysUntil} days`);
        } else if (daysUntil <= 7) {
            scores.imminentExpense = -25;
        } else if (daysUntil > 21) {
            scores.imminentExpense = 30;
            insights.push('✅ No expenses for 3+ weeks');
        } else {
            scores.imminentExpense = 0;
        }

        // ================================================
        // TIER 2: FINANCIAL HEALTH FACTORS
        // ================================================

        // 4. Surplus Ratio (-40 to +70)
        const avgSpend = this._getAverageMonthlySpend(env, 3);
        let surplusRatio = avgSpend > 0 ? env.balance / avgSpend : 2.0;
        
        if (surplusRatio > 4.0) {
            scores.surplus = 70;
            insights.push(`💰 ${surplusRatio.toFixed(1)}x overfunded!`);
        } else if (surplusRatio > 2.5) {
            scores.surplus = 50;
            insights.push(`✅ ${surplusRatio.toFixed(1)}x typical spend`);
        } else if (surplusRatio > 1.5) {
            scores.surplus = 30;
        } else if (surplusRatio > 1.0) {
            scores.surplus = 10;
        } else if (surplusRatio < 0.5) {
            scores.surplus = -40;
            insights.push('🔴 Severely underfunded');
        } else if (surplusRatio < 0.75) {
            scores.surplus = -25;
        } else {
            scores.surplus = -10;
        }

        // 5. ML Forecast Safety (-50 to +40)
        const forecast = c.forecasts.get(env.name.toLowerCase());
        if (forecast) {
            const forecastBuffer = env.balance - forecast.predicted;
            const bufferRatio = forecastBuffer / env.balance;

            if (bufferRatio > 0.6) {
                scores.forecast = 40;
                insights.push('🤖 ML: Low predicted need');
            } else if (bufferRatio > 0.3) {
                scores.forecast = 20;
            } else if (bufferRatio < 0) {
                scores.forecast = -50;
                insights.push('🤖 ML: Will need MORE than balance!');
            } else if (bufferRatio < 0.15) {
                scores.forecast = -30;
                insights.push('🤖 ML: Tight forecast');
            } else {
                scores.forecast = 0;
            }

            // Confidence adjustment
            if (forecast.confidence < 0.5) {
                scores.forecast *= 0.5; // Halve impact if low confidence
            }
        } else {
            scores.forecast = 0;
        }

        // 6. Category Protection (-60 to +15)
        const protection = this._getCategoryProtection(env.name);
        scores.category = Math.round(-protection * 0.6 + 15);
        if (protection > 80) {
            insights.push('🛡️ Essential category');
        } else if (protection < 30) {
            insights.push('✅ Discretionary spending');
        }

        // 7. Goal Protection (-70 to 0)
        const goalData = c.goalUrgency.get(env.id);
        if (goalData) {
            if (goalData.daysUntilDeadline < 14 && goalData.progress > 0.7) {
                scores.goal = -70;
                insights.push(`🎯 Goal ${Math.round(goalData.progress * 100)}% complete, due soon!`);
            } else if (goalData.progress > 0.9) {
                scores.goal = -50;
                insights.push(`🎯 Almost at goal!`);
            } else if (env.goalType) {
                scores.goal = -25;
            } else {
                scores.goal = 0;
            }
        } else {
            scores.goal = 0;
        }

        // ================================================
        // TIER 3: PATTERN & BEHAVIOR FACTORS
        // ================================================

        // 8. Volatility (-30 to +25)
        const volatility = this._calculateVolatility(env);
        if (volatility < 0.15) {
            scores.volatility = 25;
            insights.push('📊 Very predictable spending');
        } else if (volatility < 0.3) {
            scores.volatility = 15;
        } else if (volatility > 0.7) {
            scores.volatility = -30;
            insights.push('📊 Highly unpredictable');
        } else if (volatility > 0.5) {
            scores.volatility = -15;
        } else {
            scores.volatility = 0;
        }

        // 9. Spending Velocity (-25 to +25)
        const velocity = c.velocities.get(env.id);
        if (velocity) {
            if (velocity.trend === 'decelerating') {
                scores.velocity = 25;
                insights.push('📉 Spending slowing down');
            } else if (velocity.trend === 'accelerating') {
                scores.velocity = -25;
                insights.push('📈 Spending accelerating');
            } else {
                scores.velocity = 0;
            }
        } else {
            scores.velocity = 0;
        }

        // 10. Day-of-Week Pattern (-20 to +20)
        const dowPattern = c.dowPatterns.get(env.id);
        if (dowPattern) {
            const todayExpected = dowPattern[c.dayOfWeek] || 0;
            const avgDaily = Object.values(dowPattern).reduce((a, b) => a + b, 0) / 7;

            if (todayExpected > avgDaily * 1.5) {
                scores.dowPattern = -20;
                insights.push(`📅 High-spend day (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][c.dayOfWeek]})`);
            } else if (todayExpected < avgDaily * 0.5) {
                scores.dowPattern = 20;
                insights.push('📅 Low-spend day typically');
            } else {
                scores.dowPattern = 0;
            }
        } else {
            scores.dowPattern = 0;
        }

        // 11. Anomaly Score (-35 to +15)
        const anomaly = c.anomalies.get(env.id);
        if (anomaly && anomaly.isAnomaly) {
            scores.anomaly = -35;
            insights.push('⚡ Unusual recent activity');
        } else if (anomaly && anomaly.score < 0.1) {
            scores.anomaly = 15;
            insights.push('✅ Normal spending pattern');
        } else {
            scores.anomaly = 0;
        }

        // 12. Price Change Detection (-30 to +10)
        const priceChange = c.priceChanges.get(env.name.toLowerCase());
        if (priceChange) {
            if (priceChange.direction === 'up' && priceChange.percentChange > 10) {
                scores.priceChange = -30;
                insights.push(`💸 Prices up ${priceChange.percentChange}%`);
            } else if (priceChange.direction === 'down') {
                scores.priceChange = 10;
                insights.push('✅ Prices dropped recently');
            } else {
                scores.priceChange = 0;
            }
        } else {
            scores.priceChange = 0;
        }

        // ================================================
        // TIER 4: CONTEXTUAL & META FACTORS
        // ================================================

        // 13. Payday Proximity (-20 to +20)
        if (c.daysUntilPayday <= 2) {
            scores.payday = 20;
            insights.push('💵 Payday soon - can recover');
        } else if (c.daysUntilPayday > 10) {
            scores.payday = -20;
            insights.push('💵 Long time until payday');
        } else {
            scores.payday = 0;
        }

        // 14. End-of-Month Pressure (-15 to +15)
        if (c.isEndOfMonth) {
            // End of month = budgets about to reset
            if (surplusRatio > 1.0) {
                scores.monthEnd = 15;
                insights.push('📆 End of month - surplus safe to use');
            } else {
                scores.monthEnd = -15;
            }
        } else if (c.isStartOfMonth) {
            scores.monthEnd = -10; // Fresh month, be conservative
        } else {
            scores.monthEnd = 0;
        }

        // 15. Cross-Jar Correlation (-20 to +20)
        const correlation = c.correlations.get(env.id);
        if (correlation) {
            if (correlation.type === 'inverse') {
                scores.correlation = 20;
                insights.push('🔗 Inversely correlated with target');
            } else if (correlation.type === 'positive') {
                scores.correlation = -20;
                insights.push('🔗 Spending linked to target jar');
            } else {
                scores.correlation = 0;
            }
        } else {
            scores.correlation = 0;
        }

        // 16. Transfer History (-25 to +15)
        const transferData = c.transferHistory.get(env.id);
        if (transferData) {
            if (transferData.recentDonations > 2) {
                scores.transferHistory = -25;
                insights.push('🔄 Already donated recently');
            } else if (transferData.recentDonations === 0 && transferData.typicalDonor) {
                scores.transferHistory = 15;
                insights.push('🔄 Typical donor jar');
            } else {
                scores.transferHistory = 0;
            }
        } else {
            scores.transferHistory = 0;
        }

        // 17. Cluster Health (-20 to +20)
        const cluster = this._guessCategory(env.name);
        const clusterData = c.clusterHealth.get(cluster);
        if (clusterData) {
            if (clusterData.healthRatio > 0.7) {
                scores.clusterHealth = 20;
                insights.push(`✅ ${cluster} category healthy`);
            } else if (clusterData.healthRatio < 0.3) {
                scores.clusterHealth = -20;
                insights.push(`⚠️ ${cluster} category struggling`);
            } else {
                scores.clusterHealth = 0;
            }
        } else {
            scores.clusterHealth = 0;
        }

        // 18. Seasonality (-25 to +25)
        const seasonal = c.seasonality.get(env.name.toLowerCase());
        if (seasonal) {
            if (seasonal.currentVsAvg < 0.7) {
                scores.seasonality = 25;
                insights.push('📊 Historically light month');
            } else if (seasonal.currentVsAvg > 1.3) {
                scores.seasonality = -25;
                insights.push('📊 Historically heavy month');
            } else {
                scores.seasonality = 0;
            }
        } else {
            scores.seasonality = 0;
        }

        // 19. Liquidity Fit (-15 to +45)
        if (liquid >= deficit) {
            scores.liquidity = 45;
            insights.push('✅ Can cover full amount');
        } else if (liquid >= deficit * 0.7) {
            scores.liquidity = 25;
        } else if (liquid >= deficit * 0.4) {
            scores.liquidity = 10;
        } else {
            scores.liquidity = -15;
        }

        // 20. Confidence Interval Width (-15 to +15)
        const ci = c.confidenceIntervals.get(env.name.toLowerCase());
        if (ci) {
            const width = ci.upper - ci.lower;
            const relativeWidth = ci.predicted > 0 ? width / ci.predicted : 1;
            if (relativeWidth < 0.3) {
                scores.confidenceWidth = 15;
                insights.push('📊 High prediction confidence');
            } else if (relativeWidth > 0.8) {
                scores.confidenceWidth = -15;
                insights.push('📊 Uncertain predictions');
            } else {
                scores.confidenceWidth = 0;
            }
        } else {
            scores.confidenceWidth = 0;
        }

        // ================================================
        // CALCULATE FINAL SCORE & SAFETY
        // ================================================

        const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

        // Calculate confidence (based on data quality)
        const dataPoints = env.transactions.filter(t => !t.deleted).length;
        const monthsOfData = this._getMonthsOfData(env);
        let confidence = Math.min(1, (dataPoints / 50) * 0.5 + (monthsOfData / 6) * 0.5);
        if (forecast) confidence = Math.max(confidence, forecast.confidence || 0);

        // Calculate safe maximum to take
        const normalizedScore = Math.min(1, Math.max(0, (totalScore + 200) / 600));
        const baseSafety = 0.3 + (normalizedScore * 0.6); // 0.3 to 0.9
        
        // Adjust for confidence
        const confidenceAdjusted = baseSafety * (0.7 + confidence * 0.3);
        
        // Never take more than liquid, apply safety factor
        const maxSafe = Math.floor(liquid * confidenceAdjusted);

        // Calculate recovery time (days to rebuild via budgeting)
        const monthlyBudget = env.budgets?.[this.currentMonth] || avgSpend;
        const recoveryDays = monthlyBudget > 0 
            ? Math.ceil((maxSafe / monthlyBudget) * 30)
            : 60;

        // Cascade risk: if we take from here, might it need to take from others?
        const cascadeRisk = this._calculateCascadeRisk(env, maxSafe);

        return {
            liquid,
            maxSafe,
            totalScore,
            confidence,
            scores,
            insights: insights.slice(0, 5), // Top 5 insights
            recoveryDays,
            cascadeRisk
        };
    }

    // ================================================
    // HELPER METHODS
    // ================================================

    _detectNextPayday() {
        // Find recurring income transactions
        const incomePatterns = [];
        
        this.accounts.forEach(acc => {
            acc.transactions
                .filter(tx => tx.type === 'income' && !tx.deleted && tx.amount > 0)
                .forEach(tx => {
                    const date = new Date(tx.date);
                    incomePatterns.push({
                        dayOfMonth: date.getDate(),
                        amount: tx.amount
                    });
                });
        });

        // Also check scheduled income
        this.scheduled
            .filter(s => s.type === 'income' && !s.deleted)
            .forEach(s => {
                const next = new Date(s.nextDate());
                if (next > this._cache.today) {
                    return next; // Return scheduled payday if upcoming
                }
            });

        // Find most common payday
        const dayCount = {};
        incomePatterns.forEach(p => {
            dayCount[p.dayOfMonth] = (dayCount[p.dayOfMonth] || 0) + 1;
        });

        let mostCommonDay = 15; // Default mid-month
        let maxCount = 0;
        Object.entries(dayCount).forEach(([day, count]) => {
            if (count > maxCount) {
                maxCount = count;
                mostCommonDay = parseInt(day);
            }
        });

        // Calculate next occurrence
        const today = this._cache.today;
        let nextPayday = new Date(today.getFullYear(), today.getMonth(), mostCommonDay);
        if (nextPayday <= today) {
            nextPayday.setMonth(nextPayday.getMonth() + 1);
        }

        return nextPayday;
    }

    _calculateReservedFunds(days) {
        const reserved = new Map();
        const today = this._cache.today;

        this.scheduled.forEach(bill => {
            if (!bill.envelopeId || bill.deleted || bill.type === 'income') return;

            // Look at next N occurrences within timeframe
            let checkDate = new Date(bill.nextDate());
            let occurrences = 0;
            const maxOccurrences = 4;

            while (occurrences < maxOccurrences) {
                const daysUntil = (checkDate - today) / (1000 * 60 * 60 * 24);

                if (daysUntil > days) break;
                if (daysUntil >= 0) {
                    // Exponential decay weighting
                    const weight = Math.exp(-daysUntil / 14); // Halflife ~10 days
                    const weightedAmount = Math.ceil(bill.amount * weight);

                    const current = reserved.get(bill.envelopeId) || 0;
                    reserved.set(bill.envelopeId, current + weightedAmount);
                }

                // Advance to next occurrence
                checkDate = this._advanceDate(checkDate, bill.frequency);
                occurrences++;
            }
        });

        return reserved;
    }

    _advanceDate(date, frequency) {
        const next = new Date(date);
        switch (frequency) {
            case 'weekly': next.setDate(next.getDate() + 7); break;
            case 'fortnightly': next.setDate(next.getDate() + 14); break;
            case 'monthly': next.setMonth(next.getMonth() + 1); break;
            case 'quarterly': next.setMonth(next.getMonth() + 3); break;
            case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
            default: next.setDate(next.getDate() + 30);
        }
        return next;
    }

    _getForecasts(months) {
        const map = new Map();
        try {
            const forecasts = this.forecaster.forecastMultinomial(months);
            Object.entries(forecasts).forEach(([monthKey, data]) => {
                if (data.categories) {
                    Object.entries(data.categories).forEach(([name, predicted]) => {
                        const existing = map.get(name.toLowerCase());
                        if (!existing || !existing.predicted) {
                            map.set(name.toLowerCase(), {
                                predicted,
                                confidence: data.confidence || 0.5
                            });
                        }
                    });
                }
            });
        } catch (e) { /* ML not trained */ }
        return map;
    }

    _getPriceChanges() {
        const map = new Map();
        try {
            const changes = this.forecaster.detectPriceChanges();
            changes.forEach(change => {
                map.set(change.payee?.toLowerCase(), {
                    direction: change.direction,
                    percentChange: change.percentChange
                });
            });
        } catch (e) { /* Not enough data */ }
        return map;
    }

    _getAnomalies() {
        const map = new Map();
        try {
            const insights = this.forecaster.getInsights(this.currentMonth, false);
            Object.entries(insights).forEach(([key, data]) => {
                if (data.anomalyScore !== undefined) {
                    // Try to match to envelope
                    this.envelopes.forEach(env => {
                        if (env.name.toLowerCase().includes(key.toLowerCase())) {
                            map.set(env.id, {
                                score: data.anomalyScore,
                                isAnomaly: data.isAnomaly
                            });
                        }
                    });
                }
            });
        } catch (e) { /* Optional */ }
        return map;
    }

    _getConfidenceIntervals() {
        const map = new Map();
        try {
            const insights = this.forecaster.getInsights(this.currentMonth, true);
            Object.entries(insights).forEach(([key, data]) => {
                if (data.confidenceIntervals) {
                    map.set(key.toLowerCase(), {
                        lower: data.confidenceIntervals.lower,
                        upper: data.confidenceIntervals.upper,
                        predicted: data.predicted || (data.confidenceIntervals.lower + data.confidenceIntervals.upper) / 2
                    });
                }
            });
        } catch (e) { /* Optional */ }
        return map;
    }

    _calculateVelocities() {
        const map = new Map();
        const today = this._cache.today;
        const twoWeeksAgo = new Date(today);
        twoWeeksAgo.setDate(today.getDate() - 14);
        const fourWeeksAgo = new Date(today);
        fourWeeksAgo.setDate(today.getDate() - 28);

        this.envelopes.forEach(env => {
            const recent = env.transactions
                .filter(tx => tx.type === 'spend' && !tx.deleted && new Date(tx.date) >= twoWeeksAgo)
                .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

            const prior = env.transactions
                .filter(tx => tx.type === 'spend' && !tx.deleted && 
                    new Date(tx.date) >= fourWeeksAgo && new Date(tx.date) < twoWeeksAgo)
                .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

            if (prior > 0) {
                const ratio = recent / prior;
                map.set(env.id, {
                    ratio,
                    trend: ratio > 1.3 ? 'accelerating' : ratio < 0.7 ? 'decelerating' : 'stable'
                });
            }
        });

        return map;
    }

    _analyzeDayOfWeekPatterns() {
        const map = new Map();

        this.envelopes.forEach(env => {
            const dowTotals = [0, 0, 0, 0, 0, 0, 0];
            const dowCounts = [0, 0, 0, 0, 0, 0, 0];

            env.transactions
                .filter(tx => tx.type === 'spend' && !tx.deleted)
                .forEach(tx => {
                    const dow = new Date(tx.date).getDay();
                    dowTotals[dow] += Math.abs(tx.amount);
                    dowCounts[dow]++;
                });

            // Calculate averages
            const dowAvg = dowTotals.map((total, i) => 
                dowCounts[i] > 0 ? total / dowCounts[i] : 0
            );

            if (dowAvg.some(v => v > 0)) {
                map.set(env.id, dowAvg);
            }
        });

        return map;
    }

    _calculateCorrelations(targetJarId) {
        const map = new Map();
        const targetEnv = this.envelopes.find(e => e.id === targetJarId);
        if (!targetEnv) return map;

        // Get target jar's monthly spending
        const targetMonthly = this._getMonthlySpendingMap(targetEnv);

        this.envelopes.forEach(env => {
            if (env.id === targetJarId || env.deleted) return;

            const envMonthly = this._getMonthlySpendingMap(env);
            
            // Calculate Pearson correlation
            const correlation = this._pearsonCorrelation(targetMonthly, envMonthly);

            if (Math.abs(correlation) > 0.5) {
                map.set(env.id, {
                    coefficient: correlation,
                    type: correlation > 0.5 ? 'positive' : correlation < -0.5 ? 'inverse' : 'none'
                });
            }
        });

        return map;
    }

    _getMonthlySpendingMap(env) {
        const monthly = {};
        env.transactions
            .filter(tx => tx.type === 'spend' && !tx.deleted)
            .forEach(tx => {
                const month = new Date(tx.date).toISOString().slice(0, 7);
                monthly[month] = (monthly[month] || 0) + Math.abs(tx.amount);
            });
        return monthly;
    }

    _pearsonCorrelation(mapA, mapB) {
        const months = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])];
        if (months.length < 3) return 0;

        const pairsA = months.map(m => mapA[m] || 0);
        const pairsB = months.map(m => mapB[m] || 0);

        const n = pairsA.length;
        const sumA = pairsA.reduce((a, b) => a + b, 0);
        const sumB = pairsB.reduce((a, b) => a + b, 0);
        const sumAB = pairsA.reduce((sum, a, i) => sum + a * pairsB[i], 0);
        const sumA2 = pairsA.reduce((sum, a) => sum + a * a, 0);
        const sumB2 = pairsB.reduce((sum, b) => sum + b * b, 0);

        const num = n * sumAB - sumA * sumB;
        const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));

        return den === 0 ? 0 : num / den;
    }

    _analyzeTransferHistory() {
        const map = new Map();
        const threeMonthsAgo = new Date(this._cache.today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        this.envelopes.forEach(env => {
            const outgoingTransfers = env.transactions.filter(tx => 
                tx.type === 'transfer' && 
                !tx.deleted && 
                tx.amount < 0 &&
                new Date(tx.date) >= threeMonthsAgo
            );

            const allTimeOut = env.transactions.filter(tx => 
                tx.type === 'transfer' && !tx.deleted && tx.amount < 0
            );

            map.set(env.id, {
                recentDonations: outgoingTransfers.length,
                totalDonations: allTimeOut.length,
                typicalDonor: allTimeOut.length > 3
            });
        });

        return map;
    }

    _analyzeClusterHealth() {
        const map = new Map();
        const clusters = {};

        // Group jars by category
        this.envelopes.forEach(env => {
            if (env.deleted) return;
            const category = this._guessCategory(env.name);
            if (!clusters[category]) {
                clusters[category] = { healthy: 0, unhealthy: 0, total: 0 };
            }
            clusters[category].total++;

            const pacing = this._cache.pacingMap.get(env.id);
            if (pacing?.status === 'success') {
                clusters[category].healthy++;
            } else if (pacing?.status === 'danger') {
                clusters[category].unhealthy++;
            }
        });

        Object.entries(clusters).forEach(([category, data]) => {
            map.set(category, {
                healthRatio: data.total > 0 ? data.healthy / data.total : 0.5,
                ...data
            });
        });

        return map;
    }

    _analyzeSeasonality(currentMonth) {
        const map = new Map();

        this.envelopes.forEach(env => {
            const monthlyByYear = {};
            const allMonthly = {};

            env.transactions
                .filter(tx => tx.type === 'spend' && !tx.deleted)
                .forEach(tx => {
                    const date = new Date(tx.date);
                    const month = date.getMonth();
                    const yearMonth = date.toISOString().slice(0, 7);

                    // Track this specific month across years
                    if (month === currentMonth) {
                        const year = date.getFullYear();
                        monthlyByYear[year] = (monthlyByYear[year] || 0) + Math.abs(tx.amount);
                    }

                    // Track all months
                    allMonthly[yearMonth] = (allMonthly[yearMonth] || 0) + Math.abs(tx.amount);
                });

            const thisMonthValues = Object.values(monthlyByYear);
            const allValues = Object.values(allMonthly);

            if (thisMonthValues.length >= 2 && allValues.length >= 6) {
                const thisMonthAvg = thisMonthValues.reduce((a, b) => a + b, 0) / thisMonthValues.length;
                const overallAvg = allValues.reduce((a, b) => a + b, 0) / allValues.length;

                if (overallAvg > 0) {
                    map.set(env.name.toLowerCase(), {
                        currentVsAvg: thisMonthAvg / overallAvg
                    });
                }
            }
        });

        return map;
    }

    _calculateGoalUrgency() {
        const map = new Map();
        const today = this._cache.today;

        this.envelopes.forEach(env => {
            if (!env.goalAmount || env.goalAmount <= 0) return;

            const progress = env.balance / env.goalAmount;
            let daysUntilDeadline = 365; // Default far away

            if (env.targetDate) {
                const deadline = new Date(env.targetDate);
                daysUntilDeadline = Math.max(0, (deadline - today) / (1000 * 60 * 60 * 24));
            }

            map.set(env.id, {
                progress,
                daysUntilDeadline,
                urgency: progress / (daysUntilDeadline / 30 + 1) // Higher = more urgent
            });
        });

        return map;
    }

    _estimateDaysUntilExpense(env) {
        let nearest = 30;

        // 1. Check scheduled
        this.scheduled.forEach(bill => {
            if (bill.envelopeId === env.id && !bill.deleted && bill.type !== 'income') {
                const due = new Date(bill.nextDate());
                const days = (due - this._cache.today) / (1000 * 60 * 60 * 24);
                if (days > 0 && days < nearest) {
                    nearest = days;
                }
            }
        });

        // 2. Pattern-based
        const recentDates = env.transactions
            .filter(tx => tx.type === 'spend' && !tx.deleted)
            .map(tx => new Date(tx.date))
            .sort((a, b) => b - a)
            .slice(0, 10);

        if (recentDates.length >= 3) {
            const intervals = [];
            for (let i = 0; i < recentDates.length - 1; i++) {
                intervals.push((recentDates[i] - recentDates[i + 1]) / (1000 * 60 * 60 * 24));
            }

            // Use MathUtils if available
            const cleanIntervals = typeof MathUtils !== 'undefined' && MathUtils.filterOutliers
                ? MathUtils.filterOutliers(intervals)
                : intervals;

            if (cleanIntervals.length > 0) {
                const avgInterval = cleanIntervals.reduce((a, b) => a + b, 0) / cleanIntervals.length;
                const daysSinceLast = (this._cache.today - recentDates[0]) / (1000 * 60 * 60 * 24);
                const estimated = Math.max(0, avgInterval - daysSinceLast);
                nearest = Math.min(nearest, estimated);
            }
        }

        return Math.round(nearest);
    }

    _calculateCascadeRisk(env, takeAmount) {
        // If we take this amount, what's the risk this jar will need to take from others?
        const afterTake = env.balance - takeAmount;
        const avgSpend = this._getAverageMonthlySpend(env, 2);
        const daysRemaining = this._cache.daysInMonth - this._cache.dayOfMonth;
        const expectedSpend = (avgSpend / 30) * daysRemaining;

        if (afterTake < expectedSpend * 0.5) {
            return 'high';
        } else if (afterTake < expectedSpend * 0.8) {
            return 'medium';
        }
        return 'low';
    }

    _getCategoryProtection(jarName) {
        const name = jarName.toLowerCase();

        // Leverage MLManager if available
        if (typeof MLManager !== 'undefined' && MLManager.KEYWORD_RULES) {
            for (const [category, keywords] of Object.entries(MLManager.KEYWORD_RULES)) {
                if (keywords.some(kw => name.includes(kw.toLowerCase()))) {
                    const scores = {
                        'RENT & UTILITIES': 95, 'INSURANCE': 90, 'MEDICAL & HEALTH': 88,
                        'GROCERIES': 65, 'TRANSPORT': 60, 'PHONE & INTERNET': 70,
                        'DINING & TAKEAWAY': 25, 'ENTERTAINMENT': 20, 'SHOPPING': 30,
                        'SUBSCRIPTIONS': 25, 'PERSONAL CARE': 35, 'EDUCATION': 75,
                        'CHARITY': 40, 'PETS': 55, 'KIDS': 80
                    };
                    if (scores[category]) return scores[category];
                }
            }
        }

        // Extensive fallback
        if (/rent|mortgage|hous/i.test(name)) return 100;
        if (/utilit|electric|water|power|energy|gas\b/i.test(name)) return 92;
        if (/insurance/i.test(name)) return 90;
        if (/medical|health|doctor|pharm|hospital/i.test(name)) return 88;
        if (/child|kid|baby|school|daycare|tuition/i.test(name)) return 85;
        if (/debt|loan|credit card/i.test(name)) return 82;
        if (/phone|mobile|internet|wifi/i.test(name)) return 72;
        if (/emergency|rainy/i.test(name)) return 78;
        if (/saving/i.test(name)) return 75;
        if (/grocery|groceries|supermarket/i.test(name)) return 68;
        if (/transport|car|fuel|petrol|uber|lyft|bus|train/i.test(name)) return 62;
        if (/pet|dog|cat|vet/i.test(name)) return 58;
        if (/vacation|travel|holiday|trip|flight/i.test(name)) return 48;
        if (/fitness|gym|sport/i.test(name)) return 42;
        if (/gift|birthday|christmas/i.test(name)) return 38;
        if (/beauty|hair|salon/i.test(name)) return 32;
        if (/shopping|clothes|cloth|amazon/i.test(name)) return 30;
        if (/hobby|craft/i.test(name)) return 28;
        if (/dining|restaurant|takeaway|takeout|ubereats|doordash/i.test(name)) return 25;
        if (/stream|netflix|spotify|disney|hulu|subscri/i.test(name)) return 22;
        if (/entertainment|fun|games|gaming|steam|playstation|xbox/i.test(name)) return 20;
        if (/coffee|cafe|starbucks/i.test(name)) return 15;
        if (/alcohol|beer|wine|liquor|bar/i.test(name)) return 12;

        return 50;
    }

    _getAverageMonthlySpend(env, months = 3) {
        const cutoff = new Date(this._cache.today);
        cutoff.setMonth(cutoff.getMonth() - months);

        const monthlyTotals = {};
        env.transactions
            .filter(tx => tx.type === 'spend' && !tx.deleted && new Date(tx.date) >= cutoff)
            .forEach(tx => {
                const month = new Date(tx.date).toISOString().slice(0, 7);
                monthlyTotals[month] = (monthlyTotals[month] || 0) + Math.abs(tx.amount);
            });

        const values = Object.values(monthlyTotals);
        if (values.length === 0) return 0;

        return typeof MathUtils !== 'undefined' && MathUtils.median
            ? MathUtils.median(values)
            : values.reduce((a, b) => a + b, 0) / values.length;
    }

    _calculateVolatility(env) {
        const monthlyTotals = {};
        env.transactions
            .filter(tx => tx.type === 'spend' && !tx.deleted)
            .forEach(tx => {
                const month = new Date(tx.date).toISOString().slice(0, 7);
                monthlyTotals[month] = (monthlyTotals[month] || 0) + Math.abs(tx.amount);
            });

        const values = Object.values(monthlyTotals);
        if (values.length < 2) return 0.5;

        if (typeof MathUtils !== 'undefined') {
            const mean = MathUtils.mean(values);
            const stdDev = MathUtils.standardDeviation(values);
            return mean > 0 ? Math.min(1, stdDev / mean) : 0.5;
        }

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
        return mean > 0 ? Math.min(1, Math.sqrt(variance) / mean) : 0.5;
    }

    _getMonthsOfData(env) {
        const months = new Set();
        env.transactions.forEach(tx => {
            if (!tx.deleted) {
                months.add(new Date(tx.date).toISOString().slice(0, 7));
            }
        });
        return months.size;
    }

    _guessCategory(name) {
        const n = name.toLowerCase();
        if (/food|grocery|dining|coffee|restaurant|takeaway/i.test(n)) return 'food';
        if (/transport|car|fuel|uber|lyft|bus|train/i.test(n)) return 'transport';
        if (/entertainment|fun|game|stream|netflix/i.test(n)) return 'entertainment';
        if (/bill|utility|rent|insurance|phone|internet/i.test(n)) return 'bills';
        if (/shop|cloth|amazon/i.test(n)) return 'shopping';
        if (/health|medical|gym|fitness/i.test(n)) return 'health';
        if (/saving|emergency|goal/i.test(n)) return 'savings';
        return 'other';
    }
}


