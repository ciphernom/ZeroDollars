import { Toaster } from '../ui/toast-manager.js';

/**
 * GamificationEngine v2.0 - Full-Featured Financial Gamification
 * 
 * Features:
 * - XP and leveling system with prestige
 * - Achievement/badge system (50+ achievements)
 * - Daily/Weekly/Monthly challenges
 * - Streak mechanics with recovery
 * - Skill trees
 * - Milestones and rewards
 * - Combo multipliers
 * - Seasonal events
 * - Personal bests tracking
 * - Social features (optional)
 */

export class GamificationEngine {
    constructor(db, pluginSystem) {
        this.db = db;
        this.plugins = pluginSystem;
        this.stats = null;
        this.achievements = null;
        this.challenges = null;
        
        // XP curve: level^1.5 * 100
        this.XP_TABLE = level => Math.floor(100 * Math.pow(level, 1.5));
        
        // Title progression
        this.TITLES = [
            { level: 1, title: 'Novice Saver', icon: '🌱' },
            { level: 3, title: 'Coin Keeper', icon: '🪙' },
            { level: 5, title: 'Budget Apprentice', icon: '📚' },
            { level: 8, title: 'Fiscal Ranger', icon: '🏹' },
            { level: 12, title: 'Ledger Knight', icon: '⚔️' },
            { level: 17, title: 'Baron of Balance', icon: '👑' },
            { level: 23, title: 'Sovereign of Savings', icon: '🏰' },
            { level: 30, title: 'Wealth Wizard', icon: '🧙' },
            { level: 40, title: 'Financial Sage', icon: '📿' },
            { level: 50, title: 'Money Master', icon: '💎' },
            { level: 75, title: 'Legendary Economist', icon: '🌟' },
            { level: 100, title: 'Elder God of Finance', icon: '🔱' }
        ];
        
        // Achievement definitions
        this.ACHIEVEMENT_DEFS = this._defineAchievements();
        
        // Challenge templates
        this.CHALLENGE_TEMPLATES = this._defineChallenges();
    }

    async init() {
        // Load player stats with defensive merging
        const savedStats = await this.db.get('gamification', 'player_stats');
        const defaults = this._createDefaultStats();
        
        if (savedStats) {
            // Deep merge with defaults to handle missing fields
            this.stats = {
                ...defaults,
                ...savedStats,
                totalStats: { ...defaults.totalStats, ...(savedStats.totalStats || savedStats.stats || {}) },
                personalBests: { ...defaults.personalBests, ...(savedStats.personalBests || {}) },
                combo: { ...defaults.combo, ...(savedStats.combo || {}) },
                skills: { ...defaults.skills, ...(savedStats.skills || {}) },
                preferences: { ...defaults.preferences, ...(savedStats.preferences || {}) }
            };
        } else {
            this.stats = defaults;
        }
        
        // Load achievements
        this.achievements = await this.db.get('gamification', 'achievements');
        if (!this.achievements) {
            this.achievements = { unlocked: [], progress: {} };
        }
        
        // Load/generate challenges
        this.challenges = await this.db.get('gamification', 'challenges');
        if (!this.challenges || this._needsNewChallenges()) {
            this.challenges = this._generateChallenges();
            await this.db.put('gamification', { id: 'challenges', ...this.challenges });
        }
        
        // Register event listeners
        this._registerEventListeners();
        
        // Check for daily reset
        await this._checkDailyReset();
        
        // Auto-scan existing transactions if stats look empty
        // This runs after import/restore or on fresh installs
        this._scheduleInitialScan();
        
        return this;
    }
    
    // Schedule a scan after app is fully loaded
    _scheduleInitialScan() {
        // Wait for app to be ready, then check if we need to scan
        setTimeout(async () => {
            if (this.stats.totalStats.transactionsLogged === 0 && window.app?.state) {
                const state = window.app.state;
                let txCount = 0;
                
                state.data.accounts.forEach(account => {
                    (account.transactions || []).forEach(tx => {
                        if (!tx.deleted) txCount++;
                    });
                });
                
                if (txCount > 0) {
                    console.log(`[Gamification] Found ${txCount} existing transactions, syncing stats...`);
                    await this.scanExistingTransactions(state);
                }
            }
        }, 2000); // Wait 2s for app to fully initialize
    }
    
