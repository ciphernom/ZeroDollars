/* js/ui/views/ReportsView.js */
import { BaseView } from './BaseView.js';
import { Utils } from '../../utils/index.js';

// 1. Import the Legacy Plugin Objects directly
import { NetWorthWidget } from '../../plugins/reports/NetWorthWidget.js';
import { AgeOfMoneyWidget } from '../../plugins/reports/AgeOfMoneyWidget.js';
import { InsightsWidget } from '../../plugins/reports/InsightsWidget.js';
import { SpendingBarWidget } from '../../plugins/reports/SpendingPieWidget.js';
import { ForecastWidget } from '../../plugins/reports/ForecastWidget.js';
import { PerformanceTableWidget } from '../../plugins/reports/PerformanceTableWidget.js';
import { SpendingTrendWidget } from '../../plugins/reports/SpendingTrendWidget.js';
import { CashflowWidget } from '../../plugins/reports/CashflowWidget.js';
import { BehavioralWidget } from '../../plugins/reports/BehavioralWidget.js';
import { GamificationWidget } from '../../plugins/reports/GamificationWidget.js';
import { PersonalityWidget } from '../../plugins/reports/PersonalityWidget.js';
import { WellnessWidget } from '../../plugins/reports/WellnessWidget.js';

export class ReportsView extends BaseView {
    constructor() {
        super('reports-tab');
        
        // Unified Grid Container
        this.grid = document.createElement('div');
        this.grid.className = 'reports-grid';
        // Add default styles here, or rely on CSS
        this.grid.style.display = 'grid';
        this.grid.style.gap = '15px';
        // Auto-fit columns (min 300px), allowing rows to be filled implicitly
        this.grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
        
        this.root.appendChild(this.grid);
        // 2. REGISTER LEGACY PLUGINS
        // We must register these with the system so they are available via getUIWithMeta
        this._registerLegacyPlugins(); 
    }
    _registerLegacyPlugins() {
            const legacyWidgets = [
                GamificationWidget,
                NetWorthWidget, 
                WellnessWidget, 
                AgeOfMoneyWidget,
                BehavioralWidget,
                PersonalityWidget, 
                InsightsWidget, 
                SpendingBarWidget, 
                ForecastWidget, 
                PerformanceTableWidget, 
                SpendingTrendWidget, 
                CashflowWidget
            ];

            // Ensure app.plugins exists (it is created in main.js)
            if (window.app && window.app.plugins) {
                legacyWidgets.forEach(widget => {
                    // Use the adapter you wrote in PluginSystem.js
                    window.app.plugins.registerInternal(widget.id, widget);
                });
            }
        }
    async render(state) { // [FIX] Added async
        if (!this.isVisible) return;    

        this.grid.innerHTML = '';
        
        // FETCH using the new system
        const components = window.app.plugins.getUIWithMeta('reports_grid', { state });

        // SORT
        components.sort((a, b) => (a.meta?.order || 99) - (b.meta?.order || 99));

        // [FIX] RENDER LOOP - Handle Promises
        for (const comp of components) {
            try {
                // If the widget returned a Promise (async render), wait for it
                let content = comp.element;
                if (content instanceof Promise) {
                    content = await content;
                }
                
                if (!content || !(content instanceof Node)) continue;

                // Create Wrapper Card
                const card = Utils.createElement('div', { 
                    className: 'account-card', 
                    dataset: { pluginId: comp.id }
                });

                // Handle Grid Span
                if (comp.meta?.gridSpan) {
                    if (comp.meta.gridSpan === 'full') {
                        card.style.gridColumn = '1 / -1';
                    } else {
                        card.style.gridColumn = `span ${comp.meta.gridSpan}`;
                    }
                }

                // Construct Header
                if (comp.meta?.title) {
                    const header = Utils.createElement('div', { className: 'widget-header' });
                    const title = Utils.createElement('h3', { textContent: comp.meta.title });
                    const actions = Utils.createElement('div', { className: 'widget-actions' });

                    // Maximize Button
                    const maxBtn = Utils.createElement('button', { 
                        className: 'widget-btn btn-maximize', 
                        textContent: '⤢', 
                        title: 'Fullscreen'
                    });
                    maxBtn.onclick = (e) => {
                        e.stopPropagation();
                        const isMax = card.classList.toggle('fullscreen');
                        maxBtn.textContent = isMax ? '✕' : '⤢';
                    };
                    actions.appendChild(maxBtn);

                    // Minimize Button
                    if (comp.meta.collapsible) {
                        const toggleBtn = Utils.createElement('button', { 
                            className: 'widget-btn btn-collapse', 
                            textContent: '▼',
                            title: 'Minimize'
                        });
                        const isCollapsed = localStorage.getItem(`widget_collapsed_${comp.id}`) === 'true';
                        if (isCollapsed) card.classList.add('collapsed');

                        toggleBtn.onclick = (e) => {
                            e.stopPropagation();
                            if (card.classList.contains('fullscreen')) return;
                            card.classList.toggle('collapsed');
                            localStorage.setItem(`widget_collapsed_${comp.id}`, card.classList.contains('collapsed'));
                        };
                        actions.appendChild(toggleBtn);
                    }

                    header.appendChild(title);
                    header.appendChild(actions);
                    card.appendChild(header);
                }

                const contentWrapper = Utils.createElement('div', { className: 'widget-content' });
                contentWrapper.appendChild(content);
                card.appendChild(contentWrapper);
                this.grid.appendChild(card);

            } catch (e) {
                console.error(`Error rendering widget ${comp.id}:`, e);
            }
        }
    }
}
