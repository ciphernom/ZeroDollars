import { Utils } from '../utils/index.js';

/**
 * PsychEngine v2.0 - Advanced Financial Psychology Profiler
 * 
 * Features:
 * - Big Five (OCEAN) personality analysis from spending patterns
 * - Money Scripts detection (Klontz framework)
 * - Cognitive bias detection
 * - Temporal behavior patterns
 * - Financial wellness scoring
 * - Behavioral archetypes
 * - Personalized insights engine
 */

export class PsychEngine {
    constructor(state, interactionTracker) {
        this.state = state;
        this.tracker = interactionTracker;
        
        // Category mappings for trait detection
        this.CATEGORY_TRAITS = {
            openness: ['travel', 'book', 'education', 'hobby', 'tech', 'art', 'music', 'course', 'museum', 'concert', 'workshop'],
            conscientiousness: ['health', 'medical', 'gym', 'insurance', 'savings', 'investment', 'dental', 'checkup'],
            extraversion: ['dining', 'restaurant', 'bar', 'club', 'entertainment', 'party', 'event', 'ticket', 'social'],
            agreeableness: ['charity', 'gift', 'donation', 'pet', 'family', 'child', 'present', 'tip'],
            neuroticism: ['alcohol', 'gambling', 'lottery', 'casino', 'impulse', 'late fee', 'overdraft']
        };
    }

    /**
     * Generate comprehensive psychological profile
     */
    async generateProfile() {
        const txs = this._getAllTransactions();
        const interactions = await this.tracker?.getGlobalStats() || new Map();
        const sessionData = await this.tracker?.getSessionAnalytics?.() || {};
        
        const profile = {
            ocean: this._analyzeBigFive(txs),
            scripts: await this._analyzeMoneyScripts(txs, interactions),
            biases: this._detectCognitiveBiases(txs),
            temporal: this._analyzeTemporalPatterns(txs),
            wellness: this._calculateWellnessScore(txs),
            indicators: this._detectSpecificBehaviors(txs, interactions),
            archetype: null,
            insights: [],
            riskProfile: this._assessRiskProfile(txs),
            engagement: this._analyzeEngagement(interactions, sessionData),
            dataPoints: txs.length,
            generatedAt: Date.now()
        };
        
        profile.archetype = this._determineArchetype(profile);
        profile.insights = this._generateInsights(profile, txs);
        
        return profile;
    }

    _getAllTransactions() {
        return Array.from(this.state.data.accounts.values())
            .flatMap(a => a.transactions || [])
            .filter(t => !t.deleted && t.type === 'spend');
    }