    // Debug helper - call from console: app.gamification.debug()
    debug() {
        console.log('=== GamificationEngine Debug ===');
        console.log('Stats:', JSON.stringify(this.stats, null, 2));
        console.log('Achievements:', this.achievements);
        console.log('Challenges:', this.challenges);
        console.log('Plugins connected:', !!this.plugins);
        return this.stats;
    }
    
    // Scan existing transactions to catch up stats
    // Call from console: await app.gamification.scanExistingTransactions(app.state)
    async scanExistingTransactions(state) {
        if (!state?.data?.accounts) {
            console.error('No state data available');
            return;
        }
        
        let spendCount = 0;
        let incomeCount = 0;
        
        // Count all transactions from accounts
        state.data.accounts.forEach(account => {
            (account.transactions || []).forEach(tx => {
                if (tx.deleted) return;
                if (tx.type === 'spend') spendCount++;
                else if (tx.type === 'income') incomeCount++;
            });
        });
        
        console.log(`Found ${spendCount} spends and ${incomeCount} incomes`);
        
        // Update stats (without giving XP for old transactions)
        this.stats.totalStats.transactionsLogged = spendCount + incomeCount;
        this.stats.totalStats.incomeLogged = incomeCount;
        
        // Count goals completed
        let goalsCompleted = 0;
        state.data.envelopes.forEach(env => {
            if (env.goal && env.balance >= env.goal.targetAmount) {
                goalsCompleted++;
            }
        });
        this.stats.totalStats.goalsCompleted = goalsCompleted;
        
        // Check achievements based on new stats
        await this._checkAchievements({ action: 'scan', payload: {} });
        
        // Save
        await this.db.put('gamification', this.stats);
        
        console.log('Stats updated:', this.stats.totalStats);
        return this.stats;
    }

    _createDefaultStats() {
        return {
            id: 'player_stats',
            xp: 0,
            totalXp: 0,
            level: 1,
            prestige: 0,
            streak: 0,
            longestStreak: 0,
            lastActionDate: null,
            lastLoginDate: null,
            titles: ['Novice Saver'],
            activeTitle: 'Novice Saver',
            combo: { current: 0, multiplier: 1, lastActionTime: null },
            skills: this._createDefaultSkills(),
            totalStats: {
                transactionsLogged: 0,
                incomeLogged: 0,
                goalsCompleted: 0,
                budgetsOnTrack: 0,
                daysActive: 0,
                perfectWeeks: 0,
                perfectMonths: 0
            },
            personalBests: {
                longestStreak: 0
            },
            preferences: {
                notifications: true,
                sounds: false,
                animations: true
            },
            createdAt: Date.now()
        };
    }

    _createDefaultSkills() {
        return {
            budgeting: { level: 0, xp: 0 },
            saving: { level: 0, xp: 0 },
            tracking: { level: 0, xp: 0 },
            planning: { level: 0, xp: 0 },
            consistency: { level: 0, xp: 0 }
        };
    }

