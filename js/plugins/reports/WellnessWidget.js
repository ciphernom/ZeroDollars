/**
 * WellnessWidget v2.0
 * Displays financial wellness score with 6 dimensions
 * Integrates with enhanced PsychEngine
 */

import { PsychEngine } from '../../services/psych-engine.js';

export const WellnessWidget = {
    id: 'widget-wellness',
    type: 'report-widget',
    order: -3,
    title: '💫 Financial Wellness',
    collapsible: true,
    gridSpan: 'full',

    render: async (context) => {
        // Handle both full context and state-only context
        const state = context.state || context;
        const container = document.createElement('div');
        container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

        // Check for tracker
        if (!window.app?.ui?.tracker) {
            const msg = document.createElement('div');
            msg.textContent = "Calculating wellness score...";
            msg.style.cssText = 'color:var(--text-secondary); padding:20px; text-align:center;';
            return msg;
        }

        // Generate profile
        const engine = new PsychEngine(state, window.app.ui.tracker);
        let profile;

        try {
            profile = await engine.generateProfile();
        } catch (e) {
            const msg = document.createElement('div');
            msg.textContent = "Need more data to calculate wellness. Keep using the app!";
            msg.style.cssText = 'color:var(--text-secondary); padding:20px; text-align:center;';
            return msg;
        }

        const wellness = profile.wellness || {};
        const overallScore = wellness.overall || 50;
        const dimensions = wellness.dimensions || {};

        // Score color based on value
        const getScoreColor = (score) => {
            if (score >= 80) return '#10b981';
            if (score >= 60) return '#6366f1';
            if (score >= 40) return '#f59e0b';
            return '#ef4444';
        };

        const getScoreLabel = (score) => {
            if (score >= 80) return { text: 'Excellent', emoji: '🌟' };
            if (score >= 60) return { text: 'Good', emoji: '👍' };
            if (score >= 40) return { text: 'Fair', emoji: '📈' };
            return { text: 'Needs Work', emoji: '💪' };
        };

        const scoreColor = getScoreColor(overallScore);
        const scoreLabel = getScoreLabel(overallScore);

        // Main layout: Score ring + Summary
        const topSection = document.createElement('div');
        topSection.style.cssText = `display:flex; gap:30px; align-items:center; flex-wrap:wrap; padding:20px; background:linear-gradient(135deg, ${scoreColor}10 0%, ${scoreColor}05 100%); border-radius:16px; border:1px solid ${scoreColor}30;`;

        // Score Ring (SVG)
        const circumference = 2 * Math.PI * 54;
        const dashOffset = circumference - (overallScore / 100) * circumference;

        const ringContainer = document.createElement('div');
        ringContainer.style.cssText = 'width:140px; height:140px; position:relative; flex-shrink:0;';
        ringContainer.innerHTML = `
            <svg viewBox="0 0 120 120" style="width:100%; height:100%; transform:rotate(-90deg);">
                <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" stroke-width="10"/>
                <circle cx="60" cy="60" r="54" fill="none" stroke="${scoreColor}" stroke-width="10" 
                    stroke-linecap="round"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${dashOffset}"
                    style="transition: stroke-dashoffset 1s ease;"/>
            </svg>
            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center;">
                <div style="font-size:2.2rem; font-weight:800; color:${scoreColor}; line-height:1;">${Math.round(overallScore)}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Score</div>
            </div>
        `;
        topSection.appendChild(ringContainer);

        // Summary text
        const getSummaryText = (score) => {
            if (score >= 80) return "Excellent work! Your financial habits are strong and sustainable. Keep it up!";
            if (score >= 60) return "You're doing well! A few small improvements could push you into excellent territory.";
            if (score >= 40) return "There's room for growth. Focus on the weaker areas below to improve your score.";
            return "Let's build better habits together. Small consistent changes lead to big improvements.";
        };

        const summarySection = document.createElement('div');
        summarySection.style.cssText = 'flex:1; min-width:200px;';
        summarySection.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <span style="font-size:1.8rem;">${scoreLabel.emoji}</span>
                <span style="font-size:1.4rem; font-weight:700; color:${scoreColor};">${scoreLabel.text}</span>
            </div>
            <p style="margin:0; font-size:0.95rem; color:var(--text-secondary); line-height:1.5;">${getSummaryText(overallScore)}</p>
            <div style="margin-top:10px; font-size:0.8rem; color:var(--text-secondary);">
                📊 Based on ${profile.dataPoints || 0} transactions analyzed
            </div>
        `;
        topSection.appendChild(summarySection);
        container.appendChild(topSection);

        // Dimensions Grid
        const dimensionDefs = {
            spendingControl: { name: 'Spending Control', icon: '🎯', desc: 'Staying within budget limits', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
            savingConsistency: { name: 'Saving Consistency', icon: '💰', desc: 'Regular savings contributions', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
            debtManagement: { name: 'Debt Management', icon: '📉', desc: 'Credit usage and payoffs', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)' },
            emergencyReadiness: { name: 'Emergency Fund', icon: '🛡️', desc: 'Safety net preparation', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)' },
            goalProgress: { name: 'Goal Progress', icon: '🎯', desc: 'Advancing toward goals', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
            budgetAdherence: { name: 'Budget Adherence', icon: '📊', desc: 'Overall budget compliance', gradient: 'linear-gradient(135deg, #14b8a6, #5eead4)' }
        };

        const dimensionsGrid = document.createElement('div');
        dimensionsGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px;';

        Object.entries(dimensionDefs).forEach(([key, def]) => {
            const score = dimensions[key] || 50;
            const color = getScoreColor(score);

            const card = document.createElement('div');
            card.style.cssText = 'background:var(--bg-primary); padding:15px; border-radius:12px; border:1px solid var(--border); transition:transform 0.2s, box-shadow 0.2s; cursor:default;';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:1.3rem;">${def.icon}</span>
                    <span style="font-size:1.1rem; font-weight:700; color:${color};">${Math.round(score)}</span>
                </div>
                <div style="height:6px; background:var(--border); border-radius:3px; overflow:hidden; margin-bottom:8px;">
                    <div style="width:${score}%; height:100%; background:${def.gradient}; border-radius:3px; transition:width 0.8s ease;"></div>
                </div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-primary); margin-bottom:2px;">${def.name}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary);">${def.desc}</div>
            `;

            card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = 'var(--shadow)'; });
            card.addEventListener('mouseleave', () => { card.style.transform = 'none'; card.style.boxShadow = 'none'; });

            dimensionsGrid.appendChild(card);
        });

        container.appendChild(dimensionsGrid);

        // Recommendations based on lowest dimensions
        const sortedDimensions = Object.entries(dimensions).sort((a, b) => a[1] - b[1]).slice(0, 2);

        if (sortedDimensions.length > 0 && sortedDimensions[0][1] < 70) {
            const recommendations = {
                spendingControl: "Try setting stricter category limits and reviewing them weekly.",
                savingConsistency: "Automate a small weekly transfer to your savings jar.",
                debtManagement: "Focus on paying down highest-interest balances first.",
                emergencyReadiness: "Aim to build 3-6 months of expenses as a safety buffer.",
                goalProgress: "Break big goals into smaller milestones for steady progress.",
                budgetAdherence: "Review your budget at the start of each week to stay on track."
            };

            const recsSection = document.createElement('div');
            recsSection.style.cssText = 'background:var(--bg-primary); padding:15px; border-radius:12px; border:1px solid var(--border);';

            let recsHTML = `<div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:12px;">🎯 Areas to Focus On</div>`;

            sortedDimensions.forEach(([key, score]) => {
                if (score < 70 && dimensionDefs[key]) {
                    const def = dimensionDefs[key];
                    recsHTML += `
                        <div style="display:flex; align-items:flex-start; gap:12px; padding:12px; background:var(--bg-secondary); border-radius:10px; margin-bottom:8px;">
                            <div style="font-size:1.5rem;">${def.icon}</div>
                            <div>
                                <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">${def.name} (${Math.round(score)})</div>
                                <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">${recommendations[key] || 'Keep working on improving this area.'}</div>
                            </div>
                        </div>
                    `;
                }
            });

            recsSection.innerHTML = recsHTML;
            container.appendChild(recsSection);
        }

        return container;
    }
};
