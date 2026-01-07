import { Utils } from '../utils/index.js';

/**
 * InteractionTracker v2.0 - Rich Behavioral Analytics
 * 
 * Features:
 * - Dwell time tracking with attention scoring
 * - Session analytics
 * - Scroll depth and engagement
 * - Feature discovery tracking
 * - Hesitation detection
 * - Edit/undo patterns
 * - Time-of-day patterns
 * - Cross-session behavior
 * - Goal interaction tracking
 * - Friction point detection
 * - Heatmap data generation
 * - Privacy-preserving aggregation
 */

export class InteractionTracker {
    constructor(db) {
        this.db = db;
        
        // Session state
        this.session = {
            id: Utils.generateId(),
            startTime: Date.now(),
            events: [],
            features: new Set(),
            scrollDepths: {},
            interactions: 0
        };
        
        // Active view tracking
        this.activeView = {
            id: null,
            startTime: null,
            scrollStartDepth: 0,
            maxScrollDepth: 0
        };
        
        // Hesitation tracking
        this.hesitationState = {
            lastInputTime: null,
            inputBuffer: [],
            undoCount: 0
        };
        
        // Buffered metrics for batch writes
        this.metricsBuffer = [];
        this.BUFFER_FLUSH_INTERVAL = 15000; // 15 seconds
        this.MAX_BUFFER_SIZE = 50;
        
        // Time decay factor (30-day half-life)
        this.DECAY_HALF_LIFE_DAYS = 30;
        
        // Initialize
        this._startBufferFlush();
        this._trackSessionStart();
    }

    // ==================== VIEW TRACKING ====================
    
    /**
     * Start tracking a view (envelope, account, etc.)
     */
    logViewStart(targetId, targetType = 'envelope') {
        // End any existing view
        if (this.activeView.id) {
            this._endView();
        }
        
        this.activeView = {
            id: targetId,
            type: targetType,
            startTime: Date.now(),
            scrollStartDepth: 0,
            maxScrollDepth: 0,
            interactions: 0
        };
        
        this._pushEvent('view_start', targetId, { type: targetType });
    }

    /**
     * End current view tracking
     */
    logViewEnd() {
        this._endView();
    }

    _endView() {
        if (!this.activeView.id || !this.activeView.startTime) return;
        
        const duration = Date.now() - this.activeView.startTime;
        
        // Only log meaningful dwells (> 500ms, < 30 min)
        if (duration > 500 && duration < 30 * 60 * 1000) {
            this.pushMetric('dwell_time', this.activeView.id, duration, {
                type: this.activeView.type,
                maxScrollDepth: this.activeView.maxScrollDepth,
                interactions: this.activeView.interactions
            });
            
            // Calculate attention score
            const attentionScore = this._calculateAttentionScore(
                duration,
                this.activeView.maxScrollDepth,
                this.activeView.interactions
            );
            
            this.pushMetric('attention_score', this.activeView.id, attentionScore, {
                dwellMs: duration
            });
        }
        
        this.activeView = {
            id: null,
            startTime: null,
            scrollStartDepth: 0,
            maxScrollDepth: 0,
            interactions: 0
        };
    }

    _calculateAttentionScore(duration, scrollDepth, interactions) {
        // Combine dwell time, scroll engagement, and interactions
        const dwellScore = Math.min(duration / 60000, 1) * 40; // Max 40 points for 1+ min
        const scrollScore = scrollDepth * 30; // Max 30 points for full scroll
        const interactionScore = Math.min(interactions * 5, 30); // Max 30 points
        
        return Math.round(dwellScore + scrollScore + interactionScore);
    }

    // ==================== SCROLL TRACKING ====================
    
    /**
     * Track scroll depth
     */
    logScroll(scrollPercentage, containerId = 'main') {
        // Update session scroll depths
        if (!this.session.scrollDepths[containerId]) {
            this.session.scrollDepths[containerId] = 0;
        }
        this.session.scrollDepths[containerId] = Math.max(
            this.session.scrollDepths[containerId],
            scrollPercentage
        );
        
        // Update active view
        if (this.activeView.id) {
            this.activeView.maxScrollDepth = Math.max(
                this.activeView.maxScrollDepth,
                scrollPercentage
            );
        }
    }

    // ==================== INTERACTION TRACKING ====================
    
    /**
     * Track a user interaction
     */
    logInteraction(type, targetId, metadata = {}) {
        this.session.interactions++;
        
        if (this.activeView.id) {
            this.activeView.interactions++;
        }
        
        this._pushEvent('interaction', targetId, { interactionType: type, ...metadata });
        
        // Track specific interaction types
        switch (type) {
            case 'click':
                this.pushMetric('click', targetId, 1, metadata);
                break;
            case 'edit':
                this._trackEdit(targetId, metadata);
                break;
            case 'undo':
                this._trackUndo(targetId);
                break;
            case 'hover':
                this._trackHover(targetId, metadata);
                break;
        }
    }