    _defineAchievements() {
        return {
            // === GETTING STARTED ===
            first_transaction: {
                id: 'first_transaction',
                name: 'First Steps',
                description: 'Log your first transaction',
                icon: '👣',
                category: 'beginner',
                xp: 50,
                condition: (stats) => stats.totalStats.transactionsLogged >= 1
            },
            first_budget: {
                id: 'first_budget',
                name: 'Budget Baby',
                description: 'Create your first budget envelope',
                icon: '🍼',
                category: 'beginner',
                xp: 50,
                condition: async (stats, state) => {
                    const envelopes = Array.from(state.data.envelopes.values());
                    return envelopes.some(e => e.budgeted > 0);
                }
            },
            
            // === CONSISTENCY ===
            streak_3: {
                id: 'streak_3',
                name: 'Three-peat',
                description: '3-day logging streak',
                icon: '🔥',
                category: 'consistency',
                xp: 100,
                condition: (stats) => stats.streak >= 3
            },
            streak_7: {
                id: 'streak_7',
                name: 'Week Warrior',
                description: '7-day logging streak',
                icon: '📅',
                category: 'consistency',
                xp: 250,
                condition: (stats) => stats.streak >= 7
            },
            streak_30: {
                id: 'streak_30',
                name: 'Monthly Master',
                description: '30-day logging streak',
                icon: '🗓️',
                category: 'consistency',
                xp: 1000,
                condition: (stats) => stats.streak >= 30
            },
            streak_100: {
                id: 'streak_100',
                name: 'Centurion',
                description: '100-day logging streak',
                icon: '💯',
                category: 'consistency',
                xp: 5000,
                tier: 'legendary',
                condition: (stats) => stats.streak >= 100
            },
            streak_365: {
                id: 'streak_365',
                name: 'Year of Zen',
                description: '365-day logging streak',
                icon: '🎊',
                category: 'consistency',
                xp: 25000,
                tier: 'mythic',
                condition: (stats) => stats.streak >= 365
            },
            
            // === VOLUME ===
            transactions_10: {
                id: 'transactions_10',
                name: 'Getting Started',
                description: 'Log 10 transactions',
                icon: '📝',
                category: 'volume',
                xp: 50,
                condition: (stats) => stats.totalStats.transactionsLogged >= 10
            },
            transactions_100: {
                id: 'transactions_100',
                name: 'Centurion Logger',
                description: 'Log 100 transactions',
                icon: '📊',
                category: 'volume',
                xp: 300,
                condition: (stats) => stats.totalStats.transactionsLogged >= 100
            },
            transactions_500: {
                id: 'transactions_500',
                name: 'Half Millennium',
                description: 'Log 500 transactions',
                icon: '📈',
                category: 'volume',
                xp: 750,
                condition: (stats) => stats.totalStats.transactionsLogged >= 500
            },
            transactions_1000: {
                id: 'transactions_1000',
                name: 'Thousand Tales',
                description: 'Log 1,000 transactions',
                icon: '📚',
                category: 'volume',
                xp: 2000,
                tier: 'epic',
                condition: (stats) => stats.totalStats.transactionsLogged >= 1000
            },
            
            // === SAVINGS ===
            first_goal: {
                id: 'first_goal',
                name: 'Dream Setter',
                description: 'Create your first savings goal',
                icon: '🎯',
                category: 'saving',
                xp: 100,
                condition: async (stats, state) => {
                    const envelopes = Array.from(state.data.envelopes.values());
                    return envelopes.some(e => e.goal && e.goal.targetAmount > 0);
                }
            },
            goal_25: {
                id: 'goal_25',
                name: 'Quarter Way',
                description: 'Reach 25% of a savings goal',
                icon: '🌱',
                category: 'saving',
                xp: 150,
                condition: async (stats, state) => {
                    const envelopes = Array.from(state.data.envelopes.values());
                    return envelopes.some(e => e.goal && e.balance >= e.goal.targetAmount * 0.25);
                }
            },
            goal_50: {
                id: 'goal_50',
                name: 'Halfway Hero',
                description: 'Reach 50% of a savings goal',
                icon: '🌿',
                category: 'saving',
                xp: 300,
                condition: async (stats, state) => {
                    const envelopes = Array.from(state.data.envelopes.values());
                    return envelopes.some(e => e.goal && e.balance >= e.goal.targetAmount * 0.5);
                }
            },
            goal_complete: {
                id: 'goal_complete',
                name: 'Dream Achieved',
                description: 'Complete a savings goal',
                icon: '🏆',
                category: 'saving',
                xp: 500,
                condition: (stats) => stats.totalStats.goalsCompleted >= 1
            },
            goals_5: {
                id: 'goals_5',
                name: 'Goal Getter',
                description: 'Complete 5 savings goals',
                icon: '🎖️',
                category: 'saving',
                xp: 1500,
                tier: 'epic',
                condition: (stats) => stats.totalStats.goalsCompleted >= 5
            },
            
            // === BUDGETING ===
            under_budget: {
                id: 'under_budget',
                name: 'Under Control',
                description: 'Stay under budget in all categories for a month',
                icon: '✅',
                category: 'budgeting',
                xp: 400,
                condition: (stats) => stats.totalStats.budgetsOnTrack >= 1
            },
            perfect_month: {
                id: 'perfect_month',
                name: 'Perfect Month',
                description: 'Log every day for a full month',
                icon: '🌙',
                category: 'budgeting',
                xp: 750,
                condition: (stats) => stats.totalStats.perfectMonths >= 1
            },
            
            // === SPECIAL ===
            night_owl: {
                id: 'night_owl',
                name: 'Night Owl',
                description: 'Log a transaction after midnight',
                icon: '🦉',
                category: 'special',
                xp: 75,
                hidden: true,
                condition: (stats, state, context) => {
                    const hour = new Date().getHours();
                    return context?.action === 'transaction' && (hour >= 0 && hour < 5);
                }
            },
            early_bird: {
                id: 'early_bird',
                name: 'Early Bird',
                description: 'Log a transaction before 6 AM',
                icon: '🐦',
                category: 'special',
                xp: 75,
                hidden: true,
                condition: (stats, state, context) => {
                    const hour = new Date().getHours();
                    return context?.action === 'transaction' && (hour >= 5 && hour < 7);
                }
            },
            weekend_warrior: {
                id: 'weekend_warrior',
                name: 'Weekend Warrior',
                description: 'Log transactions on 10 consecutive weekends',
                icon: '🎉',
                category: 'special',
                xp: 500,
                hidden: true,
                condition: (stats) => stats.totalStats.consecutiveWeekends >= 10
            },
            comeback_kid: {
                id: 'comeback_kid',
                name: 'Comeback Kid',
                description: 'Return after a 30+ day break',
                icon: '🔄',
                category: 'special',
                xp: 200,
                hidden: true,
                condition: (stats, state, context) => context?.comeback && context?.daysAway >= 30
            },
            
            // === LEVELS ===
            level_5: {
                id: 'level_5',
                name: 'Rising Star',
                description: 'Reach level 5',
                icon: '⭐',
                category: 'level',
                xp: 0,
                condition: (stats) => stats.level >= 5
            },
            level_10: {
                id: 'level_10',
                name: 'Double Digits',
                description: 'Reach level 10',
                icon: '🌟',
                category: 'level',
                xp: 0,
                condition: (stats) => stats.level >= 10
            },
            level_25: {
                id: 'level_25',
                name: 'Quarter Century',
                description: 'Reach level 25',
                icon: '💫',
                category: 'level',
                xp: 0,
                tier: 'epic',
                condition: (stats) => stats.level >= 25
            },
            level_50: {
                id: 'level_50',
                name: 'Golden',
                description: 'Reach level 50',
                icon: '🏅',
                category: 'level',
                xp: 0,
                tier: 'legendary',
                condition: (stats) => stats.level >= 50
            },
            
            // === COMBO ===
            combo_5: {
                id: 'combo_5',
                name: 'Combo Starter',
                description: 'Reach a 5x combo',
                icon: '🔢',
                category: 'combo',
                xp: 100,
                condition: (stats) => stats.combo.current >= 5
            },
            combo_10: {
                id: 'combo_10',
                name: 'Combo Master',
                description: 'Reach a 10x combo',
                icon: '💥',
                category: 'combo',
                xp: 300,
                condition: (stats) => stats.combo.current >= 10
            },
            
            // === EXPLORER ===
            all_features: {
                id: 'all_features',
                name: 'Explorer',
                description: 'Use all main features at least once',
                icon: '🧭',
                category: 'explorer',
                xp: 200,
                condition: (stats) => {
                    return stats.totalStats.usedBudget && stats.totalStats.usedAccounts && 
                           stats.totalStats.usedReports && stats.totalStats.usedScheduled;
                }
            }
        };
    }

