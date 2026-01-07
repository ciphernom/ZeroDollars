import { BaseView } from './BaseView.js';
import { Utils } from '../../utils/index.js';
import { TransactionList } from '../components/TransactionList.js';

export class AccountsView extends BaseView {
    constructor(callbacks) {
        super('accounts-tab');
        this.callbacks = callbacks;

        this.elements = {
            listEl: document.getElementById('accounts-list'),
            listView: document.getElementById('account-list-view'),
            
            detailView: document.getElementById('account-detail-view'),
            detailHeader: document.getElementById('account-detail-title').parentElement, 
            detailTitle: document.getElementById('account-detail-title'),
            detailListContainer: document.getElementById('account-detail-list'),
            backBtn: document.getElementById('account-detail-back-btn')
        };
        this.currentAccountId = null;

        // Initialize Shared Component
        this.txList = new TransactionList(
            this.elements.detailListContainer, 
            'account', 
            {
                onEdit: (id, idx) => this.callbacks.onEditTx(id, idx),
                onDelete: (id, idx) => this.callbacks.onDeleteTx(id, idx),
                onReassign: (id, idx) => this.callbacks.onReassign(id, idx)
            },
            { hideSearch: true } // Keeps the duplicate search bar hidden
        );
        this._bindGlobalEvents();
    }

    _bindGlobalEvents() {
        if (this.elements.backBtn) this.elements.backBtn.addEventListener('click', () => this.showList());
        
        // Search Input Logic (External)
        const extSearch = document.getElementById('ledger-search-input');
        if (extSearch) {
            extSearch.addEventListener('input', (e) => this.txList.setSearch(e.target.value));
        }
        
        // Filter Dropdown Logic (External)
        const extFilter = document.getElementById('ledger-filter-select');
        if (extFilter) {
             extFilter.addEventListener('change', (e) => {
                 this.txList.setTypeFilter(e.target.value); 
             });
        }
    }

    render(state) {
        this.appState = state;
        this._renderAccountList(state);
        if (this.currentAccountId) this._renderLedger(state);
    }

    showList() {
        this.currentAccountId = null;
        this.elements.listView.style.display = 'block';
        this.elements.detailView.style.display = 'none';
        
        const extSearch = document.getElementById('ledger-search-input');
        if(extSearch) extSearch.value = '';
    }

_renderAccountList(state) {
        const listEl = this.elements.listEl;
        listEl.innerHTML = '';

        const openAccounts = Array.from(state.data.accounts.values())
            .filter(acc => acc.status === 'open' && !acc.deleted);

        // --- NEW: Header with Transfer Button ---
        const headerDiv = Utils.createElement('div', {
            style: { 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '15px',
                padding: '0 5px'
            }
        });

        const title = Utils.createElement('h3', { 
            textContent: `Accounts`, 
            style: { margin: 0, color: 'var(--text-primary)' } 
        });

        const transferBtn = Utils.createElement('button', {
            className: 'btn-secondary',
            onclick: () => window.app.ui.showAccountTransferModal(),
            style: { 
                fontSize: '0.9rem',
                fontWeight: '600',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: 'auto'
            }
        }, [
            Utils.createElement('span', { textContent: '💸' }),
            Utils.createElement('span', { textContent: 'Transfer' })
        ]);

        headerDiv.appendChild(title);
        headerDiv.appendChild(transferBtn);
        listEl.appendChild(headerDiv);
        // ----------------------------------------

        // Handle Empty State
        if (openAccounts.length === 0) {
            listEl.appendChild(Utils.createElement('p', { 
                textContent: 'No open accounts.', 
                style: { textAlign:'center', color:'var(--text-secondary)' } 
            }));
            return;
        }

        // Render Open Accounts
        openAccounts.forEach(acc => {
            const actionButton = (acc.type === 'credit')
                ? Utils.createElement('button', { className: 'btn-danger', textContent: 'Delete', onclick: (e) => { e.stopPropagation(); this.callbacks.onDelete(acc.id); } })
                : Utils.createElement('button', { className: 'btn-secondary', textContent: 'Close', onclick: (e) => { e.stopPropagation(); this.callbacks.onClose(acc.id); } });

            const card = Utils.createElement('div', { 
                className: 'account-card',
                onclick: () => this.callbacks.onHistory(acc.id) 
            }, [
                Utils.createElement('div', { style: {display:'flex', justifyContent:'space-between'} }, [
                    Utils.createElement('span', { textContent: `${acc.name} (${acc.type})`, style: {fontWeight:'bold'} }),
                    Utils.createElement('span', { className: 'account-balance', textContent: Utils.formatCurrency(acc.balance) })
                ]),
                Utils.createElement('div', { style: { display: 'flex', gap: '8px', marginTop:'10px' } }, [
                    Utils.createElement('button', { className: 'btn-secondary', textContent: 'Reconcile', onclick: (e) => { e.stopPropagation(); this.callbacks.onReconcile(acc.id); } }),
                    actionButton
                ])
            ]);
            listEl.appendChild(card);
        });
        
        // Render Closed Accounts
        const closedAccounts = Array.from(state.data.accounts.values()).filter(acc => acc.status === 'closed');
        if (closedAccounts.length > 0) {
            listEl.appendChild(Utils.createElement('h3', { textContent: 'Closed', style: { marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '10px' } }));
            closedAccounts.forEach(acc => {
                const card = Utils.createElement('div', { 
                    className: 'account-card', style: { opacity: 0.6, cursor: 'pointer' }, 
                    onclick: () => this.callbacks.onHistory(acc.id)
                }, [
                    Utils.createElement('span', { textContent: `${acc.name} (${acc.type})` }),
                    Utils.createElement('span', { className: 'account-balance', textContent: Utils.formatCurrency(acc.balance) })
                ]);
                listEl.appendChild(card);
            });
        }
    }

showDetail(accountId) {
    this.currentAccountId = accountId;
    this.elements.listView.style.display = 'none';
    this.elements.detailView.style.display = 'block';
    
    this.render(window.app.state);  // Single render — now works instantly
}

    _renderLedger(state) {
        const acc = state.getAccount(this.currentAccountId);
        if (!acc) return this.showList();

        this.elements.detailTitle.textContent = `${acc.name}`;
        
        // --- ARCHIVE BUTTON (Header) ---
        const existingBtn = this.elements.detailHeader.querySelector('.archive-btn');
        if (existingBtn) existingBtn.remove();

        if (acc.snapshotBalance !== 0 || acc.lastArchiveHash) {
            const archiveBtn = Utils.createElement('button', {
                className: 'btn-secondary archive-btn',
                textContent: '📚 History', 
                style: { marginLeft: 'auto', padding: '6px 12px', fontSize: '0.85rem' },
                onclick: () => this.callbacks.onArchive(acc.id)
            });
            this.elements.detailHeader.appendChild(archiveBtn);
        }
        
        // Pass data to component
        const activeTxs = acc.transactions
            .map((t, i) => ({...t, originalIndex: i})) 
            .filter(tx => !tx.deleted);
        
        this.txList.setContext(this.currentAccountId);
        this.txList.setData(activeTxs);
    }
}