    /**
     * Big Five (OCEAN) Personality Analysis
     */
    _analyzeBigFive(txs) {
        const scores = { O: 50, C: 50, E: 50, A: 50, N: 50 };
        const confidence = { O: 0, C: 0, E: 0, A: 0, N: 0 };
        
        if (txs.length < 10) {
            return { scores, confidence, needsMoreData: true };
        }
        
        const totalSpend = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
        if (totalSpend === 0) return { scores, confidence, needsMoreData: true };
        
        const sumCat = (keywords) => {
            return txs.reduce((sum, t) => {
                const text = this._getTransactionText(t).toLowerCase();
                return keywords.some(k => text.includes(k.toLowerCase())) ? sum + Math.abs(t.amount) : sum;
            }, 0);
        };

        // OPENNESS
        const noveltySpend = sumCat(this.CATEGORY_TRAITS.openness);
        const noveltyRatio = noveltySpend / totalSpend;
        const uniquePayees = new Set(txs.map(t => (t.note || '').toLowerCase().slice(0, 20))).size;
        const varietyScore = Math.min(1, uniquePayees / (txs.length * 0.5));
        
        scores.O += (noveltyRatio > 0.15) ? 20 : (noveltyRatio > 0.08) ? 10 : -10;
        scores.O += (varietyScore > 0.7) ? 15 : (varietyScore < 0.3) ? -15 : 0;
        confidence.O = Math.min(1, (noveltySpend > 0 ? 0.4 : 0) + (varietyScore * 0.6));

        // CONSCIENTIOUSNESS
        const healthSpend = sumCat(this.CATEGORY_TRAITS.conscientiousness);
        const hasLateFees = txs.some(t => /late|overdraft|nsf|penalty/i.test(t.note));
        const hasRegularPattern = this._detectRegularSpending(txs);
        const budgetAdherence = this._calculateBudgetAdherence(txs);
        
        scores.C += (healthSpend > 0) ? 15 : 0;
        scores.C += hasLateFees ? -25 : 10;
        scores.C += hasRegularPattern ? 15 : -10;
        scores.C += (budgetAdherence > 0.8) ? 15 : (budgetAdherence < 0.5) ? -15 : 0;
        confidence.C = Math.min(1, 0.3 + (hasRegularPattern ? 0.3 : 0) + (budgetAdherence * 0.4));

        // EXTRAVERSION
        const socialSpend = sumCat(this.CATEGORY_TRAITS.extraversion);
        const socialRatio = socialSpend / totalSpend;
        const weekendSpendRatio = this._getWeekendSpendRatio(txs);
        
        scores.E += (socialRatio > 0.4) ? 25 : (socialRatio > 0.2) ? 15 : (socialRatio < 0.1) ? -20 : 0;
        scores.E += (weekendSpendRatio > 0.4) ? 10 : (weekendSpendRatio < 0.2) ? -10 : 0;
        confidence.E = Math.min(1, socialRatio * 2 + 0.3);

        // AGREEABLENESS
        const empathySpend = sumCat(this.CATEGORY_TRAITS.agreeableness);
        const empathyRatio = empathySpend / totalSpend;
        const tipsCount = txs.filter(t => /tip|gratuity/i.test(t.note)).length;
        
        scores.A += (empathyRatio > 0.05) ? 20 : (empathyRatio > 0.02) ? 10 : -10;
        scores.A += (tipsCount > 5) ? 10 : 0;
        confidence.A = Math.min(1, empathyRatio * 5 + 0.3);

        // NEUROTICISM
        const lateNightTxs = txs.filter(t => {
            const h = new Date(t.date).getHours();
            return h >= 23 || h <= 4;
        });
        const impulseTxs = txs.filter(t => /impulse|urgent|emergency/i.test(t.note));
        const stressSpend = sumCat(this.CATEGORY_TRAITS.neuroticism);
        const spendingVariance = this._calculateSpendingVariance(txs);
        
        scores.N += (lateNightTxs.length > 3) ? 15 : 0;
        scores.N += (lateNightTxs.length > 10) ? 15 : 0;
        scores.N += (impulseTxs.length > 2) ? 10 : 0;
        scores.N += (stressSpend / totalSpend > 0.1) ? 15 : 0;
        scores.N += (spendingVariance > 0.5) ? 15 : (spendingVariance < 0.2) ? -10 : 0;
        confidence.N = Math.min(1, 0.3 + (lateNightTxs.length / 20) + (spendingVariance * 0.5));

        Object.keys(scores).forEach(k => {
            scores[k] = Math.max(0, Math.min(100, scores[k]));
        });
        
        return { scores, confidence, needsMoreData: false, dataPoints: txs.length };
    }