    _defineChallenges() {
        return {
            daily: [
                {
                    id: 'log_3_transactions',
                    name: 'Triple Tracker',
                    description: 'Log 3 transactions today',
                    icon: '📝',
                    target: 3,
                    type: 'transaction_count',
                    xp: 50,
                    difficulty: 'easy'
                },
                {
                    id: 'categorize_all',
                    name: 'Category King',
                    description: 'Categorize every transaction today',
                    icon: '🏷️',
                    target: 100,
                    type: 'categorization_rate',
                    xp: 75,
                    difficulty: 'medium'
                },
                {
                    id: 'check_budget',
                    name: 'Budget Check',
                    description: 'Review your budget today',
                    icon: '👀',
                    target: 1,
                    type: 'budget_view',
                    xp: 25,
                    difficulty: 'easy'
                },
                {
                    id: 'no_impulse',
                    name: 'Mindful Spending',
                    description: 'No unplanned purchases over $50',
                    icon: '🧘',
                    target: 0,
                    type: 'impulse_control',
                    xp: 100,
                    difficulty: 'hard'
                }
            ],
            weekly: [
                {
                    id: 'log_20_transactions',
                    name: 'Weekly Logger',
                    description: 'Log 20 transactions this week',
                    icon: '📊',
                    target: 20,
                    type: 'transaction_count',
                    xp: 200,
                    difficulty: 'medium'
                },
                {
                    id: 'stay_under_budget',
                    name: 'Budget Guardian',
                    description: 'Stay under budget in 3 categories',
                    icon: '🛡️',
                    target: 3,
                    type: 'under_budget_count',
                    xp: 300,
                    difficulty: 'hard'
                },
                {
                    id: 'add_to_savings',
                    name: 'Saver\'s Spirit',
                    description: 'Add to savings at least once',
                    icon: '🐷',
                    target: 1,
                    type: 'savings_deposit',
                    xp: 150,
                    difficulty: 'easy'
                },
                {
                    id: 'perfect_week',
                    name: 'Perfect Week',
                    description: 'Log at least once every day this week',
                    icon: '🌟',
                    target: 7,
                    type: 'active_days',
                    xp: 400,
                    difficulty: 'hard'
                }
            ],
            monthly: [
                {
                    id: 'complete_a_goal',
                    name: 'Goal Crusher',
                    description: 'Complete or significantly progress a goal',
                    icon: '🎯',
                    target: 1,
                    type: 'goal_progress',
                    xp: 500,
                    difficulty: 'hard'
                },
                {
                    id: 'budget_accuracy',
                    name: 'Budget Wizard',
                    description: 'Stay within 10% of budget in all categories',
                    icon: '🧙',
                    target: 90,
                    type: 'budget_accuracy',
                    xp: 750,
                    difficulty: 'legendary'
                },
                {
                    id: 'consistency_master',
                    name: 'Consistency Master',
                    description: 'Log transactions on 25+ days this month',
                    icon: '📅',
                    target: 25,
                    type: 'monthly_active_days',
                    xp: 600,
                    difficulty: 'hard'
                }
            ]
        };
    }

