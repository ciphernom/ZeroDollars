/**
 * Enhanced BehavioralWidget v2.0
 * Displays attention patterns, friction points, and usage analytics
 * Integrates with enhanced InteractionTracker
 */

export const BehavioralWidget = {
    id: 'widget-behavioral',
    type: 'report-widget',
    order: -1,
    title: '🧠 Mind & Money',
    collapsible: true,
    gridSpan: 1,

    render: async (context) => {
        const { state, utils, db } = context;
        const container = utils.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '15px' }
        });

        const tracker = window.app?.ui?.tracker;

        if (!tracker) {
            return utils.createElement('div', {
                textContent: "Gathering behavioral data...",
                style: { color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }
            });
        }

        // Get enhanced tracker data
        const globalStats = tracker.getGlobalStats?.() || new Map();
        const timePatterns = tracker.getTimePatterns?.() || {};
        const frictionPoints = tracker.getFrictionPoints?.() || [];

        // Check if we have enough data
        let totalDwell = 0;
        if (globalStats instanceof Map) {
            globalStats.forEach(s => totalDwell += (s.dwellTime || 0));
        } else if (typeof globalStats === 'object') {
            Object.values(globalStats).forEach(s => totalDwell += (s.dwellTime || 0));
        }

        if (totalDwell < 5000) {
            return utils.createElement('div', {
                textContent: "Use the app more to generate behavioral insights.",
                style: { color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }
            });
        }

        // ===== TIME OF DAY ANALYSIS =====
        if (timePatterns.byHour) {
            const timeSection = utils.createElement('div', {
                style: {
                    background: 'var(--bg-primary)',
                    padding: '15px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)'
                }
            });

            // Find peak hours
            const hourCounts = timePatterns.byHour || {};
            const maxHour = Object.entries(hourCounts).reduce(
                (max, [hour, count]) => count > max.count ? { hour: parseInt(hour), count } : max,
                { hour: 0, count: 0 }
            );

            const timeOfDay = maxHour.hour < 6 ? 'night owl 🦉' :
                             maxHour.hour < 12 ? 'morning person 🌅' :
                             maxHour.hour < 17 ? 'afternoon user ☀️' :
                             maxHour.hour < 21 ? 'evening checker 🌆' : 'night owl 🦉';

            // Find peak day
            const dayCounts = timePatterns.byDay || {};
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const maxDay = Object.entries(dayCounts).reduce(
                (max, [day, count]) => count > max.count ? { day: parseInt(day), count } : max,
                { day: 0, count: 0 }
            );

            timeSection.innerHTML = `
                <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">
                    ⏰ Your Usage Patterns
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; text-align:center;">
                        <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:4px;">Peak Time</div>
                        <div style="font-size:1.1rem; font-weight:600;">${maxHour.hour}:00</div>
                        <div style="font-size:0.75rem; color:var(--accent);">${timeOfDay}</div>
                    </div>
                    <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; text-align:center;">
                        <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:4px;">Most Active Day</div>
                        <div style="font-size:1.1rem; font-weight:600;">${dayNames[maxDay.day]}</div>
                        <div style="font-size:0.75rem; color:var(--accent);">${maxDay.count} sessions</div>
                    </div>
                </div>
            `;

            container.appendChild(timeSection);
        }

        // ===== ATTENTION INSIGHTS =====
        const insights = [];
        const envelopes = state.data.envelopes || [];

        envelopes.forEach(env => {
            let envStats;
            if (globalStats instanceof Map) {
                envStats = globalStats.get(env.id);
            } else {
                envStats = globalStats[env.id];
            }
            
            if (!envStats || (envStats.dwellTime || 0) < 1000) return;

            const share = (envStats.dwellTime || 0) / totalDwell;
            const attentionScore = envStats.attentionScore || 0;
            const undoRate = envStats.undoCount ? envStats.undoCount / (envStats.interactionCount || 1) : 0;

            // High attention + low balance = anxiety
            if (share > 0.15 && env.balance < 10000) {
                insights.push({
                    icon: '😰',
                    color: '#b91c1c',
                    bg: '#fef2f2',
                    jar: env.name,
                    msg: "High attention, low funds",
                    type: 'Anxiety Signal'
                });
            }
            // Frequent undos = uncertainty
            else if (undoRate > 0.2) {
                insights.push({
                    icon: '🔄',
                    color: '#c2410c',
                    bg: '#fff7ed',
                    jar: env.name,
                    msg: "Frequent changes/undos",
                    type: 'Decision Uncertainty'
                });
            }
            // Very high attention score = obsessive
            else if (attentionScore > 80 || share > 0.30) {
                insights.push({
                    icon: '🔭',
                    color: '#4338ca',
                    bg: '#e0e7ff',
                    jar: env.name,
                    msg: "Very high engagement",
                    type: 'Obsessive Checking'
                });
            }
            // Low attention + manual fixes = friction
            else if ((envStats.manualFixes || 0) > 3) {
                insights.push({
                    icon: '🔧',
                    color: '#0891b2',
                    bg: '#ecfeff',
                    jar: env.name,
                    msg: "Frequent manual fixes",
                    type: 'Process Friction'
                });
            }
        });

        if (insights.length > 0) {
            const insightsSection = utils.createElement('div', {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }
            });

            insights.slice(0, 4).forEach(i => {
                const card = utils.createElement('div', {
                    style: {
                        display: 'flex',
                        gap: '12px',
                        padding: '12px',
                        background: i.bg,
                        borderRadius: '10px',
                        border: `1px solid ${i.color}30`,
                        alignItems: 'flex-start'
                    }
                });
                card.innerHTML = `
                    <div style="font-size:1.5rem;">${i.icon}</div>
                    <div style="flex:1;">
                        <div style="font-weight:600; color:${i.color}; margin-bottom:2px;">${i.jar}</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">${i.msg}</div>
                        <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:4px; text-transform:uppercase; letter-spacing:0.5px;">${i.type}</div>
                    </div>
                `;
                insightsSection.appendChild(card);
            });

            container.appendChild(insightsSection);
        } else {
            const balancedCard = utils.createElement('div', {
                style: {
                    background: '#f0fdf4',
                    padding: '15px',
                    borderRadius: '10px',
                    border: '1px solid #10b98130',
                    textAlign: 'center'
                }
            });
            balancedCard.innerHTML = `
                <div style="font-size:2rem; margin-bottom:5px;">🧘</div>
                <div style="font-weight:600; color:#10b981;">Attention Balanced</div>
                <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
                    Your focus across categories is healthy
                </div>
            `;
            container.appendChild(balancedCard);
        }

        // ===== FRICTION POINTS =====
        if (frictionPoints.length > 0) {
            const frictionSection = utils.createElement('div', {
                style: {
                    background: 'var(--bg-primary)',
                    padding: '15px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    marginTop: '5px'
                }
            });

            let frictionHTML = `
                <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">
                    ⚠️ Friction Points
                </div>
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">
                    Areas where you might be experiencing difficulty:
                </div>
            `;

            frictionPoints.slice(0, 3).forEach((point, index) => {
                const opacity = 1 - (index * 0.2);
                frictionHTML += `
                    <div style="display:flex; align-items:center; gap:10px; padding:8px; background:var(--bg-secondary); border-radius:6px; margin-bottom:6px; opacity:${opacity};">
                        <div style="width:24px; height:24px; background:#fef3c7; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:bold; color:#d97706;">
                            ${index + 1}
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:0.85rem; font-weight:500;">${point.targetId || point.target || 'Unknown'}</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary);">Score: ${Math.round(point.score || 0)}</div>
                        </div>
                    </div>
                `;
            });

            frictionSection.innerHTML = frictionHTML;
            container.appendChild(frictionSection);
        }

        return container;
    }
};