    /**
     * Money Scripts Analysis (Klontz framework)
     */
    async _analyzeMoneyScripts(txs, interactions) {
        const scripts = {
            avoidance: { score: 0, indicators: [], description: 'Tendency to avoid thinking about money' },
            worship: { score: 0, indicators: [], description: 'Belief that money solves all problems' },
            status: { score: 0, indicators: [], description: 'Self-worth tied to net worth' },
            vigilance: { score: 0, indicators: [], description: 'Watchful and concerned about money' }
        };
        
        const totalSpend = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
        
        // AVOIDANCE
        const uncategorized = txs.filter(t => !t.jarId).length;
        const uncatRatio = uncategorized / (txs.length || 1);
        
        if (uncatRatio > 0.3) {
            scripts.avoidance.score += 25;
            scripts.avoidance.indicators.push('Many uncategorized transactions');
        }
        if (uncatRatio > 0.5) {
            scripts.avoidance.score += 20;
            scripts.avoidance.indicators.push('Majority of spending untracked');
        }
        
        let totalDwell = 0;
        interactions.forEach(s => totalDwell += (s.dwellTime || 0));
        if (totalDwell < 30000 && txs.length > 20) {
            scripts.avoidance.score += 15;
            scripts.avoidance.indicators.push('Brief app sessions (avoidant behavior)');
        }
        
        // WORSHIP
        const accounts = Array.from(this.state.data.accounts.values());
        const totalDebt = accounts
            .filter(a => a.type === 'credit' || a.balance < 0)
            .reduce((s, a) => s + Math.abs(a.balance), 0);
        const totalAssets = accounts
            .filter(a => a.balance > 0)
            .reduce((s, a) => s + a.balance, 0);
        
        if (totalDebt > 500000) {
            scripts.worship.score += 20;
            scripts.worship.indicators.push('High debt levels');
        }
        if (totalDebt > totalAssets * 0.5) {
            scripts.worship.score += 15;
            scripts.worship.indicators.push('Debt exceeds 50% of assets');
        }
        
        const smallTxs = txs.filter(t => Math.abs(t.amount) < 5000);
        if (smallTxs.length / (txs.length || 1) > 0.6) {
            scripts.worship.score += 15;
            scripts.worship.indicators.push('Frequent small purchases (possible retail therapy)');
        }
        
        // STATUS
        const statusKeywords = [
            'gucci', 'tesla', 'apple', 'louis vuitton', 'rolex', 'prada', 
            'bmw', 'mercedes', 'porsche', 'fine dining', 'jewelry', 'designer',
            'premium', 'vip', 'first class', 'luxury'
        ];
        const statusTxs = txs.filter(t => 
            statusKeywords.some(k => (t.note || '').toLowerCase().includes(k))
        );
        
        if (statusTxs.length > 3) {
            scripts.status.score += (statusTxs.length * 8);
            scripts.status.indicators.push(`${statusTxs.length} luxury/status purchases`);
        }
        
        const entertainSpend = txs.filter(t => 
            /entertainment|dining|club|bar|fashion/i.test(this._getTransactionText(t))
        ).reduce((s, t) => s + Math.abs(t.amount), 0);
        
        if (entertainSpend / totalSpend > 0.35) {
            scripts.status.score += 20;
            scripts.status.indicators.push('High lifestyle spending ratio');
        }
        
        // VIGILANCE
        if (totalDwell > 300000) {
            scripts.vigilance.score += 25;
            scripts.vigilance.indicators.push('High app engagement (vigilant monitoring)');
        }
        
        const envelopeCount = Array.from(this.state.data.envelopes.values())
            .filter(e => !e.deleted).length;
        if (envelopeCount > 15) {
            scripts.vigilance.score += 15;
            scripts.vigilance.indicators.push('Detailed budget categories');
        }
        
        let totalViews = 0;
        interactions.forEach(s => totalViews += (s.views || 0));
        if (totalViews > 50) {
            scripts.vigilance.score += 15;
            scripts.vigilance.indicators.push('Frequent balance checking');
        }
        
        Object.keys(scripts).forEach(k => {
            scripts[k].score = Math.min(100, scripts[k].score);
        });
        
        return scripts;
    }

    /**
     * Detect cognitive biases
     */
    _detectCognitiveBiases(txs) {
        const biases = {};
        
        // Mental Accounting
        const byJar = {};
        txs.forEach(t => {
            const jar = t.jarId || 'uncategorized';
            if (!byJar[jar]) byJar[jar] = [];
            byJar[jar].push(t);
        });
        
        const jarVariances = Object.values(byJar).map(txList => {
            const amounts = txList.map(t => Math.abs(t.amount));
            return this._calculateVariance(amounts);
        });
        
        biases.mentalAccounting = {
            detected: jarVariances.some(v => v > 0.5),
            strength: Math.min(1, Math.max(...jarVariances, 0)),
            description: 'Treating money differently based on its source or intended use'
        };
        
        // Present Bias
        const goalEnvelopes = Array.from(this.state.data.envelopes.values())
            .filter(e => e.goal && !e.deleted);
        const goalProgress = goalEnvelopes.map(e => 
            e.goal.targetAmount > 0 ? e.balance / e.goal.targetAmount : 0
        );
        const avgGoalProgress = goalProgress.length > 0 
            ? goalProgress.reduce((a, b) => a + b, 0) / goalProgress.length 
            : 0.5;
        
        biases.presentBias = {
            detected: avgGoalProgress < 0.3 && txs.length > 30,
            strength: Math.max(0, 1 - avgGoalProgress),
            description: 'Prioritizing immediate spending over future goals'
        };
        
        // Round Number Bias
        const roundTxs = txs.filter(t => t.amount % 1000 === 0);
        const roundRatio = roundTxs.length / (txs.length || 1);
        
        biases.roundNumberBias = {
            detected: roundRatio > 0.25,
            strength: roundRatio,
            description: 'Preference for clean, round numbers'
        };
        
        // Anchoring Bias
        const amounts = txs.map(t => Math.abs(t.amount));
        const amountClusters = this._findAmountClusters(amounts);
        
        biases.anchoringBias = {
            detected: amountClusters.length > 0,
            strength: Math.min(1, amountClusters.length * 0.2),
            clusters: amountClusters,
            description: 'Certain price points anchoring spending decisions'
        };
        
        return biases;
    }