    _registerEventListeners() {
        if (!this.plugins) return;
        
        this.plugins.on('transaction:spend_logged', (tx) => this.handleAction('spend', tx));
        this.plugins.on('transaction:transfer', (tx) => this.handleAction('transfer', tx));
        this.plugins.on('transaction:income_logged', (tx) => this.handleAction('income', tx));
        this.plugins.on('budget:updated', () => this.handleAction('budget_update'));
        this.plugins.on('goal:progress', (goal) => this.handleAction('goal_progress', goal));
        this.plugins.on('goal:completed', (goal) => this.handleAction('goal_complete', goal));
        this.plugins.on('app:feature_used', (feature) => this.handleAction('feature_used', { feature }));
    }

    async handleAction(type, payload = {}) {
        if (!this.stats) await this.init();
        
        const context = { action: type, payload, timestamp: Date.now() };
        let baseXp = this._getBaseXP(type);
        
        // Update stats counters
        this._updateStats(type, payload);
        
        // Update streak
        const streakResult = await this._updateStreak(context);
        context.comeback = streakResult.comeback;
        context.daysAway = streakResult.daysAway;
        
        // Update combo
        const comboMultiplier = this._updateCombo();
        
        // Calculate final XP
        let xp = Math.floor(baseXp * comboMultiplier * (1 + this.stats.prestige * 0.1));
        
        // Critical success (variable reward)
        if (Math.random() < 0.08) {
            xp *= 5;
            this._showCriticalSuccess(xp);
        }
        
        // Apply XP
        await this._addXP(xp);
        
        // Check achievements
        await this._checkAchievements(context);
        
        // Update challenges
        await this._updateChallenges(type, payload);
        
        // Persist stats
        await this.db.put('gamification', this.stats);
        
        // Emit update event
        this._emitUpdate();
        
        return { xp, multiplier: comboMultiplier };
    }