    _trackEdit(targetId, metadata) {
        this.hesitationState.inputBuffer.push({
            time: Date.now(),
            target: targetId,
            type: metadata.fieldType
        });
        
        // Detect rapid edits (possible uncertainty)
        if (this.hesitationState.inputBuffer.length > 5) {
            const recentEdits = this.hesitationState.inputBuffer.slice(-5);
            const timeSpan = recentEdits[4].time - recentEdits[0].time;
            
            if (timeSpan < 5000) { // 5 edits in 5 seconds
                this.pushMetric('rapid_edits', targetId, 1, {
                    editCount: 5,
                    timeSpanMs: timeSpan
                });
            }
        }
        
        // Trim buffer
        if (this.hesitationState.inputBuffer.length > 20) {
            this.hesitationState.inputBuffer = this.hesitationState.inputBuffer.slice(-10);
        }
    }

    _trackUndo(targetId) {
        this.hesitationState.undoCount++;
        this.pushMetric('undo_action', targetId, 1);
    }

    _trackHover(targetId, metadata) {
        if (metadata.duration > 1500) { // Meaningful hover (1.5s+)
            this.pushMetric('hover_attention', targetId, metadata.duration);
        }
    }

    // ==================== TRANSFER TRACKING ====================
    
    /**
     * Track manual transfers between envelopes
     */
    logTransfer(fromId, toId, amount) {
        this.pushMetric('manual_transfer_pattern', fromId, amount, {
            destinationId: toId,
            direction: 'from'
        });
        
        this.pushMetric('manual_transfer_pattern', toId, amount, {
            sourceId: fromId,
            direction: 'to'
        });
        
        this._pushEvent('transfer', fromId, { to: toId, amount });
    }

    /**
     * Track rejection of SmartCover suggestions
     */
    logRejection(targetJarId, proposedPlan, reason = null) {
        this.pushMetric('smart_cover_rejection', targetJarId, 1, {
            plan: proposedPlan,
            reason
        });
        
        this._pushEvent('rejection', targetJarId, { plan: proposedPlan, reason });
    }

    /**
     * Track acceptance of SmartCover suggestions
     */
    logAcceptance(targetJarId, acceptedPlan) {
        this.pushMetric('smart_cover_acceptance', targetJarId, 1, {
            plan: acceptedPlan
        });
    }

    // ==================== FEATURE TRACKING ====================
    
    /**
     * Track feature usage
     */
    logFeatureUse(featureId, metadata = {}) {
        this.session.features.add(featureId);
        
        this.pushMetric('feature_use', featureId, 1, metadata);
        this._pushEvent('feature', featureId, metadata);
    }

    /**
     * Track feature discovery (first time use)
     */
    async logFeatureDiscovery(featureId) {
        const discoveries = await this.db.get('gamification', 'feature_discoveries') || { features: [] };
        
        if (!discoveries.features.includes(featureId)) {
            discoveries.features.push(featureId);
            await this.db.put('gamification', { id: 'feature_discoveries', ...discoveries });
            
            this.pushMetric('feature_discovery', featureId, 1);
            return true; // Was a new discovery
        }
        
        return false;
    }

    // ==================== HESITATION TRACKING ====================
    
    /**
     * Track hesitation before action
     */
    logHesitation(actionType, targetId, hesitationMs) {
        if (hesitationMs > 3000) { // Significant hesitation (3s+)
            this.pushMetric('hesitation', targetId, hesitationMs, {
                actionType
            });
        }
    }

    /**
     * Track form abandonment
     */
    logFormAbandonment(formId, fieldsCompleted, totalFields) {
        this.pushMetric('form_abandonment', formId, fieldsCompleted / totalFields, {
            fieldsCompleted,
            totalFields
        });
    }

    // ==================== NAVIGATION TRACKING ====================
    
    /**
     * Track navigation patterns
     */
    logNavigation(fromSection, toSection) {
        this._pushEvent('navigation', toSection, { from: fromSection });
        
        this.pushMetric('navigation_flow', `${fromSection}->${toSection}`, 1);
    }

    /**
     * Track search behavior
     */
    logSearch(query, resultsCount, selectedResult = null) {
        this.pushMetric('search', query, resultsCount, {
            selected: selectedResult
        });
        
        if (resultsCount === 0) {
            this.pushMetric('search_no_results', query, 1);
        }
    }

    // ==================== SESSION ANALYTICS ====================
    
    /**
     * Get current session analytics
     */
    getSessionAnalytics() {
        const duration = Date.now() - this.session.startTime;
        
        return {
            sessionId: this.session.id,
            duration,
            eventCount: this.session.events.length,
            featuresUsed: Array.from(this.session.features),
            scrollDepths: { ...this.session.scrollDepths },
            interactionCount: this.session.interactions,
            avgTimeBetweenInteractions: this._calculateAvgInteractionTime()
        };
    }

