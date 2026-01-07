/**
 * Enhanced PersonalityWidget v2.0
 * Displays Big Five personality, archetypes, money scripts, and cognitive biases
 * Integrates with enhanced PsychEngine
 */

import { PsychEngine } from '../../services/psych-engine.js';

export const PersonalityWidget = {
    id: 'widget-personality',
    type: 'report-widget',
    order: -4,
    title: '🧬 Financial DNA',
    collapsible: true,
    gridSpan: 'full',

    render: async (context) => {
        const { state, utils, db } = context;
        const container = utils.createElement('div', { 
            style: { display: 'flex', flexDirection: 'column', gap: '20px' } 
        });
        
        // Check for tracker
        if (!window.app?.ui?.tracker) {
            return utils.createElement('div', { 
                textContent: "Loading psychological profile...",
                style: { color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }
            });
        }
        
        // Generate profile from enhanced engine
        const engine = new PsychEngine(state, window.app.ui.tracker);
        let profile;
        
        try {
            profile = await engine.generateProfile();
        } catch (e) {
            return utils.createElement('div', { 
                textContent: "Need more data to generate profile. Keep logging transactions!",
                style: { color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }
            });
        }

        // Archetype definitions
        const archetypeStyles = {
            guardian: { emoji: '🛡️', color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)', desc: 'Security-focused protector of finances' },
            explorer: { emoji: '🧭', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', desc: 'Adventurous seeker of new experiences' },
            builder: { emoji: '🏗️', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)', desc: 'Long-term wealth architect' },
            harmonizer: { emoji: '⚖️', color: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)', desc: 'Balance between saving and enjoying' },
            optimizer: { emoji: '📊', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', desc: 'Data-driven efficiency maximizer' },
            liberator: { emoji: '🦅', color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #f87171)', desc: 'Freedom and flexibility seeker' }
        };

        // Main grid layout
        const mainGrid = utils.createElement('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px',
                alignItems: 'start'
            }
        });

        // ===== LEFT COLUMN: Archetype + Big Five Radar =====
        const leftColumn = utils.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '15px' }
        });

        // Archetype Card
        const archetypeObj = profile.archetype || {};
        const archetype = typeof archetypeObj === 'string' ? archetypeObj : (archetypeObj.primary || 'explorer');
        const archetypeInfo = archetypeStyles[archetype] || archetypeStyles.explorer;
        
        // Helper to capitalize
        const capitalize = (str) => str && typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : 'Explorer';
        
        const archetypeCard = utils.createElement('div', {
            style: {
                background: archetypeInfo.gradient,
                padding: '25px',
                borderRadius: '16px',
                color: 'white',
                position: 'relative',
                overflow: 'hidden'
            }
        });
        
        archetypeCard.innerHTML = `
            <div style="position:absolute; right:-20px; top:-20px; font-size:8rem; opacity:0.15; transform:rotate(15deg);">${archetypeInfo.emoji}</div>
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; opacity:0.9; margin-bottom:5px;">Your Financial Archetype</div>
            <div style="font-size:2rem; font-weight:800; margin-bottom:5px;">The ${capitalize(archetype)}</div>
            <div style="font-size:0.95rem; opacity:0.9; line-height:1.4;">${archetypeInfo.desc}</div>
            ${archetypeObj.secondary ? `
                <div style="margin-top:15px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.2);">
                    <span style="font-size:0.8rem; opacity:0.8;">Secondary: </span>
                    <span style="font-weight:600;">${archetypeStyles[archetypeObj.secondary]?.emoji || '🎯'} ${capitalize(archetypeObj.secondary)}</span>
                </div>
            ` : ''}
        `;
        leftColumn.appendChild(archetypeCard);

        // Big Five Radar Chart
        const chartContainer = utils.createElement('div', {
            style: {
                background: 'var(--bg-primary)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid var(--border)'
            }
        });
        
        const chartTitle = utils.createElement('div', {
            style: {
                fontSize: '0.85rem',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-secondary)',
                marginBottom: '15px'
            }
        });
        chartTitle.textContent = '🎭 Personality Profile (OCEAN)';
        chartContainer.appendChild(chartTitle);
        
        const chartDiv = utils.createElement('div', {
            style: { position: 'relative', height: '280px', width: '100%' }
        });
        
        const canvas = document.createElement('canvas');
        chartDiv.appendChild(canvas);
        
        // Get OCEAN values with confidence
        const ocean = profile.personality || profile.ocean || {};
        const oceanValues = {
            openness: ocean.openness?.score ?? ocean.openness ?? 50,
            conscientiousness: ocean.conscientiousness?.score ?? ocean.conscientiousness ?? 50,
            extraversion: ocean.extraversion?.score ?? ocean.extraversion ?? 50,
            agreeableness: ocean.agreeableness?.score ?? ocean.agreeableness ?? 50,
            neuroticism: ocean.neuroticism?.score ?? ocean.neuroticism ?? 50
        };
        
        setTimeout(() => {
            if (typeof Chart === 'undefined') return;
            
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createRadialGradient(150, 150, 0, 150, 150, 150);
            gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
            gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');

            new Chart(canvas, {
                type: 'radar',
                data: {
                    labels: ['Openness', 'Conscientiousness', 'Extraversion', 'Agreeableness', 'Neuroticism'],
                    datasets: [{
                        label: 'You',
                        data: Object.values(oceanValues),
                        backgroundColor: gradient,
                        borderColor: '#6366f1',
                        borderWidth: 2,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#6366f1',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(30, 41, 59, 0.9)',
                            padding: 10,
                            cornerRadius: 8,
                            callbacks: {
                                label: (ctx) => `Score: ${Math.round(ctx.raw)}/100`
                            }
                        }
                    },
                    scales: {
                        r: {
                            min: 0,
                            max: 100,
                            ticks: { stepSize: 20, color: 'rgba(0,0,0,0.3)', backdropColor: 'transparent', font: { size: 10 } },
                            grid: { color: 'rgba(0,0,0,0.05)', circular: true },
                            angleLines: { color: 'rgba(0,0,0,0.05)' },
                            pointLabels: { font: { size: 11, weight: '600' }, color: 'var(--text-primary)' }
                        }
                    }
                }
            });
        }, 0);
        
        chartContainer.appendChild(chartDiv);
        leftColumn.appendChild(chartContainer);
        mainGrid.appendChild(leftColumn);

        // ===== RIGHT COLUMN: Money Scripts + Biases + Behaviors =====
        const rightColumn = utils.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '15px' }
        });

        // Money Scripts Section
        const scripts = profile.moneyScripts || profile.scripts || {};
        const scriptDefs = {
            avoidance: { icon: '🙈', name: 'Money Avoidance', desc: 'Tendency to ignore financial matters' },
            worship: { icon: '🙏', name: 'Money Worship', desc: 'Belief that more money solves everything' },
            status: { icon: '💎', name: 'Money Status', desc: 'Self-worth tied to net worth' },
            vigilance: { icon: '🦅', name: 'Money Vigilance', desc: 'Careful monitoring and secrecy' }
        };
        
        const scriptsCard = utils.createElement('div', {
            style: {
                background: 'var(--bg-primary)',
                padding: '15px',
                borderRadius: '12px',
                border: '1px solid var(--border)'
            }
        });
        
        let scriptsHTML = `
            <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">
                💰 Money Scripts
            </div>
        `;
        
        Object.entries(scriptDefs).forEach(([key, def]) => {
            const scriptData = scripts[key] || {};
            const score = typeof scriptData === 'number' ? scriptData : (scriptData.score || 0);
            const barColor = score > 60 ? '#ef4444' : score > 40 ? '#f59e0b' : '#10b981';
            scriptsHTML += `
                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:0.9rem;">${def.icon} ${def.name}</span>
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${Math.round(score)}%</span>
                    </div>
                    <div style="height:6px; background:var(--border); border-radius:3px; overflow:hidden;">
                        <div style="width:${score}%; height:100%; background:${barColor}; border-radius:3px;"></div>
                    </div>
                </div>
            `;
        });
        
        scriptsCard.innerHTML = scriptsHTML;
        rightColumn.appendChild(scriptsCard);

        // Cognitive Biases Section
        const biases = profile.biases || [];
        const biasDefs = {
            mentalAccounting: { icon: '🧮', name: 'Mental Accounting', desc: 'Treating money differently by source' },
            presentBias: { icon: '⏰', name: 'Present Bias', desc: 'Preference for immediate rewards' },
            roundNumberBias: { icon: '🔵', name: 'Round Number Bias', desc: 'Preference for $50, $100, etc.' },
            anchoring: { icon: '⚓', name: 'Anchoring', desc: 'Relying on first price seen' },
            peakEndRule: { icon: '📈', name: 'Peak-End Rule', desc: 'Remembering extremes and recency' }
        };
        
        if (biases.length > 0) {
            const biasesCard = utils.createElement('div', {
                style: {
                    background: 'var(--bg-primary)',
                    padding: '15px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)'
                }
            });
            
            let biasesHTML = `
                <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">
                    🧠 Detected Cognitive Biases
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
            `;
            
            biases.forEach(bias => {
                const def = biasDefs[bias] || { icon: '🧠', name: bias };
                biasesHTML += `
                    <div style="display:flex; align-items:center; gap:6px; padding:8px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; font-size:0.85rem;" title="${def.desc || ''}">
                        <span>${def.icon}</span>
                        <span>${def.name}</span>
                    </div>
                `;
            });
            
            biasesHTML += `</div>`;
            biasesCard.innerHTML = biasesHTML;
            rightColumn.appendChild(biasesCard);
        }

        // Behavioral Indicators Section
        // Map from engine IDs to widget keys
        const behaviorIdMap = {
            midnight_shopper: 'nightOwl',
            weekend_splurger: 'weekendWarrior',
            subscription_creep: 'subscriptionCreep',
            payday_spender: 'paydaySpender',
            micro_transactions: 'microTransactions',
            emotional_spending: 'emotionalSpender'
        };
        
        // Get detected behaviors from indicators
        const indicators = profile.indicators || [];
        const detectedBehaviors = indicators.map(ind => behaviorIdMap[ind.id]).filter(Boolean);
        
        const behaviorDefs = {
            nightOwl: { icon: '🦉', name: 'Night Owl' },
            weekendWarrior: { icon: '🎉', name: 'Weekend Spender' },
            subscriptionCreep: { icon: '📺', name: 'Subscription Creep' },
            paydaySpender: { icon: '💸', name: 'Payday Spender' },
            microTransactions: { icon: '🔢', name: 'Micro Spender' },
            emotionalSpender: { icon: '💔', name: 'Emotional Spender' }
        };
        
        const behaviorsCard = utils.createElement('div', {
            style: {
                background: 'var(--bg-primary)',
                padding: '15px',
                borderRadius: '12px',
                border: '1px solid var(--border)'
            }
        });
        
        let behaviorsHTML = `
            <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">
                🎭 Behavioral Patterns
            </div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
        `;
        
        Object.entries(behaviorDefs).forEach(([key, def]) => {
            const isActive = detectedBehaviors.includes(key);
            behaviorsHTML += `
                <div style="text-align:center; padding:10px; background:${isActive ? 'var(--accent-light)' : 'var(--bg-secondary)'}; border:1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}; border-radius:10px; opacity:${isActive ? '1' : '0.5'};">
                    <div style="font-size:1.3rem;">${def.icon}</div>
                    <div style="font-size:0.7rem; color:${isActive ? 'var(--accent)' : 'var(--text-secondary)'}; margin-top:4px;">${def.name}</div>
                </div>
            `;
        });
        
        behaviorsHTML += `</div>`;
        behaviorsCard.innerHTML = behaviorsHTML;
        rightColumn.appendChild(behaviorsCard);

        mainGrid.appendChild(rightColumn);
        container.appendChild(mainGrid);

        // ===== INSIGHTS SECTION =====
        const insights = profile.insights || [];
        if (insights.length > 0) {
            const insightsSection = utils.createElement('div', {
                style: {
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.02) 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)'
                }
            });
            
            const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
            const priorityBgs = { high: '#fef2f2', medium: '#fffbeb', low: '#f0fdf4' };
            
            let insightsHTML = `
                <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:15px;">
                    💡 Personalized Insights
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
            `;
            
            insights.slice(0, 4).forEach(insight => {
                const color = priorityColors[insight.priority] || priorityColors.medium;
                const bg = priorityBgs[insight.priority] || priorityBgs.medium;
                insightsHTML += `
                    <div style="display:flex; align-items:flex-start; gap:12px; padding:12px; background:${bg}; border-radius:10px; border-left:3px solid ${color};">
                        <div style="font-size:1.2rem;">${insight.icon || '💡'}</div>
                        <div>
                            <div style="font-size:0.9rem; color:var(--text-primary); line-height:1.4;">${insight.message || insight.text || 'No details available'}</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-top:4px;">${insight.type || insight.category || 'General'}</div>
                        </div>
                    </div>
                `;
            });
            
            insightsHTML += `</div>`;
            insightsSection.innerHTML = insightsHTML;
            container.appendChild(insightsSection);
        }

        return container;
    }
};
