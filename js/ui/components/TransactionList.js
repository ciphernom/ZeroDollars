/* js/ui/components/TransactionList.js */
import { Utils } from '../../utils/index.js';
import { VirtualScroller } from './VirtualScroller.js';
import { LedgerState } from './LedgerState.js';

export class TransactionList {
  constructor(container, mode, callbacks, options = {}) {
    this.container = container;
    this.mode = mode;
    this.callbacks = callbacks;
    this.options = options;
    this.ledgerState = new LedgerState();
    this.scroller = null;
    this.contextId = null;

    this._initLayout();
  }

  setContext(id) {
    this.contextId = id;
  }

  setData(transactions) {
    this.ledgerState.setData(transactions);
    this._refresh();
  }

  setSearch(term) {
    this.ledgerState.setFilter('search', term);
    this._refresh();
  }

  setTypeFilter(type) {
    this.ledgerState.setFilter('type', type);
    this._refresh();
  }

  _initLayout() {
    this.container.innerHTML = '';
    // This applies the generic table container styles
    this.container.classList.add('table-container');

    if (!this.options.hideSearch) {
      const searchContainer = Utils.createElement('div', {
        style: { display: 'flex', gap: '10px', marginBottom: '10px', padding: '0 5px' }
      });
      const searchInput = Utils.createElement('input', {
        type: 'search',
        placeholder: 'Search transactions...',
        style: { marginBottom: '0', flex: 1 }
      });
      searchInput.addEventListener('input', (e) => this.setSearch(e.target.value));
      searchContainer.appendChild(searchInput);
      this.container.appendChild(searchContainer);
    }

    const header = Utils.createElement('div', { className: 'ledger-header' });
    const col2Title = this.mode === 'account' ? 'Jar / Category' : 'Account / Source';
    
    header.append(
      this._createHeaderCol('date', 'Date & Note'),
      this._createHeaderCol('payee', col2Title, 'col-category'),
      this._createHeaderCol('amount', 'Amount', 'header-amount', true)
    );

    // Matches the updated CSS class
    const scrollContainer = Utils.createElement('div', {
      className: 'virtual-scroller-container' 
    });
    
    this.container.append(header, scrollContainer);

    this.scroller = new VirtualScroller(scrollContainer, {
      rowHeight: 72,
      renderRow: (tx) => this._renderRow(tx)
    });
  }

  _createHeaderCol(field, text, extraClass = '', isRight = false) {
    const el = Utils.createElement('div', {
      className: `sortable ${extraClass}`,
      textContent: text,
      style: isRight ? { justifyContent: 'flex-end' } : {}
    });
    el.addEventListener('click', () => {
      const newSort = this.ledgerState.toggleSort(field);
      this.container.querySelectorAll('.sortable').forEach(h => h.classList.remove('asc', 'desc'));
      el.classList.add(newSort.direction);
      this._refresh();
    });
    return el;
  }

  _refresh() {
    if (this.scroller) {
      this.scroller.setItems(this.ledgerState.result);
    }
  }

  _renderRow(tx) {
    const amountClass = tx.amount < 0 ? 'negative' : '';
    const dateStr = Utils.formatDate(tx.date);

    let badgeName = '';
    let badgeStyle = { color: 'var(--text-secondary)', fontSize: '0.8rem' };

    if (this.mode === 'account') {
      if (tx.jarId === 'split') {
        badgeName = 'Split';
      } else if (tx.jarId) {
        const jar = window.app.state.getEnvelope(tx.jarId);
        badgeName = jar ? `Jar ${jar.name}` : 'Orphaned';
        if (!jar) badgeStyle.color = 'var(--danger)';
      } else {
        badgeName = tx.type === 'spend' ? 'Uncategorized' : 'Income';
      }
    } else {
      if (tx.accountId) {
        const acc = window.app.state.getAccount(tx.accountId);
        badgeName = acc ? `Bank ${acc.name}` : 'Unknown Account';
      } else {
        badgeName = tx.type === 'add' ? 'Funded' : 'Transfer';
      }
    }

    const dateLine = Utils.createElement('div', {
      style: { fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }
    }, [
      Utils.createElement('span', { textContent: dateStr }),
      Utils.createElement('span', { className: 'mobile-cat-badge', textContent: badgeName })
    ]);

    const col1 = Utils.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    }, [
      Utils.createElement('span', {
        textContent: tx.note || 'No Description',
        style: { fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
      }),
      dateLine
    ]);

    const col2 = Utils.createElement('div', { className: 'col-category' }, [
      Utils.createElement('span', { textContent: badgeName, style: badgeStyle })
    ]);

    const actionButtons = [];
    if (this.mode === 'account' && tx.type === 'spend' && tx.jarId !== 'split') {
      actionButtons.push(Utils.createElement('button', {
        textContent: 'Move',
        className: 'btn-secondary',
        title: 'Move to Jar',
        style: { padding: '2px 6px', fontSize: '0.8rem' },
        onclick: (e) => { e.stopPropagation(); this.callbacks.onReassign(this.contextId, tx.originalIndex); }
      }));
    }

    actionButtons.push(Utils.createElement('button', {
      textContent: 'Edit',
      className: 'btn-secondary',
      title: 'Edit',
      style: { padding: '2px 6px', fontSize: '0.8rem' },
      onclick: (e) => { e.stopPropagation(); this.callbacks.onEdit(this.contextId, tx.originalIndex); }
    }));

    actionButtons.push(Utils.createElement('button', {
      textContent: '×',
      className: 'btn-danger',
      title: 'Delete',
      style: { padding: '2px 6px', fontSize: '0.8rem' },
      onclick: (e) => { e.stopPropagation(); this.callbacks.onDelete(this.contextId, tx.originalIndex); }
    }));

    const col3 = Utils.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }
    }, [
      Utils.createElement('span', {
        className: `amount ${amountClass}`,
        textContent: Utils.formatCurrency(tx.amount)
      }),
      Utils.createElement('div', { style: { display: 'flex', gap: '5px' } }, actionButtons)
    ]);

    return Utils.createElement('div', {}, [col1, col2, col3]);
  }
}