    _calculateAvgInteractionTime() {
        const interactionEvents = this.session.events.filter(
            e => e.type === 'interaction'
        );
        
        if (interactionEvents.length < 2) return 0;
        
        let totalTime = 0;
        for (let i = 1; i < interactionEvents.length; i++) {
            totalTime += interactionEvents[i].timestamp - interactionEvents[i - 1].timestamp;
        }
        
        return totalTime / (interactionEvents.length - 1);
    }

    _trackSessionStart() {
        this._pushEvent('session_start', 'app', {
            userAgent: navigator.userAgent,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            timeOfDay: this._getTimeOfDay()
        });
    }

    trackSessionEnd() {
        this._endView();
        
        const analytics = this.getSessionAnalytics();
        this.pushMetric('session_complete', 'app', analytics.duration, analytics);
        
        this.flush();
    }

    _getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }

    // ==================== CORE METRICS ====================
    
    /**
     * Push a metric to the buffer
     */
    pushMetric(type, targetId, value, metadata = {}) {
        const metric = {
            id: Utils.generateId(),
            type,
            targetId: String(targetId),
            value,
            metadata,
            timestamp: Date.now(),
            sessionId: this.session.id
        };
        
        this.metricsBuffer.push(metric);
        
        // Auto-flush if buffer is full
        if (this.metricsBuffer.length >= this.MAX_BUFFER_SIZE) {
            this.flush();
        }
    }

    _pushEvent(type, targetId, metadata = {}) {
        this.session.events.push({
            type,
            targetId,
            metadata,
            timestamp: Date.now()
        });
        
        // Trim session events if too large
        if (this.session.events.length > 1000) {
            this.session.events = this.session.events.slice(-500);
        }
    }

    // ==================== ANALYTICS QUERIES ====================
    
    /**
     * Get global stats with time decay
     */
    async getGlobalStats() {
        const metrics = await this._getAllMetrics();
        const stats = new Map();
        
        metrics.forEach(metric => {
            if (!stats.has(metric.targetId)) {
                stats.set(metric.targetId, {
                    dwellTime: 0,
                    views: 0,
                    manualFixes: 0,
                    attentionScore: 0,
                    rejections: 0,
                    acceptances: 0,
                    interactions: 0
                });
            }
            
            const entry = stats.get(metric.targetId);
            const weight = this._calculateDecayWeight(metric.timestamp);
            
            switch (metric.type) {
                case 'dwell_time':
                    entry.dwellTime += metric.value * weight;
                    entry.views++;
                    break;
                case 'attention_score':
                    entry.attentionScore += metric.value * weight;
                    break;
                case 'manual_transfer_pattern':
                    entry.manualFixes += weight;
                    break;
                case 'smart_cover_rejection':
                    entry.rejections += weight;
                    break;
                case 'smart_cover_acceptance':
                    entry.acceptances += weight;
                    break;
                case 'click':
                case 'interaction':
                    entry.interactions += weight;
                    break;
            }
        });
        
        return stats;
    }

    /**
     * Get behavioral profile for a specific target
     */
    async getBehavioralProfile(targetId) {
        const stats = await this.getGlobalStats();
        const raw = stats.get(targetId) || this._getEmptyProfile();
        
        return {
            totalDwellMs: raw.dwellTime,
            attentionScore: raw.attentionScore,
            viewCount: raw.views,
            interactionCount: raw.interactions,
            donorScore: raw.manualFixes,
            rejectionRate: raw.rejections / (raw.rejections + raw.acceptances || 1),
            engagementLevel: this._classifyEngagement(raw)
        };
    }

    _getEmptyProfile() {
        return {
            dwellTime: 0,
            views: 0,
            manualFixes: 0,
            attentionScore: 0,
            rejections: 0,
            acceptances: 0,
            interactions: 0
        };
    }

    _classifyEngagement(raw) {
        const score = raw.attentionScore + (raw.views * 5) + (raw.interactions * 2);
        
        if (score > 100) return 'high';
        if (score > 30) return 'medium';
        if (score > 0) return 'low';
        return 'none';
    }

    /**
     * Get time-of-day patterns
     */
    async getTimePatterns() {
        const metrics = await this._getAllMetrics();
        const patterns = {
            hourly: new Array(24).fill(0),
            dayOfWeek: new Array(7).fill(0),
            timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 }
        };
        
        metrics.forEach(metric => {
            const date = new Date(metric.timestamp);
            patterns.hourly[date.getHours()]++;
            patterns.dayOfWeek[date.getDay()]++;
            
            const tod = this._getTimeOfDayFromHour(date.getHours());
            patterns.timeOfDay[tod]++;
        });
        
        // Normalize
        const total = metrics.length || 1;
        patterns.hourly = patterns.hourly.map(v => v / total);
        patterns.dayOfWeek = patterns.dayOfWeek.map(v => v / total);
        
        return patterns;
    }

    _getTimeOfDayFromHour(hour) {
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }

    /**
     * Get friction points (areas of difficulty)
     */
    async getFrictionPoints() {
        const metrics = await this._getAllMetrics();
        const friction = {};
        
        metrics.forEach(metric => {
            if (['rapid_edits', 'undo_action', 'hesitation', 'form_abandonment', 'smart_cover_rejection'].includes(metric.type)) {
                const key = metric.targetId;
                if (!friction[key]) {
                    friction[key] = { targetId: key, score: 0, events: [] };
                }
                
                friction[key].score += metric.value * this._calculateDecayWeight(metric.timestamp);
                friction[key].events.push({
                    type: metric.type,
                    timestamp: metric.timestamp
                });
            }
        });
        
        return Object.values(friction)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
    }

    /**
     * Get feature usage analytics
     */
    async getFeatureUsage() {
        const metrics = await this._getAllMetrics();
        const features = {};
        
        metrics
            .filter(m => m.type === 'feature_use')
            .forEach(metric => {
                const key = metric.targetId;
                if (!features[key]) {
                    features[key] = { featureId: key, useCount: 0, lastUsed: 0 };
                }
                features[key].useCount++;
                features[key].lastUsed = Math.max(features[key].lastUsed, metric.timestamp);
            });
        
        return Object.values(features).sort((a, b) => b.useCount - a.useCount);
    }

    /**
     * Get navigation flow data for heatmap
     */
    async getNavigationFlow() {
        const metrics = await this._getAllMetrics();
        const flows = {};
        
        metrics
            .filter(m => m.type === 'navigation_flow')
            .forEach(metric => {
                flows[metric.targetId] = (flows[metric.targetId] || 0) + metric.value;
            });
        
        return flows;
    }

    // ==================== UTILITY METHODS ====================
    
    _calculateDecayWeight(timestamp) {
        const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
        return Math.exp(-ageDays * Math.LN2 / this.DECAY_HALF_LIFE_DAYS);
    }

    async _getAllMetrics() {
        try {
            const tx = this.db.instance.transaction(['metrics'], 'readonly');
            const store = tx.objectStore('metrics');
            const request = store.getAll();
            
            return new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => resolve([]);
            });
        } catch (e) {
            console.warn('Failed to get metrics:', e);
            return [];
        }
    }

    // ==================== PERSISTENCE ====================
    
    _startBufferFlush() {
        setInterval(() => this.flush(), this.BUFFER_FLUSH_INTERVAL);
        
        // Flush on page unload
        window.addEventListener('beforeunload', () => {
            this.trackSessionEnd();
        });
        
        // Flush on visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this._endView();
                this.flush();
            }
        });
    }

    async flush() {
        if (this.metricsBuffer.length === 0) return;
        
        const batch = [...this.metricsBuffer];
        this.metricsBuffer = [];
        
        try {
            await this.db.multiPut({ metrics: batch });
        } catch (e) {
            console.warn('Failed to flush metrics:', e);
            // Re-add failed metrics to buffer (with limit)
            if (this.metricsBuffer.length < this.MAX_BUFFER_SIZE) {
                this.metricsBuffer.unshift(...batch.slice(0, this.MAX_BUFFER_SIZE - this.metricsBuffer.length));
            }
        }
    }

    /**
     * Cleanup old metrics (call periodically)
     */
    async cleanup(maxAgeDays = 90) {
        const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
        
        try {
            const metrics = await this._getAllMetrics();
            const toDelete = metrics.filter(m => m.timestamp < cutoff).map(m => m.id);
            
            if (toDelete.length > 0) {
                const tx = this.db.instance.transaction(['metrics'], 'readwrite');
                const store = tx.objectStore('metrics');
                
                for (const id of toDelete) {
                    store.delete(id);
                }
                
                console.log(`Cleaned up ${toDelete.length} old metrics`);
            }
        } catch (e) {
            console.warn('Failed to cleanup metrics:', e);
        }
    }

    /**
     * Export analytics data (for debugging/export)
     */
    async exportAnalytics() {
        const [globalStats, timePatterns, frictionPoints, featureUsage] = await Promise.all([
            this.getGlobalStats(),
            this.getTimePatterns(),
            this.getFrictionPoints(),
            this.getFeatureUsage()
        ]);
        
        return {
            exportedAt: Date.now(),
            session: this.getSessionAnalytics(),
            globalStats: Object.fromEntries(globalStats),
            timePatterns,
            frictionPoints,
            featureUsage
        };
    }
}