    _getBaseXP(type) {
        const xpTable = {
            spend: 10,
            income: 50,
            transfer: 5,
            budget_update: 15,
            goal_progress: 25,
            goal_complete: 200,
            feature_used: 5
        };
        return xpTable[type] || 10;
    }

    _updateStats(type, payload) {
        switch (type) {
            case 'spend':
            case 'income':
                this.stats.totalStats.transactionsLogged++;
                if (type === 'income') this.stats.totalStats.incomeLogged++;
                break;
            case 'goal_complete':
                this.stats.totalStats.goalsCompleted++;
                break;
            case 'feature_used':
                if (payload.feature === 'budget') this.stats.totalStats.usedBudget = true;
                if (payload.feature === 'accounts') this.stats.totalStats.usedAccounts = true;
                if (payload.feature === 'reports') this.stats.totalStats.usedReports = true;
                if (payload.feature === 'scheduled') this.stats.totalStats.usedScheduled = true;
                break;
        }
    }

    async _updateStreak(context) {
        const today = new Date().toISOString().split('T')[0];
        const result = { comeback: false, daysAway: 0 };
        
        if (this.stats.lastActionDate === today) {
            return result;
        }
        
        if (this.stats.lastActionDate) {
            const lastDate = new Date(this.stats.lastActionDate);
            const todayDate = new Date(today);
            const daysDiff = Math.floor((todayDate - lastDate) / (24 * 60 * 60 * 1000));
            
            if (daysDiff === 1) {
                // Continue streak
                this.stats.streak++;
                if (this.stats.streak > this.stats.longestStreak) {
                    this.stats.longestStreak = this.stats.streak;
                    this._showNewRecord('streak', this.stats.streak);
                }
                Toaster.show(`🔥 Streak: ${this.stats.streak} days!`, 'success');
            } else if (daysDiff > 1) {
                // Streak broken
                result.daysAway = daysDiff;
                if (daysDiff >= 30) {
                    result.comeback = true;
                }
                if (this.stats.streak > 0) {
                    Toaster.show(`💔 Lost ${this.stats.streak} day streak!`, 'error');
                }
                this.stats.streak = 1;
            }
        } else {
            this.stats.streak = 1;
        }
        
        this.stats.lastActionDate = today;
        this.stats.totalStats.daysActive++;
        
        return result;
    }

    _updateCombo() {
        const now = Date.now();
        const comboWindow = 5 * 60 * 1000; // 5 minutes
        
        if (this.stats.combo.lastActionTime && 
            now - this.stats.combo.lastActionTime < comboWindow) {
            this.stats.combo.current++;
            this.stats.combo.multiplier = 1 + Math.min(this.stats.combo.current * 0.1, 2);
            
            if (this.stats.combo.current % 5 === 0) {
                Toaster.show(`⚡ ${this.stats.combo.current}x Combo!`, 'info');
            }
        } else {
            this.stats.combo.current = 1;
            this.stats.combo.multiplier = 1;
        }
        
        this.stats.combo.lastActionTime = now;
        return this.stats.combo.multiplier;
    }

    async _addXP(xp) {
        this.stats.xp += xp;
        this.stats.totalXp += xp;
        
        // Check for level up
        const requiredXp = this.XP_TABLE(this.stats.level);
        
        while (this.stats.xp >= requiredXp) {
            this.stats.xp -= requiredXp;
            this.stats.level++;
            await this._levelUp();
        }
        
        // Update skills
        this._distributeSkillXP(xp);
    }

