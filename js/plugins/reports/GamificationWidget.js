/**
 * Enhanced GamificationWidget v2.0
 * Displays XP, achievements, challenges, skills, and streaks
 * Integrates with enhanced GamificationEngine
 */

export const GamificationWidget = {
    id: 'widget-gamification',
    type: 'report-widget',
    order: -5, // Top priority
    title: '🏆 Your Legacy',
    collapsible: false,
    gridSpan: 'full',

    render: async (context) => {
        const { db, utils } = context;
        const container = utils.createElement('div', { 
            style: { display: 'flex', flexDirection: 'column', gap: '20px' } 
        });
        
        // Get stats from enhanced engine
        const stats = await db.get('gamification', 'player_stats') || { 
            level: 1, xp: 0, streak: 0, prestige: 0,
            titles: ['Novice Saver'],
            skills: {},
            totalStats: { transactionsLogged: 0, goalsCompleted: 0, daysActive: 0 },
            personalBests: { longestStreak: 0 }
        };
        
        const achievementsData = await db.get('gamification', 'achievements') || { unlocked: [], progress: {} };
        const challenges = await db.get('gamification', 'challenges') || { daily: [], weekly: [], monthly: [] };
        
        // Count unlocked achievements (handle both old string format and new object format)
        const unlockedCount = Array.isArray(achievementsData.unlocked) ? achievementsData.unlocked.length : 0;
        
        // Calculate XP progress
        const reqXp = Math.floor(100 * Math.pow(stats.level, 1.5));
        const currentLevelXp = stats.xp % reqXp;
        const pct = Math.min(100, (currentLevelXp / reqXp) * 100);
        
        // Title progression
        const titles = [
            'Novice Saver', 'Budget Apprentice', 'Penny Pincher', 'Thrifty Tracker',
            'Money Manager', 'Savings Specialist', 'Finance Guru', 'Wealth Wizard',
            'Portfolio Pro', 'Financial Master', 'Budget Legend', 'Elder God of Finance'
        ];
        const currentTitle = titles[Math.min(Math.floor(stats.level / 10), titles.length - 1)];
        const prestigeStars = stats.prestige > 0 ? '⭐'.repeat(stats.prestige) : '';

        // ===== TOP ROW: Level + XP + Streak =====
        const topRow = utils.createElement('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: '20px',
                alignItems: 'center',
                padding: '15px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
                borderRadius: '16px',
                border: '1px solid var(--border)'
            }
        });
        
        // Level badge
        const levelBadge = utils.createElement('div', {
            style: {
                width: '60px',
                height: '60px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
            }
        });
        levelBadge.innerHTML = `
            <span style="font-size:0.65rem; opacity:0.8;">LVL</span>
            <span style="font-size:1.6rem; line-height:1;">${stats.level}</span>
        `;
        topRow.appendChild(levelBadge);
        
        // XP bar section
        const xpSection = utils.createElement('div');
        xpSection.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.95rem; margin-bottom:6px;">
                <strong>${currentTitle} ${prestigeStars}</strong>
                <span style="color:var(--text-secondary); font-size:0.85rem;">${Math.floor(currentLevelXp).toLocaleString()} / ${reqXp.toLocaleString()} XP</span>
            </div>
            <div style="height:10px; background:var(--border); border-radius:5px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #f59e0b, #fbbf24); transition:width 0.5s ease; border-radius:5px;"></div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">
                Total XP: ${stats.xp.toLocaleString()} • ${reqXp - Math.floor(currentLevelXp)} to next level
            </div>
        `;
        topRow.appendChild(xpSection);
        
        // Streak section
        const streakSection = utils.createElement('div', {
            style: { textAlign: 'center', padding: '0 10px' }
        });
        const streakActive = stats.streak > 0;
        streakSection.innerHTML = `
            <div style="font-size:2rem; filter:${streakActive ? 'none' : 'grayscale(1)'}">🔥</div>
            <div style="font-size:1.2rem; font-weight:bold; color:${streakActive ? '#ef4444' : 'var(--text-secondary)'}">${stats.streak}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary)">Day Streak</div>
            ${stats.personalBests?.longestStreak > stats.streak ? 
                `<div style="font-size:0.65rem; color:var(--text-secondary); margin-top:2px;">Best: ${stats.personalBests.longestStreak}</div>` : ''}
        `;
        topRow.appendChild(streakSection);
        
        container.appendChild(topRow);

        // ===== STATS ROW =====
        const statsRow = utils.createElement('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '10px'
            }
        });
        
        const statItems = [
            { value: stats.totalStats?.transactionsLogged || 0, label: 'Transactions', icon: '📝' },
            { value: unlockedCount, label: 'Achievements', icon: '🏅' },
            { value: stats.totalStats?.goalsCompleted || 0, label: 'Goals Met', icon: '🎯' },
            { value: stats.totalStats?.daysActive || 0, label: 'Days Active', icon: '📅' }
        ];
        
        statItems.forEach(stat => {
            const card = utils.createElement('div', {
                style: {
                    background: 'var(--bg-primary)',
                    padding: '12px',
                    borderRadius: '10px',
                    textAlign: 'center',
                    border: '1px solid var(--border)'
                }
            });
            card.innerHTML = `
                <div style="font-size:1.3rem; margin-bottom:2px;">${stat.icon}</div>
                <div style="font-size:1.4rem; font-weight:700; color:var(--accent);">${stat.value.toLocaleString()}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">${stat.label}</div>
            `;
            statsRow.appendChild(card);
        });
        
        container.appendChild(statsRow);

        // ===== CHALLENGES SECTION =====
        const challengesSection = utils.createElement('div', {
            style: {
                background: 'var(--bg-primary)',
                padding: '15px',
                borderRadius: '12px',
                border: '1px solid var(--border)'
            }
        });
        
        const allChallenges = [
            ...(challenges.daily || []).map(c => ({ ...c, type: 'Daily' })),
            ...(challenges.weekly || []).map(c => ({ ...c, type: 'Weekly' })),
            ...(challenges.monthly || []).map(c => ({ ...c, type: 'Monthly' }))
        ].slice(0, 4);
        
        let challengesHTML = `
            <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">
                📋 Active Challenges
            </div>
        `;
        
        if (allChallenges.length === 0) {
            challengesHTML += `<div style="color:var(--text-secondary); font-size:0.9rem;">No active challenges</div>`;
        } else {
            challengesHTML += `<div style="display:flex; flex-direction:column; gap:10px;">`;
            allChallenges.forEach(ch => {
                const progress = Math.min(100, ((ch.progress || 0) / ch.target) * 100);
                const isComplete = ch.completed;
                challengesHTML += `
                    <div style="display:flex; align-items:center; gap:12px; padding:10px; background:${isComplete ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)'}; border-radius:8px; border:1px solid ${isComplete ? '#10b981' : 'var(--border)'};">
                        <div style="font-size:1.2rem;">${isComplete ? '✅' : '⏳'}</div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.85rem; font-weight:600; display:flex; justify-content:space-between;">
                                <span>${ch.name}</span>
                                <span style="color:#f59e0b; font-size:0.8rem;">+${ch.xp} XP</span>
                            </div>
                            <div style="height:4px; background:var(--border); border-radius:2px; margin-top:4px; overflow:hidden;">
                                <div style="width:${progress}%; height:100%; background:${isComplete ? '#10b981' : 'var(--accent)'}; border-radius:2px;"></div>
                            </div>
                        </div>
                        <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">${ch.type}</div>
                    </div>
                `;
            });
            challengesHTML += `</div>`;
        }
        
        challengesSection.innerHTML = challengesHTML;
        container.appendChild(challengesSection);

        // ===== SKILLS ROW =====
        const skills = stats.skills || {};
        const skillDefs = [
            { id: 'budgeting', name: 'Budgeting', icon: '📊', color: '#10b981' },
            { id: 'saving', name: 'Saving', icon: '💰', color: '#f59e0b' },
            { id: 'tracking', name: 'Tracking', icon: '📝', color: '#6366f1' },
            { id: 'planning', name: 'Planning', icon: '🎯', color: '#ec4899' },
            { id: 'consistency', name: 'Consistency', icon: '🔥', color: '#ef4444' }
        ];
        
        const skillsRow = utils.createElement('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px'
            }
        });
        
        skillDefs.forEach(skill => {
            const skillData = skills[skill.id] || { level: 0, xp: 0 };
            const level = skillData.level || 0;
            const xpInLevel = skillData.xp || 0;
            const xpPerLevel = 100; // XP needed per skill level
            const progress = (xpInLevel / xpPerLevel) * 100;
            
            const skillCard = utils.createElement('div', {
                style: {
                    background: 'var(--bg-primary)',
                    padding: '10px',
                    borderRadius: '10px',
                    textAlign: 'center',
                    border: '1px solid var(--border)'
                }
            });
            skillCard.innerHTML = `
                <div style="font-size:1.2rem;">${skill.icon}</div>
                <div style="font-size:0.95rem; font-weight:700; color:${skill.color};">Lv.${level}</div>
                <div style="height:3px; background:var(--border); border-radius:2px; margin:4px 0; overflow:hidden;">
                    <div style="width:${progress}%; height:100%; background:${skill.color};"></div>
                </div>
                <div style="font-size:0.65rem; color:var(--text-secondary);">${skill.name}</div>
            `;
            skillsRow.appendChild(skillCard);
        });
        
        container.appendChild(skillsRow);

        // ===== RECENT ACHIEVEMENTS =====
        const unlockedAchievements = (achievementsData.unlocked || [])
            .filter(a => typeof a === 'object' && a.id) // Filter valid achievement objects
            .sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0))
            .slice(0, 5);
        
        if (unlockedAchievements.length > 0) {
            const achievementsSection = utils.createElement('div', {
                style: {
                    background: 'var(--bg-primary)',
                    padding: '15px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)'
                }
            });
            
            const rarityColors = {
                common: { bg: '#e2e8f0', border: '#94a3b8' },
                epic: { bg: '#ddd6fe', border: '#7c3aed' },
                legendary: { bg: '#fef3c7', border: '#d97706' },
                mythic: { bg: '#fce7f3', border: '#db2777' }
            };
            
            let achievementsHTML = `
                <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">
                    🏅 Recent Achievements
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
            `;
            
            unlockedAchievements.forEach(ach => {
                const colors = rarityColors[ach.rarity] || rarityColors.common;
                achievementsHTML += `
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:${colors.bg}; border:1px solid ${colors.border}; border-radius:20px; font-size:0.85rem;">
                        <span>${ach.icon || '🏆'}</span>
                        <span style="font-weight:600;">${ach.name}</span>
                    </div>
                `;
            });
            
            achievementsHTML += `</div>`;
            achievementsSection.innerHTML = achievementsHTML;
            container.appendChild(achievementsSection);
        }

        return container;
    }
};
