import { BaseView } from './BaseView.js';
import { Utils } from '../../utils/index.js';
import { ScheduledTransaction } from '../../models/transaction.js';

/**
 * BudgetView
 * Manages the main "Budget" tab where users see their Jars (Envelopes).
 * Supports two distinct display modes: 
 * 1. Card View (Grid) - optimized for visual overview and drag-and-drop organization.
 * 2. List View (Table) - optimized for density and sorting data.
 */
export class BudgetView extends BaseView {
    constructor(callbacks) {
        // Initialize the base view with the ID of the main container section
        super('budget-tab');
        
        this.listContainer = document.getElementById('envelopes-list');
        this.callbacks = callbacks;
        
        // Track the element being dragged for reordering
        this.dragTarget = null;
        
        // Initialize sorting state for List View (default: Alphabetical)
        this.sortState = {
            field: 'name', // Options: 'name', 'goal', 'balance'
            direction: 'asc' // Options: 'asc', 'desc'
        };

        // Load user preference for view mode (persist across reloads)
        this.viewMode = localStorage.getItem('zerodollars_budget_view') || 'cards';

        // Bind search input listener globally for this view
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.render(window.app.state));
        }

        // Bind drag handlers to the instance to preserve 'this' context
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
    }

    /**
     * Toggles the sorting field and direction.
     * If clicking the same field, flips direction. If new field, defaults to Ascending.
     * @param {string} field - The data key to sort by.
     */
    toggleSort(field) {
        if (this.sortState.field === field) {
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.field = field;
            this.sortState.direction = 'asc';
        }
        // Re-render immediately to reflect order change
        this.render(window.app.state);
    }

    /**
     * Main Render Loop
     * Filters, Sorts, and Delegates rendering to specific sub-methods (List vs Card).
     */
    render(state) {
        if (!this.listContainer) return;
        
        // Ensure the toggle button exists in the DOM (in case header was re-rendered externally)
        this._ensureToggleButton();

        let envelopes = Array.from(state.data.envelopes.values());
        const currentMonth = state.data.currentMonth;
        const query = document.getElementById('search-input')?.value.toLowerCase() || '';

        // 1. Filter: Remove deleted jars and apply search query
        let filtered = envelopes.filter(env => 
            !env.deleted && env.name.toLowerCase().includes(query)
        );

        // 2. Sort: Apply the current sort state logic
        filtered.sort((a, b) => {
            const dir = this.sortState.direction === 'asc' ? 1 : -1;

            switch (this.sortState.field) {
                case 'balance':
                    return (a.balance - b.balance) * dir;
                case 'goal':
                    // Sort by goal amount (treat 0/null as 0)
                    return ((a.goalAmount || 0) - (b.goalAmount || 0)) * dir;
                case 'name':
                default:
                    return a.name.localeCompare(b.name) * dir;
            }
        });

        // Clear container
        this.listContainer.innerHTML = '';

        // Handle Empty State
        if (filtered.length === 0) {
            this._renderEmptyState();
            return;
        }

        // 3. Render based on active mode
        if (this.viewMode === 'list') {
            this.listContainer.classList.add('list-mode');
            this.listContainer.classList.remove('cards-mode');
            this._renderList(filtered, currentMonth, state);
        } else {
            this.listContainer.classList.remove('list-mode');
            this.listContainer.classList.add('cards-mode');
            this._renderCards(filtered, currentMonth, state);
        }
    }

    /**
     * Injects the Grid/List toggle button into the UI header if missing.
     */
    _ensureToggleButton() {
        const controlsContainer = document.getElementById('smart-fund-btn')?.parentNode;
        // Check if button already exists to prevent duplicates
        if (controlsContainer && !document.getElementById('view-toggle-btn')) {
            const btn = Utils.createElement('button', {
                id: 'view-toggle-btn',
                className: 'view-toggle-btn btn-secondary',
                title: 'Switch View',
                // Icon changes based on current mode
                textContent: this.viewMode === 'list' ? '▦' : '☰', 
                style: { width: '40px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                onclick: () => this.toggleViewMode()
            });
            // Insert before the Smart Fund button
            controlsContainer.insertBefore(btn, controlsContainer.firstChild);
        }
    }

    /**
     * Switches between List and Card view and saves preference.
     */
    toggleViewMode() {
        this.viewMode = this.viewMode === 'list' ? 'cards' : 'list';
        localStorage.setItem('zerodollars_budget_view', this.viewMode);
        
        // Update button icon immediately
        const btn = document.getElementById('view-toggle-btn');
        if(btn) btn.textContent = this.viewMode === 'list' ? '▦' : '☰';
        
        this.render(window.app.state);
    }

    _renderEmptyState() {
        const container = Utils.createElement('div', { 
            style: { textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' } 
        });
        container.appendChild(Utils.createElement('p', { textContent: "No jars found." }));
        
        const btn = Utils.createElement('button', { 
            className: 'btn-primary', 
            textContent: '📂 Create Default Jars',
            style: { marginTop: '10px', width: 'auto', display: 'inline-flex' },
            onclick: () => this.callbacks.onCreateDefaults()
        });
        container.appendChild(btn);
        this.listContainer.appendChild(container);
    }

    // =========================================================
    // LIST VIEW RENDERER (Sortable Table)
    // =========================================================
    _renderList(envelopes, currentMonth, state) {
        const tableContainer = Utils.createElement('div', { className: 'budget-list-container' });

        /**
         * Helper to create interactive header cells.
         * Adds 'asc' or 'desc' classes for CSS arrows.
         */
        const createHeader = (text, field, style = {}) => {
            const className = this.sortState.field === field ? this.sortState.direction : '';
            return Utils.createElement('div', { 
                textContent: text, 
                className: className, // Used by CSS to show ↑ or ↓
                style: style,
                onclick: () => this.toggleSort(field)
            });
        };

        // Construct Header Row
        const header = Utils.createElement('div', { className: 'budget-row budget-row-header' }, [
            createHeader('Jar Name', 'name'),
            createHeader('Target / Goal', 'goal'),
            createHeader('Balance', 'balance', { textAlign: 'right' }),
            Utils.createElement('div', { textContent: '', style: {textAlign: 'right', cursor: 'default'} }) // Actions column is not sortable
        ]);
        tableContainer.appendChild(header);

        // Construct Data Rows
        envelopes.forEach(env => {
            const balanceClass = env.balance < 0 ? 'negative' : '';
            
            // Format Goal Text based on Goal Type
            let budgetText = '-';
            if (env.goalType === 'monthly') {
                const budgeted = env.budgets[currentMonth] || 0;
                budgetText = `Funded: ${Utils.formatCurrency(budgeted)} / ${Utils.formatCurrency(env.goalAmount)}`;
            } else if (env.goalType === 'target') {
                budgetText = `Goal: ${Utils.formatCurrency(env.goalAmount)}`;
            }

            // Check for Machine Learning Anomalies (Overspending compared to history)
            const insights = state.data.forecastInsights?.[currentMonth];
            const ci = insights?.confidenceIntervals?.[env.id];
            const isAnomaly = ci && (insights.observed[env.id] || 0) > ci.upper;

            const row = Utils.createElement('div', { 
                className: 'budget-row',
                dataset: { id: env.id }
            });

            // Column 1: Name + Alert
            const nameCol = Utils.createElement('div');
            nameCol.appendChild(Utils.createElement('div', { className: 'budget-name', textContent: env.name }));
            if (isAnomaly) {
                nameCol.appendChild(Utils.createElement('div', { 
                    textContent: '⚠️ Unusual Spending', 
                    style: { fontSize: '0.7rem', color: 'var(--danger)' } 
                }));
            }

            // Column 2: Meta info
            const metaCol = Utils.createElement('div', { className: 'budget-meta-cell' }, [
                Utils.createElement('span', { textContent: budgetText, style: { fontSize: '0.85rem' } })
            ]);

            // Column 3: Balance
            const balanceCol = Utils.createElement('div', { 
                className: `budget-balance ${balanceClass}`, 
                textContent: Utils.formatCurrency(env.balance),
                style: { fontWeight: 'bold', textAlign: 'right' }
            });

            // Column 4: Actions (Compact buttons for table view)
            const actionsCol = Utils.createElement('div', { className: 'budget-actions-cell' });
            
            actionsCol.appendChild(Utils.createElement('button', { 
                className: 'btn-secondary', textContent: '+', title: 'Add Funds', 
                onclick: (e) => this.callbacks.onAddFunds(e, env.id) 
            }));

            if (env.type === 'cc_payment') {
                actionsCol.appendChild(Utils.createElement('button', { 
                    className: 'btn-primary', textContent: 'Pay', title: 'Pay Card Bill', 
                    onclick: (e) => this.callbacks.onPayCard(e, env.id) 
                }));
            } else {
                actionsCol.appendChild(Utils.createElement('button', { 
                    className: 'btn-secondary', textContent: '-', title: 'Log Spend', 
                    onclick: (e) => this.callbacks.onSpend(e, env.id) 
                }));
            }

            actionsCol.appendChild(Utils.createElement('button', { 
                className: 'btn-secondary', textContent: '✎', title: 'Edit', 
                onclick: (e) => this.callbacks.onEdit(e, env.id) 
            }));
            actionsCol.appendChild(Utils.createElement('button', { 
                className: 'btn-secondary', textContent: '🕒', title: 'History', 
                onclick: (e) => this.callbacks.onHistory(e, env.id) 
            }));

            row.append(nameCol, metaCol, balanceCol, actionsCol);
            tableContainer.appendChild(row);
        });

        this.listContainer.appendChild(tableContainer);
    }

    // =========================================================
    // CARD VIEW RENDERER (With Drag Handles)
    // =========================================================
    _renderCards(envelopes, currentMonth, state) {
        const fragment = document.createDocumentFragment();
        envelopes.forEach(env => {
            fragment.appendChild(this._createEnvelopeCard(env, currentMonth, state));
        });
        this.listContainer.appendChild(fragment);
    }

    _createEnvelopeCard(env, currentMonth, state) {
        const balanceClass = env.balance < 0 ? 'negative' : '';
        
        // Calculate "Runway" or forecast
        const forecast = env.getForecast();
        
        // 1. Goal Progress Visuals
        const goalData = env.getGoalProgress(currentMonth);
        let goalHtml = null;
        if (goalData) {
            goalHtml = Utils.createElement('div', { className: 'progress-bar-container', style: { marginBottom: '10px' } }, [
                Utils.createElement('div', { className: 'progress-bar', style: { width: `${goalData.progress}%` } }),
                Utils.createElement('div', { className: 'goal-meta', textContent: goalData.targetText })
            ]);
        }

        // 2. Budget Text Logic
        let budgetDisplay = env.budgets[currentMonth] || 0;
        let budgetLabel = 'Budgeted';
        if (env.goalType === 'monthly' && env.goalAmount > 0) {
            budgetDisplay = env.goalAmount;
            budgetLabel = 'Goal';
        } else if (env.goalType === 'target' && env.goalAmount > 0) {
            budgetLabel = 'Target';
            budgetDisplay = env.goalAmount;
        }
        const budgetText = `${budgetLabel}: ${Utils.formatCurrency(budgetDisplay)}`;

        // 3. Anomaly Detection Visuals
        let anomalyEl = null;
        const insights = state.data.forecastInsights?.[currentMonth];
        if (insights?.confidenceIntervals?.[env.id]) {
            const ci = insights.confidenceIntervals[env.id];
            const observed = insights.observed[env.id] || 0;
            if (observed > ci.upper) {
                anomalyEl = Utils.createElement('div', {
                    className: 'forecast',
                    style: { color: 'var(--danger)', fontWeight: 'bold', marginBottom: '5px' },
                    textContent: `⚠️ Overspent! (Avg: ${Utils.formatCurrency(ci.upper)})`
                });
            }
        }

        // 4. Action Buttons (Full size for cards)
        const actions = Utils.createElement('div', { className: 'envelope-actions' }, [
            Utils.createElement('button', { className: 'btn-secondary', textContent: 'Add', onclick: (e) => this.callbacks.onAddFunds(e, env.id) }),
            (env.type === 'cc_payment') 
                ? Utils.createElement('button', { className: 'btn-primary', textContent: 'Pay Bill', onclick: (e) => this.callbacks.onPayCard(e, env.id) })
                : Utils.createElement('button', { className: 'btn-secondary', textContent: 'Spend', onclick: (e) => this.callbacks.onSpend(e, env.id) }),
            Utils.createElement('button', { className: 'btn-secondary', textContent: 'Transfer', onclick: (e) => this.callbacks.onTransfer(e, env.id) }),
            Utils.createElement('button', { className: 'btn-secondary', textContent: 'Edit', onclick: (e) => this.callbacks.onEdit(e, env.id) }),
            Utils.createElement('button', { className: 'btn-secondary', textContent: 'History', onclick: (e) => this.callbacks.onHistory(e, env.id) }),
            env.balance < 0 ? Utils.createElement('button', { className: 'btn-secondary', textContent: 'Cover', onclick: (e) => this.callbacks.onCover(e, env.id) }) : null,
            Utils.createElement('button', { className: 'btn-danger', textContent: 'Delete', onclick: (e) => this.callbacks.onDelete(e, env.id) })
        ]);

        // 5. Create Dedicated Drag Handle
        // This solves the issue where clicking buttons accidentally triggered dragging.
        // It provides a distinct grab target.
        const handle = Utils.createElement('div', { 
            className: 'drag-handle', 
            textContent: '⋮⋮', 
            title: 'Drag to reorder',
            // Attach drag start listeners ONLY to the handle
            onmousedown: (e) => this.handleDragStart(e, env.id),
            // Explicit touch handler for mobile
            ontouchstart: (e) => { 
                e.preventDefault(); // Prevent scrolling while grabbing handle
                this.handleDragStart(e, env.id); 
            } 
        });

        // 6. Assemble Card
        const card = Utils.createElement('div', {
            className: `envelope-card ${balanceClass}`,
            dataset: { id: env.id }
        }, [
            handle, // Handle added to top-right
            Utils.createElement('h4', { textContent: env.name }),
            Utils.createElement('div', { className: 'envelope-balance', textContent: Utils.formatCurrency(env.balance) }),
            goalHtml,
            Utils.createElement('div', { className: 'envelope-meta', textContent: budgetText }),
            forecast ? Utils.createElement('div', { className: 'forecast', textContent: forecast }) : null,
            anomalyEl,
            actions
        ]);

        return card;
    }

    // =========================================================
    // DRAG AND DROP LOGIC
    // =========================================================
    
    /**
     * Initiates dragging.
     * Only works in Card view (List view sorts by columns instead).
     */
    handleDragStart(e, id) {
        if(this.viewMode === 'list') return;
        this.dragTarget = id;
        
        // If triggered via MouseEvent, set dataTransfer
        // TouchEvents rely on internal state tracking
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
        }
        
        // Add global listeners to track movement across the document
        document.addEventListener('dragover', this.handleDragOver);
        document.addEventListener('drop', this.handleDrop);
        
        // Optional: Add visual feedback style to body
        // document.body.style.cursor = 'grabbing';
    }

    handleDragOver(e) {
        // Essential: allows the 'drop' event to fire
        e.preventDefault(); 
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        // Add visual feedback to the card being hovered over
        const targetCard = e.target.closest('.envelope-card');
        
        // Clean up previous hover effects
        document.querySelectorAll('.envelope-card.drag-over').forEach(el => {
            if (el !== targetCard) el.classList.remove('drag-over');
        });

        // Apply new hover effect
        if (targetCard && !targetCard.classList.contains('drag-over')) {
            targetCard.classList.add('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        
        // Cleanup visual feedback
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        // document.body.style.cursor = '';

        const droppedOnEl = e.target.closest('.envelope-card');
        const sourceId = this.dragTarget;
        
        if (sourceId && droppedOnEl && sourceId !== droppedOnEl.dataset.id) {
            // Find the DOM element of the item being moved
            const sourceEl = this.listContainer.querySelector(`[data-id="${sourceId}"]`);
            if (sourceEl) {
                // Perform the move in the DOM
                // Note: Currently visual only. For persistence, we would need to 
                // update an 'order' index in AppState and save to DB.
                this.listContainer.insertBefore(sourceEl, droppedOnEl);
            }
        }

        // Remove global listeners
        document.removeEventListener('dragover', this.handleDragOver);
        document.removeEventListener('drop', this.handleDrop);
        this.dragTarget = null;
    }

    /**
     * Renders the "Recurring Bill Suggestions" modal.
     * Triggered by the "Detect" button in the UI.
     */
    showSuggestions(state) {
        const suggestions = state.detectRecurringBills();
        const list = document.getElementById('suggestions-list');
        const modal = document.getElementById('suggestions-modal');
        
        if (!list || !modal) return;
        list.innerHTML = '';
        
        if (suggestions.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary)">No new recurring bills detected.</div>';
        } else {
            suggestions.forEach(s => {
                const row = Utils.createElement('div', { 
                    className: 'scheduled-item',
                    style: { cursor: 'default', flexDirection: 'column', gap: '5px' }
                });

                const top = Utils.createElement('div', { style: {display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%'} }, [
                    Utils.createElement('strong', { textContent: s.name }),
                    Utils.createElement('span', { textContent: Utils.formatCurrency(s.amount), style: {fontWeight:'bold', color:'var(--accent)'} })
                ]);

                const meta = Utils.createElement('div', { style: {fontSize:'0.85rem', color:'var(--text-secondary)'} }, [
                    Utils.createElement('span', { textContent: `${s.frequency} • Next: ${s.date}` })
                ]);
                
                const btn = Utils.createElement('button', { 
                    className: 'btn-primary', 
                    textContent: 'Add Bill',
                    style: { width: '100%', marginTop: '8px' },
                    onclick: () => {
                        // Create the object using the imported model class
                        const newBill = new ScheduledTransaction({
                            name: s.name,
                            amount: s.amount,
                            frequency: s.frequency,
                            date: s.date,
                            // Default to the first account available
                            accountId: state.data.accounts.keys().next().value 
                        });
                        
                        state.addScheduled(newBill).then(() => {
                            // Remove row on success
                            row.remove();
                            // Update the main scheduled list UI
                            window.app.ui.renderScheduled();
                            // Close modal if list empty
                            if(list.children.length === 0) modal.classList.remove('active');
                        });
                    }
                });

                row.append(top, meta, btn);
                list.appendChild(row);
            });
        }
        modal.classList.add('active');
    }
}