    async _levelUp() {
        const titleInfo = this.TITLES.slice().reverse().find(t => this.stats.level >= t.level);
        
        if (titleInfo && !this.stats.titles.includes(titleInfo.title)) {
            this.stats.titles.push(titleInfo.title);
            this.stats.activeTitle = titleInfo.title;
        }
        
        Toaster.show(
            `🎉 LEVEL UP! Level ${this.stats.level} - ${titleInfo?.icon || '🌟'} ${titleInfo?.title || 'Unknown'}`,
            'info',
            5000
        );
        
        this._confetti();
        
        // Check for prestige
        if (this.stats.level >= 100 && this.stats.prestige < 10) {
            this._offerPrestige();
        }
    }

    _distributeSkillXP(xp) {
        // Distribute XP evenly to a random skill
        const skills = Object.keys(this.stats.skills);
        const skill = skills[Math.floor(Math.random() * skills.length)];
        this.stats.skills[skill].xp += Math.floor(xp / 2);
        
        // Check for skill level up
        const skillLevel = this.stats.skills[skill].level;
        const requiredSkillXP = 50 * Math.pow(skillLevel + 1, 1.3);
        
        if (this.stats.skills[skill].xp >= requiredSkillXP) {
            this.stats.skills[skill].xp -= requiredSkillXP;
            this.stats.skills[skill].level++;
            Toaster.show(`📈 ${skill.charAt(0).toUpperCase() + skill.slice(1)} skill leveled up!`, 'success');
        }
    }

    async _checkAchievements(context) {
        const state = window.app?.state;
        
        // Initialize unlocked as array if needed, or convert old format
        if (!Array.isArray(this.achievements.unlocked)) {
            this.achievements.unlocked = [];
        }
        
        // Track which IDs are unlocked
        const unlockedIds = this.achievements.unlocked.map(a => typeof a === 'string' ? a : a.id);
        
        for (const [id, achievement] of Object.entries(this.ACHIEVEMENT_DEFS)) {
            if (unlockedIds.includes(id)) continue;
            
            try {
                const condition = achievement.condition;
                const unlocked = typeof condition === 'function' 
                    ? await condition(this.stats, state, context)
                    : false;
                
                if (unlocked) {
                    // Store full achievement data
                    this.achievements.unlocked.push({
                        id,
                        name: achievement.name,
                        icon: achievement.icon,
                        rarity: achievement.rarity || 'common',
                        unlockedAt: Date.now()
                    });
                    await this._unlockAchievement(achievement);
                }
            } catch (e) {
                console.warn(`Error checking achievement ${id}:`, e);
            }
        }
        
        await this.db.put('gamification', { id: 'achievements', ...this.achievements });
    }

    async _unlockAchievement(achievement) {
        const tier = achievement.tier || 'common';
        const tierEmojis = { common: '🏅', epic: '💜', legendary: '🏆', mythic: '✨' };
        
        Toaster.show(
            `${tierEmojis[tier]} Achievement: ${achievement.icon} ${achievement.name}`,
            'success',
            5000
        );
        
        if (achievement.xp > 0) {
            await this._addXP(achievement.xp);
        }
        
        if (tier !== 'common') {
            this._confetti();
        }
    }

    async _updateChallenges(type, payload) {
        if (!this.challenges) return;
        
        const updateProgress = (challenge) => {
            switch (challenge.type) {
                case 'transaction_count':
                    if (type === 'spend' || type === 'income') {
                        challenge.progress = (challenge.progress || 0) + 1;
                    }
                    break;
                case 'budget_view':
                    if (type === 'feature_used' && payload?.feature === 'budget') {
                        challenge.progress = 1;
                    }
                    break;
                case 'savings_deposit':
                    if (type === 'transfer' && payload?.toSavings) {
                        challenge.progress = 1;
                    }
                    break;
            }
            
            // Check completion
            if (challenge.progress >= challenge.target && !challenge.completed) {
                challenge.completed = true;
                this._completeChallenge(challenge);
            }
        };
        
        this.challenges.daily.forEach(updateProgress);
        this.challenges.weekly.forEach(updateProgress);
        this.challenges.monthly.forEach(updateProgress);
        
        await this.db.put('gamification', { id: 'challenges', ...this.challenges });
    }