    /**
     * Analyze temporal patterns
     */
    _analyzeTemporalPatterns(txs) {
        const patterns = {
            hourly: new Array(24).fill(0),
            dayOfWeek: new Array(7).fill(0),
            dayOfMonth: new Array(31).fill(0),
            monthly: {},
            peakHour: null,
            peakDay: null,
            weekendRatio: 0,
            payweekSpike: false,
            endOfMonthDip: false
        };
        
        if (txs.length < 10) return patterns;
        
        txs.forEach(t => {
            const d = new Date(t.date);
            const amount = Math.abs(t.amount);
            
            patterns.hourly[d.getHours()] += amount;
            patterns.dayOfWeek[d.getDay()] += amount;
            patterns.dayOfMonth[d.getDate() - 1] += amount;
            
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            patterns.monthly[monthKey] = (patterns.monthly[monthKey] || 0) + amount;
        });
        
        patterns.peakHour = patterns.hourly.indexOf(Math.max(...patterns.hourly));
        patterns.peakDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
            patterns.dayOfWeek.indexOf(Math.max(...patterns.dayOfWeek))
        ];
        
        const weekendSpend = patterns.dayOfWeek[0] + patterns.dayOfWeek[6];
        const totalSpend = patterns.dayOfWeek.reduce((a, b) => a + b, 0);
        patterns.weekendRatio = weekendSpend / (totalSpend || 1);
        
        const payweekSpend = patterns.dayOfMonth.slice(0, 7).reduce((a, b) => a + b, 0) +
                           patterns.dayOfMonth.slice(14, 22).reduce((a, b) => a + b, 0);
        const avgDaySpend = patterns.dayOfMonth.reduce((a, b) => a + b, 0) / 31;
        patterns.payweekSpike = payweekSpend > avgDaySpend * 14 * 1.3;
        
        const endMonthSpend = patterns.dayOfMonth.slice(24).reduce((a, b) => a + b, 0);
        patterns.endOfMonthDip = endMonthSpend < avgDaySpend * 7 * 0.7;
        