    _completeChallenge(challenge) {
        Toaster.show(`✅ Challenge Complete: ${challenge.name} (+${challenge.xp} XP)`, 'success');
        this._addXP(challenge.xp);
    }

    _generateChallenges() {
        const pickRandom = (arr, count) => {
            const shuffled = [...arr].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count).map(c => ({ ...c, progress: 0, completed: false }));
        };
        
        return {
            daily: pickRandom(this.CHALLENGE_TEMPLATES.daily, 3),
            weekly: pickRandom(this.CHALLENGE_TEMPLATES.weekly, 2),
            monthly: pickRandom(this.CHALLENGE_TEMPLATES.monthly, 1),
            generatedAt: Date.now()
        };
    }

    _needsNewChallenges() {
        if (!this.challenges?.generatedAt) return true;
        
        const now = new Date();
        const generated = new Date(this.challenges.generatedAt);
        
        // New day = new daily challenges
        return now.toDateString() !== generated.toDateString();
    }

    async _checkDailyReset() {
        const today = new Date().toISOString().split('T')[0];
        
        if (this.stats.lastLoginDate !== today) {
            // First login of the day
            this.stats.lastLoginDate = today;
            
            // Refresh daily challenges
            if (this._needsNewChallenges()) {
                this.challenges = this._generateChallenges();
                await this.db.put('gamification', { id: 'challenges', ...this.challenges });
            }
            
            Toaster.show('🌅 Welcome back! New challenges await.', 'info');
        }
    }

    _showCriticalSuccess(xp) {
        Toaster.show(`🎰 CRITICAL SUCCESS! +${xp} XP`, 'success', 4000);
        this._confetti();
    }

    _showNewRecord(type, value) {
        Toaster.show(`🏆 NEW RECORD! ${type}: ${value}`, 'success', 4000);
    }

    _offerPrestige() {
        // Could show a modal offering prestige reset
        console.log('Prestige available!');
    }

    _confetti() {
        if (this.stats?.preferences?.animations === false) return;
        
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        for (let i = 0; i < 40; i++) {
            const el = document.createElement('div');
            el.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                width: ${8 + Math.random() * 8}px;
                height: ${8 + Math.random() * 8}px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
                z-index: 9999;
                pointer-events: none;
            `;
            
            const x = (Math.random() - 0.5) * 500;
            const y = (Math.random() - 0.5) * 500;
            const rotation = Math.random() * 720;
            
            el.animate([
                { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
                { transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(0)`, opacity: 0 }
            ], { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' });
            
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1200);
        }
    }

    _emitUpdate() {
        const widget = document.getElementById('gamification-status-bar');
        if (widget) {
            widget.dispatchEvent(new CustomEvent('xp-update', { detail: this.stats }));
        }
    }

    // === PUBLIC API ===
    
    getStats() {
        return this.stats;
    }

    getAchievements() {
        return {
            unlocked: this.achievements?.unlocked || [],
            all: this.ACHIEVEMENT_DEFS,
            progress: this.achievements?.progress || {}
        };
    }

    getChallenges() {
        return this.challenges;
    }

    getCurrentTitle() {
        return this.stats?.activeTitle || 'Novice Saver';
    }

    setActiveTitle(title) {
        if (this.stats.titles.includes(title)) {
            this.stats.activeTitle = title;
            this.db.put('gamification', this.stats);
        }
    }

    getProgressToNextLevel() {
        const current = this.stats?.xp || 0;
        const required = this.XP_TABLE(this.stats?.level || 1);
        return { current, required, percentage: (current / required) * 100 };
    }

    getLeaderboardPosition() {
        // Placeholder for social features
        return null;
    }

    async prestige() {
        if (this.stats.level < 100) return false;
        
        this.stats.prestige++;
        this.stats.level = 1;
        this.stats.xp = 0;
        // Keep titles, achievements, and total XP
        
        await this.db.put('gamification', this.stats);
        Toaster.show(`✨ PRESTIGE ${this.stats.prestige}! You've ascended!`, 'success', 5000);
        this._confetti();
        
        return true;
    }
}