        return patterns;
    }

    /**
     * Calculate wellness score
     */
    _calculateWellnessScore(txs) {
        const wellness = {
            overall: 0,
            dimensions: {},
            trend: 'stable',
            recommendations: []
        };
        
        const accounts = Array.from(this.state.data.accounts.values());
        const envelopes = Array.from(this.state.data.envelopes.values()).filter(e => !e.deleted);
        
        // Spending Control
        const monthlyTotals = Object.values(this._getMonthlyTotals(txs));
        const spendingVariance = this._calculateVariance(monthlyTotals);
        wellness.dimensions.spendingControl = Math.max(0, Math.min(100, 100 - (isNaN(spendingVariance) ? 0 : spendingVariance) * 100));
        
        // Saving Consistency
        const savingsEnvelopes = envelopes.filter(e => /saving|emergency|goal/i.test(e.name) || e.goal);
        const savingsTotal = savingsEnvelopes.reduce((s, e) => s + Math.max(0, e.balance || 0), 0);
        const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
        wellness.dimensions.savingConsistency = Math.min(100, (savingsTotal / (totalBalance || 1)) * 200);
        
        // Debt Management
        const totalDebt = accounts.filter(a => a.type === 'credit' || (a.balance || 0) < 0)
            .reduce((s, a) => s + Math.abs(a.balance || 0), 0);
        const debtToAssetRatio = totalDebt / (Math.max(1, totalBalance + totalDebt));
        wellness.dimensions.debtManagement = Math.max(0, 100 - debtToAssetRatio * 150);
        
        // Budget Adherence (renamed from planning_ahead)
        const scheduled = Array.from(this.state.data.scheduled?.values() || []).filter(s => !s.deleted);
        wellness.dimensions.budgetAdherence = Math.min(100, scheduled.length * 10 + 50); // Base of 50
        
        // Emergency Readiness
        const avgMonthlySpend = monthlyTotals.length > 0 
            ? monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length 
            : 1;
        const monthsOfRunway = savingsTotal / (avgMonthlySpend || 1);
        wellness.dimensions.emergencyReadiness = Math.min(100, monthsOfRunway * 20);
        
        // Goal Progress
        const goalsWithProgress = envelopes.filter(e => e.goal && e.goal.targetAmount > 0);
        const avgProgress = goalsWithProgress.length > 0
            ? goalsWithProgress.reduce((s, e) => s + (e.balance || 0) / e.goal.targetAmount, 0) / goalsWithProgress.length
            : 0.5;
        wellness.dimensions.goalProgress = Math.min(100, avgProgress * 100);
        
        // Overall score
        const weights = {
            spendingControl: 0.2,
            savingConsistency: 0.2,
            debtManagement: 0.25,
            budgetAdherence: 0.1,
            emergencyReadiness: 0.15,
            goalProgress: 0.1
        };
        
        wellness.overall = Object.entries(wellness.dimensions).reduce((sum, [key, value]) => {
            const safeValue = isNaN(value) ? 50 : value;
            return sum + (safeValue * (weights[key] || 0.15));
        }, 0);
        
        // Ensure overall is not NaN
        if (isNaN(wellness.overall)) wellness.overall = 50;
        
        // Recommendations
        Object.entries(wellness.dimensions).forEach(([dim, score]) => {
            const safeScore = isNaN(score) ? 50 : score;
            if (safeScore < 40) {
                wellness.recommendations.push({
                    dimension: dim,
                    priority: 'high',
                    message: this._getWellnessRecommendation(dim, safeScore)
                });
            } else if (safeScore < 70) {
                wellness.recommendations.push({
                    dimension: dim,
                    priority: 'medium',
                    message: this._getWellnessRecommendation(dim, safeScore)
                });
            }
        });
        
        return wellness;
    }

    /**
     * Detect specific behaviors
     */
    _detectSpecificBehaviors(txs, interactions) {
        const behaviors = [];
        
        // Night Owl
        const nightTxs = txs.filter(t => {
            const h = new Date(t.date).getHours();
            return h >= 23 || h < 4;
        });
        if (nightTxs.length > 3) {
            behaviors.push({
                id: 'midnight_shopper',
                title: '🦉 Night Owl Spender',
                desc: `${nightTxs.length} late-night transactions`,
                severity: nightTxs.length > 10 ? 'high' : 'medium',
                insight: 'Late-night spending is often impulsive. Try a "sleep on it" rule.'
            });
        }
        
        // Round Numbers
        const roundTxs = txs.filter(t => t.amount % 1000 === 0);
        if (roundTxs.length / (txs.length || 1) > 0.3) {
            behaviors.push({
                id: 'round_numbers',
                title: '🔢 Round Number Preference',
                desc: `${Math.round(roundTxs.length / txs.length * 100)}% round numbers`,
                severity: 'low',
                insight: 'You prefer clean numbers over exact amounts.'
            });
        }
        
        // Subscription Collector
        const recurringPayees = this._detectRecurringPayees(txs);
        if (recurringPayees.length > 10) {
            behaviors.push({
                id: 'subscription_creep',
                title: '📱 Subscription Collector',
                desc: `${recurringPayees.length} recurring subscriptions`,
                severity: recurringPayees.length > 20 ? 'high' : 'medium',
                insight: 'Regular subscription audit recommended.',
                payees: recurringPayees.slice(0, 5)
            });
        }
        
        // Weekend Warrior
        const weekendRatio = this._getWeekendSpendRatio(txs);
        if (weekendRatio > 0.45) {
            behaviors.push({
                id: 'weekend_splurger',
                title: '🎉 Weekend Warrior',
                desc: `${Math.round(weekendRatio * 100)}% weekend spending`,
                severity: 'medium',
                insight: 'Most spending concentrated on weekends.'
            });
        }
        
        // Payday Spender
        const paydaySpike = this._detectPaydaySpike(txs);
        if (paydaySpike.detected) {
            behaviors.push({
                id: 'payday_spender',
                title: '💸 Payday Spender',
                desc: `${paydaySpike.multiplier.toFixed(1)}x spending on paydays`,
                severity: paydaySpike.multiplier > 2 ? 'high' : 'medium',
                insight: 'Budget immediately after payday.'
            });
        }
        
        // Category Focus
        const categoryDominance = this._findDominantCategory(txs);
        if (categoryDominance.ratio > 0.4) {
            behaviors.push({
                id: 'category_obsession',
                title: '🎯 Category Focus',
                desc: `${Math.round(categoryDominance.ratio * 100)}% on ${categoryDominance.name}`,
                severity: categoryDominance.ratio > 0.6 ? 'high' : 'low',
                insight: 'Spending heavily concentrated in one area.'
            });
        }
        
        // Micro-transactions
        const microTxs = txs.filter(t => Math.abs(t.amount) < 1000);
        if (microTxs.length / (txs.length || 1) > 0.5) {
            const microTotal = microTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
            behaviors.push({
                id: 'micro_transactions',
                title: '🐜 Death by a Thousand Cuts',
                desc: `${microTxs.length} small purchases totaling ${Utils.formatCurrency(microTotal)}`,
                severity: 'medium',
                insight: 'Small purchases add up significantly.'
            });
        }
        
        // Emotional Spending
        const emotionalPatterns = this._detectEmotionalSpending(txs);
        if (emotionalPatterns.detected) {
            behaviors.push({
                id: 'emotional_spending',
                title: '💔 Emotional Spender',
                desc: emotionalPatterns.description,
                severity: 'high',
                insight: 'Wait 24 hours before unplanned purchases.'
            });
        }

        return behaviors;
    }

    /**
     * Assess risk profile
     */
    _assessRiskProfile(txs) {
        const profile = { overall: 'moderate', score: 50, factors: [] };
        const accounts = Array.from(this.state.data.accounts.values());
        
        const hasHighDebt = accounts.some(a => a.type === 'credit' && Math.abs(a.balance) > 1000000);
        const hasEmergencyFund = accounts.some(a => /emergency|savings/i.test(a.name) && a.balance > 500000);
        const hasInvestments = accounts.some(a => /invest|stock|crypto/i.test(a.name));
        const spendingVariance = this._calculateSpendingVariance(txs);
        
        if (hasHighDebt) {
            profile.score -= 20;
            profile.factors.push({ type: 'risk', desc: 'High credit utilization' });
        }
        if (!hasEmergencyFund) {
            profile.score -= 15;
            profile.factors.push({ type: 'risk', desc: 'No emergency fund detected' });
        }
        if (hasInvestments) {
            profile.score += 10;
            profile.factors.push({ type: 'positive', desc: 'Investment accounts present' });
        }
        if (spendingVariance > 0.4) {
            profile.score -= 10;
            profile.factors.push({ type: 'risk', desc: 'High spending variability' });
        }
        
        profile.score = Math.max(0, Math.min(100, profile.score));
        
        if (profile.score >= 70) profile.overall = 'conservative';
        else if (profile.score >= 40) profile.overall = 'moderate';
        else profile.overall = 'aggressive';
        
        return profile;
    }

    /**
     * Analyze engagement
     */
    _analyzeEngagement(interactions, sessionData) {
        const engagement = { level: 'new', score: 0, patterns: [], suggestions: [] };
        
        let totalDwell = 0, totalViews = 0;
        interactions.forEach(s => {
            totalDwell += (s.dwellTime || 0);
            totalViews += (s.views || 0);
        });
        
        engagement.score = Math.min(100, (totalDwell / 60000) * 5 + totalViews * 2);
        
        if (engagement.score > 80) engagement.level = 'power_user';
        else if (engagement.score > 50) engagement.level = 'engaged';
        else if (engagement.score > 20) engagement.level = 'casual';
        else engagement.level = 'new';
        
        const jarEngagement = [];
        interactions.forEach((stats, jarId) => {
            const jar = this.state.getEnvelope(jarId);
            if (jar) {
                jarEngagement.push({
                    name: jar.name,
                    attention: stats.dwellTime || 0,
                    fixes: stats.manualFixes || 0
                });
            }
        });
        
        jarEngagement.sort((a, b) => b.attention - a.attention);
        engagement.patterns = jarEngagement.slice(0, 5);
        
        return engagement;
    }

    /**
     * Determine archetype
     */
    _determineArchetype(profile) {
        const archetypes = {
            guardian: { score: 0, name: '🛡️ The Guardian', desc: 'Careful protector of financial security' },
            explorer: { score: 0, name: '🧭 The Explorer', desc: 'Adventurous with money, seeks experiences' },
            builder: { score: 0, name: '🏗️ The Builder', desc: 'Focused on growing wealth methodically' },
            harmonizer: { score: 0, name: '🤝 The Harmonizer', desc: 'Values relationships over accumulation' },
            optimizer: { score: 0, name: '📊 The Optimizer', desc: 'Data-driven, always seeking efficiency' },
            liberator: { score: 0, name: '🕊️ The Liberator', desc: 'Uses money as tool for freedom' }
        };
        
        const { ocean, scripts, wellness } = profile;
        
        archetypes.guardian.score += (ocean.scores.C - 50) / 2;
        archetypes.guardian.score += scripts.vigilance.score / 3;
        archetypes.guardian.score += (wellness.dimensions.emergencyReadiness || 0) / 5;
        
        archetypes.explorer.score += (ocean.scores.O - 50) / 2;
        archetypes.explorer.score += scripts.worship.score / 5;
        archetypes.explorer.score -= scripts.vigilance.score / 4;
        
        archetypes.builder.score += (ocean.scores.C - 50) / 2;
        archetypes.builder.score += (50 - ocean.scores.N) / 3;
        archetypes.builder.score += (wellness.dimensions.goalProgress || 0) / 4;
        
        archetypes.harmonizer.score += (ocean.scores.A - 50) / 2;
        archetypes.harmonizer.score += (ocean.scores.E - 50) / 3;
        
        archetypes.optimizer.score += scripts.vigilance.score / 3;
        archetypes.optimizer.score += (wellness.dimensions.budgetAdherence || 0) / 4;
        archetypes.optimizer.score += (wellness.dimensions.spendingControl || 0) / 5;
        
        archetypes.liberator.score += (50 - Math.abs(scripts.avoidance.score - 50)) / 3;
        archetypes.liberator.score += wellness.overall / 5;
        
        const sorted = Object.entries(archetypes).sort((a, b) => b[1].score - a[1].score);
        
        return {
            primary: sorted[0][1],
            secondary: sorted[1][1],
            all: archetypes
        };
    }

    /**
     * Generate insights
     */
    _generateInsights(profile, txs) {
        const insights = [];
        
        if (profile.ocean.scores.O > 70) {
            insights.push({
                type: 'personality', icon: '🌟', title: 'Experience Seeker',
                message: 'You value new experiences. Balance adventure with savings goals.',
                priority: 'info'
            });
        }
        
        if (profile.ocean.scores.C < 40) {
            insights.push({
                type: 'personality', icon: '📋', title: 'Structure Opportunity',
                message: 'Adding structure to finances could reduce stress.',
                priority: 'suggestion'
            });
        }
        
        if (profile.ocean.scores.N > 70) {
            insights.push({
                type: 'wellbeing', icon: '🧘', title: 'Financial Anxiety Detected',
                message: 'Consider automating more financial decisions.',
                priority: 'important'
            });
        }
        
        Object.entries(profile.scripts).forEach(([script, data]) => {
            if (data.score > 50) {
                insights.push({
                    type: 'script',
                    icon: this._getScriptIcon(script),
                    title: `Money Script: ${this._getScriptName(script)}`,
                    message: data.description,
                    indicators: data.indicators,
                    priority: data.score > 70 ? 'important' : 'info'
                });
            }
        });
        
        profile.wellness.recommendations.slice(0, 3).forEach(rec => {
            insights.push({
                type: 'wellness', icon: '💪',
                title: `Improve: ${rec.dimension.replace(/_/g, ' ')}`,
                message: rec.message,
                priority: rec.priority
            });
        });
        
        profile.indicators.slice(0, 3).forEach(indicator => {
            insights.push({
                type: 'behavior',
                icon: indicator.title.split(' ')[0],
                title: indicator.title.slice(2).trim(),
                message: indicator.insight,
                priority: indicator.severity === 'high' ? 'important' : 'info'
            });
        });
        
        const priorityOrder = { important: 0, suggestion: 1, info: 2 };
        insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        
        return insights.slice(0, 8);
    }

    // ==================== HELPERS ====================

    _getTransactionText(t) {
        const envelope = t.jarId ? this.state.getEnvelope(t.jarId) : null;
        return `${envelope?.name || ''} ${t.note || ''}`;
    }

    _detectRegularSpending(txs) {
        const weeklyTotals = {};
        txs.forEach(t => {
            const week = Math.floor(t.date / (7 * 24 * 60 * 60 * 1000));
            weeklyTotals[week] = (weeklyTotals[week] || 0) + Math.abs(t.amount);
        });
        const totals = Object.values(weeklyTotals);
        if (totals.length < 4) return false;
        return this._calculateVariance(totals) < 0.3;
    }

    _calculateBudgetAdherence(txs) {
        const envelopes = Array.from(this.state.data.envelopes.values()).filter(e => !e.deleted && e.budgeted > 0);
        if (envelopes.length === 0) return 0.5;
        
        const adherenceScores = envelopes.map(env => {
            const spent = txs.filter(t => t.jarId === env.id).reduce((s, t) => s + Math.abs(t.amount), 0);
            const budgeted = env.budgeted;
            if (budgeted === 0) return 1;
            return Math.max(0, 1 - Math.abs(spent - budgeted) / budgeted);
        });
        
        return adherenceScores.reduce((a, b) => a + b, 0) / adherenceScores.length;
    }

    _getWeekendSpendRatio(txs) {
        const weekend = txs.filter(t => {
            const d = new Date(t.date).getDay();
            return d === 0 || d === 6;
        }).reduce((s, t) => s + Math.abs(t.amount), 0);
        const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
        return weekend / (total || 1);
    }

    _calculateSpendingVariance(txs) {
        const amounts = txs.map(t => Math.abs(t.amount));
        return this._calculateVariance(amounts);
    }

    _calculateVariance(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        if (mean === 0) return 0;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(variance) / mean;
    }

    _findAmountClusters(amounts) {
        const clusters = {};
        amounts.forEach(a => {
            const bucket = Math.round(a / 500) * 500;
            clusters[bucket] = (clusters[bucket] || 0) + 1;
        });
        return Object.entries(clusters)
            .filter(([_, count]) => count > 5)
            .map(([amount, count]) => ({ amount: Number(amount), count }));
    }

    _getMonthlyTotals(txs) {
        const monthly = {};
        txs.forEach(t => {
            const d = new Date(t.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthly[key] = (monthly[key] || 0) + Math.abs(t.amount);
        });
        return monthly;
    }

    _detectRecurringPayees(txs) {
        const payeeCounts = {};
        txs.forEach(t => {
            const payee = (t.note || '').toLowerCase().slice(0, 30);
            if (payee.length > 3) payeeCounts[payee] = (payeeCounts[payee] || 0) + 1;
        });
        return Object.entries(payeeCounts)
            .filter(([_, count]) => count >= 3)
            .map(([payee, count]) => ({ payee, count }))
            .sort((a, b) => b.count - a.count);
    }

    _detectPaydaySpike(txs) {
        const byDayOfMonth = new Array(31).fill(0).map(() => []);
        txs.forEach(t => {
            const dom = new Date(t.date).getDate();
            byDayOfMonth[dom - 1].push(Math.abs(t.amount));
        });
        
        const avgByDay = byDayOfMonth.map(amounts => 
            amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0
        );
        
        const overallAvg = avgByDay.reduce((a, b) => a + b, 0) / 31;
        const paydayAvg = (avgByDay[0] + avgByDay[14]) / 2;
        const multiplier = paydayAvg / (overallAvg || 1);
        
        return {
            detected: multiplier > 1.5,
            multiplier,
            likelyPaydays: [1, 15].filter((d) => avgByDay[d - 1] > overallAvg * 1.3)
        };
    }

    _findDominantCategory(txs) {
        const byJar = {};
        txs.forEach(t => {
            const jar = t.jarId ? this.state.getEnvelope(t.jarId)?.name || 'Other' : 'Uncategorized';
            byJar[jar] = (byJar[jar] || 0) + Math.abs(t.amount);
        });
        
        const total = Object.values(byJar).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(byJar).sort((a, b) => b[1] - a[1]);
        
        return {
            name: sorted[0]?.[0] || 'None',
            amount: sorted[0]?.[1] || 0,
            ratio: (sorted[0]?.[1] || 0) / (total || 1)
        };
    }

    _detectEmotionalSpending(txs) {
        const sortedTxs = [...txs].sort((a, b) => a.date - b.date);
        let emotionalBursts = 0;
        
        for (let i = 1; i < sortedTxs.length; i++) {
            const gap = sortedTxs[i].date - sortedTxs[i - 1].date;
            const gapDays = gap / (24 * 60 * 60 * 1000);
            
            if (gapDays > 3) {
                let burstCount = 0;
                let j = i;
                while (j < sortedTxs.length && sortedTxs[j].date - sortedTxs[i].date < 24 * 60 * 60 * 1000) {
                    burstCount++;
                    j++;
                }
                if (burstCount >= 4) emotionalBursts++;
            }
        }
        
        return {
            detected: emotionalBursts > 2,
            description: `${emotionalBursts} potential emotional spending episodes`,
            count: emotionalBursts
        };
    }

    _getWellnessRecommendation(dimension, score) {
        const recommendations = {
            spendingControl: 'Set spending limits for variable expense categories.',
            savingConsistency: 'Automate transfers to savings on payday.',
            debtManagement: 'Focus on paying down high-interest debt first.',
            budgetAdherence: 'Schedule recurring bills to avoid surprises.',
            emergencyReadiness: 'Build emergency fund covering 3-6 months of expenses.',
            goalProgress: 'Break large goals into smaller monthly targets.'
        };
        return recommendations[dimension] || 'Continue improving financial habits.';
    }

    _getScriptIcon(script) {
        return { avoidance: '🙈', worship: '🙏', status: '💎', vigilance: '🦅' }[script] || '💭';
    }

    _getScriptName(script) {
        return { avoidance: 'Avoider', worship: 'Worshipper', status: 'Status Seeker', vigilance: 'Vigilant' }[script] || script;
    }
}
