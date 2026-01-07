import { Utils } from '../utils/index.js';
import { PinManager } from '../db/pin-manager.js';
import { Toaster } from './toast-manager.js';
import { BudgetView } from './views/BudgetView.js';
import { AccountsView } from './views/AccountsView.js';
import { ReportsView } from './views/ReportsView.js';
import { ScheduledTransaction } from '../models/transaction.js';
import { Envelope } from '../models/envelope.js';
import { Account } from '../models/account.js';
import { MLManager } from '../services/ml-manager.js';
import { TransactionList } from './components/TransactionList.js';
import { InteractionTracker } from '../services/interaction-tracker.js';
import { MarketplaceView } from './views/MarketplaceView.js';
import { ExtensionStudio } from './ExtensionStudio.js';

export class UIManager {
    constructor(state, db, pluginSystem) {
        this.state = state;
        this.db = db;
        this.tracker = new InteractionTracker(db);
        this.plugins = pluginSystem; 
        this.els = this._cacheGlobalElements();
        
        this.views = {
            budget: new BudgetView({
                onAddFunds: (e, id) => this.showAddFundsModal(e, id),
                onSpend: (e, id) => this.showSpendModal(e, id),
                onPayCard: (e, id) => this.handlePayCard(e, id),
                onTransfer: (e, id) => this.showTransferModal(id),
                onEdit: (e, id) => this.showEditEnvelopeModal(id),
                onHistory: (e, id) => this.showHistoryModal(id),
                onCover: (e, id) => this.showCoverModal(id),
                onDelete: (e, id) => this.handleDeleteEnvelope(e, id),
                onCreateDefaults: () => this.handleCreateDefaultJars()
            }),
            accounts: new AccountsView({
                onHistory: (id) => this.showAccountHistory(id),
                onReconcile: (id) => this.showReconcileModal(id),
                onClose: (id) => this.handleCloseAccount(id),
                onDelete: (id) => this.handleDeleteCreditAccount(id),
                onEditTx: (accId, idx) => this.showAccountTxEditModal(accId, idx),
                onDeleteTx: (accId, idx) => this.handleAccountTxDelete(accId, idx),
                onReassign: (accId, idx) => this.showReassignModal(accId, idx),
                onArchive: (id) => this.showArchiveModal(id)
            }),
            reports: new ReportsView(),
            marketplace: new MarketplaceView({
                state,
                db,
                pluginSystem,
                toast: (m, t) => Toaster.show(m, t),
                ui: this
            })
        };

        this.jarHistoryList = new TransactionList(
            document.getElementById('history-list'), 
            'envelope', 
            {
                onEdit: (id, idx) => this.showEditTxModal(id, idx),
                onDelete: (id, idx) => this.handleDeleteTx(id, idx),
                onReassign: () => {} 
            }
        );

        this.activeView = this.views.budget;
        this.currentAction = null;
        this.currentEnvelopeId = null;
        this._importData = null;
        this._importTransactions = null;

        this._bindGlobalEvents();
        this.setupMobileUI();
        this.studio = new ExtensionStudio(window.app);
        // Load Developer Identity for signing plugins
        this._loadDevIdentity();
    }

    // --- Developer Identity (Nostr) ---
    async _loadDevIdentity() {
        const nsec = localStorage.getItem('dev_nsec_v1');
        if (nsec) {
            try {
                if (window.NostrTools && window.NostrTools.nip19) {
                    const { data } = window.NostrTools.nip19.decode(nsec);
                    this.devPrivateKey = (data instanceof Uint8Array) ? Utils.bytesToHex(data) : data;
                    this._updateDevIdentityDisplay();
                }
            } catch(e) {
                console.error("Invalid stored nsec", e);
                this._cycleDevIdentity();
            }
        } else {
            this._cycleDevIdentity();
        }
    }

    async _cycleDevIdentity() {
        if (!window.NostrTools) return;
        
        // Generate new key
        const privKey = window.NostrTools.generateSecretKey(); // Uint8Array
        const privHex = Utils.bytesToHex(privKey);
        const nsec = window.NostrTools.nip19.nsecEncode(privKey);
        
        this.devPrivateKey = privHex;
        localStorage.setItem('dev_nsec_v1', nsec);
        
        this._updateDevIdentityDisplay();
        Toaster.show("New Nostr Identity Generated", "info");
    }

    async _updateDevIdentityDisplay() {
        const el = document.getElementById('dev-identity-display');
        if (!el || !this.devPrivateKey) return;
        
        try {
            const pubHex = window.NostrTools.getPublicKey(this.devPrivateKey);
            const npub = window.NostrTools.nip19.npubEncode(pubHex);
            
            el.textContent = `Signer: ${npub.substring(0, 10)}...`;
            el.title = npub;
        } catch(e) {
            el.textContent = "Identity Error";
        }
    }

    // --- Plugin Extension Studio Handlers ---
showPluginCreator() {
    if (this.studio) {
        this.studio.show();
    }
}

    async handleCompilePlugin() {
        const name = document.getElementById('plugin-creator-name').value.trim();
        const code = document.getElementById('plugin-creator-code').value;
        
        if (!name || !code) return Toaster.show("Name and Code required", "error");
        if (!this.devPrivateKey) return Toaster.show("Signing Key not ready", "error");

        try {
            const blob = await window.app.plugins.createSignedPackage(code, this.devPrivateKey);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}.zdp`;
            a.click();
            URL.revokeObjectURL(url);
            Toaster.show("Signed ZDP Downloaded!", "success");
        } catch (e) {
            console.error(e);
            Toaster.show("Compilation failed", "error");
        }
    }

    async handleTestInstallPlugin() {
        const name = document.getElementById('plugin-creator-name').value.trim();
        const code = document.getElementById('plugin-creator-code').value;
        if (!name || !code) return Toaster.show("Name and Code required", "error");

        try {
            const blob = await window.app.plugins.createSignedPackage(code, this.devPrivateKey);
            const file = new File([blob], `${name}.zdp`);
            
            await window.app.plugins.installPlugin(file);
            Toaster.show("Installed! Reloading...", "success");
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            Toaster.show("Install failed: " + e.message, "error");
        }
    }

    // ... (Existing UI methods below) ...

    showAccountTransferModal() {
        this._populateAccountSelect(this.els.accTransFrom);
        this._populateAccountSelect(this.els.accTransTo);
        this.els.accTransAmount.value = '';
        this.els.accTransNote.value = '';
        this.showModal(this.els.accTransferModal);
    }

    async handleAccountTransferConfirm() {
        const fromId = this.els.accTransFrom.value;
        const toId = this.els.accTransTo.value;
        const amount = Utils.parseToCents(this.els.accTransAmount.value);
        const note = this.els.accTransNote.value.trim();

        if(!fromId || !toId || amount <= 0) return Toaster.show("Please check all fields", "error");

        try {
            await this.state.transferBetweenAccounts(fromId, toId, amount, note);
            this.hideModal(this.els.accTransferModal);
            this.renderAccounts(); 
            Toaster.show("Transfer successful", "success");
        } catch(e) {
            Toaster.show(e.message, "error");
        }
    }

    render() {
        this._updateTBB();
        this._renderScheduled();
        this._updateSelects();
        if (this.activeView) {
            this.activeView.render(this.state);
        }
       // Object.values(this.views).forEach(view => view.render(this.state));
    }

    renderAccounts() {
        this.views.accounts.render(this.state);
    }

    renderScheduled() {
        this._renderScheduled();
    }

    handleTabSwitch(tab) {
        this.tracker.logViewStart(`view_${tab}`);
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

        this.activeView.hide();
        this.activeView = this.views[tab];
        this.activeView.show();
        
        this.render();
    }

    showModal(modal, title = '') {
        if (!modal) return;
        if (title) {
            const h3 = modal.querySelector('h3') || modal.querySelector('#modal-title');
            if (h3) h3.textContent = title;
        }
        modal.classList.add('active');
    }

    hideModal(modal) {
        if (modal) modal.classList.remove('active');
        if (modal === this.els.amountModal) this._resetAmountModal();
        if (modal === this.els.historyModal && this.tracker) {
            this.tracker.logViewEnd();
        }
    }

    showConfirmModal(title, description, onConfirm) {
        this.els.confirmTitle.textContent = title;
        this.els.confirmDesc.textContent = description;
        this.currentAction = onConfirm;
        
        // FIX: Force this modal to the very top (above plugin modal)
        this.els.confirmModal.style.zIndex = '2000'; 
        
        this.showModal(this.els.confirmModal);
    }

    showAddFundsModal(e, id) {
        e.stopPropagation();
        this.currentEnvelopeId = id;
        this.els.amountModalTitle.textContent = `Add to ${this.state.getEnvelope(id)?.name}`;
        this._configureAmountModal({ showJar: false, showAcc: false, showSplit: false });
        this.els.modalConfirm.onclick = () => this.confirmAddFunds(id);
        this.showModal(this.els.amountModal);
    }

    async confirmAddFunds(id) {
        const amount = Utils.parseToCents(this.els.modalAmount.value);
        const note = this.els.modalNote.value.trim();
        if (amount <= 0) return Toaster.show('Invalid amount', 'error');
        
        try {
            await this.state.addFundsToEnvelope(id, amount, note);
            this.hideModal(this.els.amountModal);
            this.render();
        } catch (err) {
            Toaster.show(err.message, 'error');
        }
    }

    showSpendModal(e, id) {
        e.stopPropagation();
        this.currentEnvelopeId = id;
        this.els.amountModalTitle.textContent = `Spend from ${this.state.getEnvelope(id)?.name}`;
        this._configureAmountModal({ showJar: false, showAcc: true, showSplit: true });
        this.els.modalJar.value = id;
        this.els.modalConfirm.onclick = () => this.confirmLogSpend(id);
        this.showModal(this.els.amountModal);
    }

async confirmLogSpend(id) {
        const amount = Utils.parseToCents(this.els.modalAmount.value);
        const note = this.els.modalNote.value.trim();
        const accountId = this.els.paymentAccount.value;
        const splits = this.els.enableSplit.checked ? this._getSplits() : [];

        if (amount <= 0 || (!accountId && !splits.length)) return Toaster.show('Invalid details', 'error');

        // Check for future date - redirect to scheduled transaction
        if (this._isFutureDate()) {
            this.hideModal(this.els.amountModal);
            this._openScheduledWithData({
                amount,
                note,
                envelopeId: id,
                accountId,
                date: this.els.modalDate.value
            });
            return;
        }

        const date = this._getSelectedDate();
        // --- SMART COVER CHECK ---
        const env = this.state.getEnvelope(id);
        if (env && amount > env.balance) {
            // 1. Try to find a solution
            const suggestion = await this.state.getSmartCoverSuggestions(id, amount);
            
            if (!suggestion || !suggestion.success) {
                // FAILURE: Get Mad 😡
                this.shakeModal(this.els.amountModal);
                Toaster.show(`You're broke! Short by ${Utils.formatCurrency(suggestion ? suggestion.deficit : (amount - env.balance))}.`, 'error');
                return;
            }

            // SUCCESS: Offer the "Roll with the punches" plan
            const planDetails = suggestion.plan.map(p => 
                `<li>💸 Take <b>${Utils.formatCurrency(p.amount)}</b> from <b>${p.fromJar.name}</b></li>`
            ).join('');

            this.showConfirmModal(
                'Roll with the punches? 🥊', 
                `Jar is short. Auto-cover funds?\n<ul>${planDetails}</ul>`,
                async () => {
                    try {
                        await this.state.applySmartCoverAndSpend(id, amount, note, accountId, suggestion.plan, date);
                        this.hideModal(this.els.amountModal);
                        this.render();
                        Toaster.show("Covered & Spent! 🥊", "success");
                    } catch (e) {
                        Toaster.show(e.message, 'error');
                    }
                }
            );
            // Allow HTML in confirm description for the list
            this.els.confirmDesc.innerHTML = `Jar is short. Auto-cover funds?<ul style="text-align:left; margin-top:10px;">${planDetails}</ul>`;

            // Capture the Rejection. If they click "No/Cancel", we log it.
            // We use .onclick to temporarily override the default close behavior just for this instance
            const cancelBtn = this.els.confirmModal.querySelector('.btn-secondary');
            if (cancelBtn) {
                cancelBtn.onclick = (e) => {
                    e.stopPropagation();
                    // 🧠 SENSOR: User said NO to the plan.
                    if (this.tracker) this.tracker.logRejection(id, 'smart_cover_cancellation');
                    this.hideModal(this.els.confirmModal);
                    
                    // Restore default behavior (optional, as hideModal usually resets state, but good practice)
                    cancelBtn.onclick = () => this.hideModal(this.els.confirmModal);
                };
            }
            return;
        }
        // -------------------------
        try {
            await this.state.logSpend(id, amount, note, accountId, splits, date);
            this.hideModal(this.els.amountModal);
            this.render();
        } catch (err) {
            this.shakeModal(this.els.amountModal);
            Toaster.show(err.message, 'error');
        }
    }

    // Helper for "Getting Mad"
    shakeModal(modal) {
        const content = modal.querySelector('.modal-content');
        content.classList.add('shake-anim');
        setTimeout(() => content.classList.remove('shake-anim'), 400);
        
        // Optional: Red flash
        const oldBorder = content.style.borderColor;
        content.style.borderColor = 'var(--danger)';
        setTimeout(() => content.style.borderColor = oldBorder, 400);
    }

    handlePayCard(e, id) {
        e.stopPropagation();
        const jar = this.state.getEnvelope(id);
        this.els.amountModalTitle.textContent = `Pay ${jar.name}`;
        this._configureAmountModal({ showJar: false, showAcc: true, showSplit: false });
        this.els.modalAmount.value = (jar.balance / 100).toFixed(2);
        this._populateAccountSelect(this.els.paymentAccount, true);

        this.els.modalConfirm.onclick = async () => {
            const amt = Utils.parseToCents(this.els.modalAmount.value);
            const fromAcc = this.els.paymentAccount.value;
            const note = this.els.modalNote.value;
            try {
                await this.state.makeCreditCardPayment(id, amt, fromAcc, note);
                this.hideModal(this.els.amountModal);
                this.render();
                Toaster.show("Payment recorded", 'success');
            } catch (err) { Toaster.show(err.message, 'error'); }
        };
        this.showModal(this.els.amountModal);
    }

    showTransferModal(id) {
        this.els.transferFrom.value = id;
        this.showModal(this.els.transferModal);
    }

    async handleTransferConfirm() {
        const from = this.els.transferFrom.value;
        const to = this.els.transferTo.value;
        const amt = Utils.parseToCents(this.els.transferAmount.value);
        const note = this.els.transferNote.value;
        try {
            await this.state.transfer(from, to, amt, note);
            this.tracker.logTransfer(from, to, amt);
            this.hideModal(this.els.transferModal);
            this.render();
        } catch (err) { Toaster.show(err.message, 'error'); }
    }

    showEditEnvelopeModal(id) {
        const env = this.state.getEnvelope(id);
        if (!env) return;
        this.currentEnvelopeId = id;
        
        document.getElementById('edit-name').value = env.name;
        document.getElementById('edit-goal').value = env.goalAmount ? (env.goalAmount / 100).toFixed(2) : '';
        document.getElementById('edit-goal-type').value = env.goalType || ''; 
        document.getElementById('edit-target-date').value = env.targetDate || '';
        
        this.showModal(this.els.editModal, 'Edit Jar');
    }

    async handleEditSave() {
        const name = document.getElementById('edit-name').value.trim();
        const goalType = document.getElementById('edit-goal-type').value || null;
        const goalAmount = Utils.parseToCents(document.getElementById('edit-goal').value);
        const targetDate = document.getElementById('edit-target-date').value;

        if (!name) return Toaster.show('Name required', 'error');
        const env = this.state.getEnvelope(this.currentEnvelopeId);
        if (!env) return;

        if (Array.from(this.state.data.envelopes.values()).some(e => e.id !== env.id && e.name.toLowerCase() === name.toLowerCase())) {
            return Toaster.show('Duplicate name', 'error');
        }

        env.name = name;
        try {
            await this.state.updateEnvelopeGoal(this.currentEnvelopeId, goalType, goalAmount, targetDate); 
            this.render();
            this.hideModal(this.els.editModal);
        } catch (err) {
            Toaster.show(err.message, 'error');
        }
    }

    showHistoryModal(id) {
        if (this.tracker) this.tracker.logViewStart(id);
        const env = this.state.getEnvelope(id);
        if (!env) return;
        
        const displayTxs = env.transactions
            .map((tx, index) => ({ ...tx, originalIndex: index }))
            .filter(tx => !tx.deleted);

        this.jarHistoryList.setContext(id);
        this.jarHistoryList.setData(displayTxs);
        
        this.els.historyList.style.height = '60vh'; 
        this.els.historyList.style.display = 'block';

        this.showModal(this.els.historyModal, `History: ${env.name}`);
    }

    showCoverModal(id) {
        this.currentEnvelopeId = id;
        const env = this.state.getEnvelope(id);
        this.els.coverToName.textContent = env ? env.name : '';
        this.els.coverAmount.value = Math.abs(env.balance) / 100;
        this.showModal(this.els.coverModal, 'Cover Overspend');
    }

    async handleCoverConfirm() {
        const fromId = this.els.coverFrom.value;
        const toId = this.currentEnvelopeId;
        const amount = Utils.parseToCents(this.els.coverAmount.value);
        const note = this.els.coverNote.value.trim();
        if (!fromId || !toId || amount <= 0) return Toaster.show('Invalid cover', 'error');
        try {
            await this.state.coverOverspend(fromId, toId, amount, note);
            this.render();
            this.hideModal(this.els.coverModal);
        } catch (err) { Toaster.show(err.message, 'error'); }
    }

    handleDeleteEnvelope(e, id) {
        e.stopPropagation();
        const env = this.state.getEnvelope(id);
        if (env.type === 'cc_payment') {
            const linked = this.state.getAccount(env.linkedAccountId);
            if (linked) return Toaster.show("Delete the linked account to remove this jar.", "error");
        }
        this.showConfirmModal('Delete Jar?', `Return ${Utils.formatCurrency(env.balance)} to TBB?`, async () => {
            await this.state.deleteEnvelope(id);
            this.render();
        });
    }

    async handleCreateDefaultJars() {
        try {
            await this.state.createDefaultJars();
            this.render();
            Toaster.show('Jars created!', 'success');
        } catch (e) { Toaster.show(e.message, 'error'); }
    }

    showEditTxModal(envelopeId, txIndex) {
        const env = this.state.getEnvelope(envelopeId);
        if (!env || txIndex < 0) return;
        const tx = env.transactions[txIndex];
        
        this.els.editTxTitle.textContent = `Edit Jar Tx`;
        this.els.editTxAmount.value = (Math.abs(tx.amount) / 100).toFixed(2);
        this.els.editTxDate.value = new Date(tx.date).toISOString().slice(0, 16);
        this.els.editTxNote.value = tx.note || '';
        
        this.currentAction = { type: 'editEnvelopeTx', envelopeId, txIndex, originalSign: Math.sign(tx.amount) || 1 };
        this.els.editTxSave.onclick = () => this.handleUnifiedTxSave();
        this.showModal(this.els.editTxModal);
    }

    handleDeleteTx(envelopeId, txIndex) {
        this.showConfirmModal('Delete transaction?', 'This cannot be undone.', async () => {
            try {
                await this.state.deleteTransaction(envelopeId, txIndex);
                this.showHistoryModal(envelopeId);
                this.render();
            } catch (err) { Toaster.show(err.message, 'error'); }
        });
    }

    showAccountHistory(id) {
        if (this.activeView !== this.views.accounts) this.handleTabSwitch('accounts');
        if (this.els.importAccountId) this.els.importAccountId.value = id;
        this.views.accounts.showDetail(id);
        this.views.accounts.render(this.state);
    }

    showReconcileModal(id) {
        this.els.reconcileModal.dataset.accountId = id;
        const acc = this.state.getAccount(id);
        const bal = acc.transactions.reduce((s, tx) => s + tx.amount, 0);
        this.els.reconcileAmount.value = (bal / 100).toFixed(2);
        this.showModal(this.els.reconcileModal, 'Reconcile Account');
    }

    async handleReconcileConfirm() {
        const id = this.els.reconcileModal.dataset.accountId;
        const amt = Utils.parseToCents(this.els.reconcileAmount.value);
        try {
            const diff = await this.state.reconcileAccount(id, amt);
            this.hideModal(this.els.reconcileModal);
            Toaster.show(`Reconciled. ${diff !== 0 ? 'Adjustment created.' : 'Balanced.'}`, 'success');
            this.render();
        } catch (err) { Toaster.show(err.message, 'error'); }
    }

    handleCloseAccount(id) {
        const acc = this.state.getAccount(id);
        if(acc.balance !== 0) return Toaster.show("Balance must be zero.", 'error');
        this.showConfirmModal("Close Account?", "Hide this account?", async () => {
            await this.state.closeAccount(id);
            this.renderAccounts();
        });
    }

    handleDeleteCreditAccount(id) {
        this.showConfirmModal("Delete Credit Account?", "This deletes the account and payment jar. Irreversible.", async () => {
            await this.state.deleteCreditAccount(id);
            this.render();
        });
    }

    showAccountTxEditModal(accountId, txIndex) {
        const acc = this.state.getAccount(accountId);
        if (!acc) return;
        const tx = acc.transactions[txIndex];
        
        this.els.editTxTitle.textContent = `Edit Account Tx`;
        this.els.editTxAmount.value = (Math.abs(tx.amount) / 100).toFixed(2);
        this.els.editTxDate.value = new Date(tx.date).toISOString().slice(0, 16);
        this.els.editTxNote.value = tx.note || '';
        
        this.currentAction = { type: 'editAccountTx', accountId, txIndex, originalSign: Math.sign(tx.amount) || 1 };
        this.els.editTxSave.onclick = () => this.handleUnifiedTxSave();
        this.showModal(this.els.editTxModal);
    }

    async handleUnifiedTxSave() {
        if (!this.currentAction) return;
        const { type, envelopeId, accountId, txIndex, originalSign } = this.currentAction;
        const newNote = this.els.editTxNote.value.trim();
        const newDate = this.els.editTxDate.value;
        const newAmount = Utils.parseToCents(this.els.editTxAmount.value) * originalSign;

        if (newAmount === 0 || !newDate) return Toaster.show('Invalid amount or date', 'error');

        try {
            if (type === 'editAccountTx') {
                await this.state.editAccountTransaction(accountId, txIndex, newAmount, newDate, newNote);
                this.showAccountHistory(accountId);
            } else if (type === 'editEnvelopeTx') {
                await this.state.editTransaction(envelopeId, txIndex, newAmount, newDate, newNote);
                this.showHistoryModal(envelopeId);
            }
            this.hideModal(this.els.editTxModal);
            this.render();
        } catch (err) { Toaster.show(err.message, 'error'); }
    }

    handleAccountTxDelete(accountId, txIndex) {
        this.showConfirmModal('Delete Transaction?', 'Cannot be undone.', async () => {
            try {
                await this.state.deleteAccountTransaction(accountId, txIndex);
                this.showAccountHistory(accountId);
                this.render();
            } catch (err) { Toaster.show(err.message, 'error'); }
        });
    }

    showReassignModal(accountId, txIndex) {
        const acc = this.state.getAccount(accountId);
        const tx = acc.transactions[txIndex];
        
        this.els.reassignTxDetails.textContent = `Amount: ${Utils.formatCurrency(tx.amount)} | Note: ${tx.note}`;
        const select = this.els.reassignJarSelect;
        select.innerHTML = '<option value="">--- Uncategorized ---</option>';
        this.state.data.envelopes.forEach(env => {
            select.appendChild(Utils.createElement('option', { value: env.id, textContent: env.name }));
        });
        select.value = tx.jarId || '';
        
        this.currentAction = { type: 'reassign', accountId, txIndex };
        this.els.reassignConfirm.onclick = () => this.handleReassignConfirm();
        this.showModal(this.els.reassignModal);
    }

    async handleReassignConfirm() {
        if (this.currentAction?.type !== 'reassign') return;
        const { accountId, txIndex } = this.currentAction;
        const jarId = this.els.reassignJarSelect.value || null;
        try {
            await this.state.reassignAccountTransaction(accountId, txIndex, jarId);
            this.hideModal(this.els.reassignModal);
            this.render();
            this.showAccountHistory(accountId);
        } catch (err) { Toaster.show(err.message, 'error'); }
    }

    async showArchiveModal(accountId) {
        const acc = this.state.getAccount(accountId);
        if (!acc) return;
        this.els.historyTitle.textContent = `Archived: ${acc.name}`;
        this.els.historyList.innerHTML = '<div style="text-align:center; padding:20px;">Loading...</div>';
        this.showModal(this.els.historyModal);

        const tx = this.db.instance.transaction(['archivedTransactions'], 'readonly');
        const index = tx.objectStore('archivedTransactions').index('accountId');
        const request = index.getAll(accountId);

        request.onsuccess = () => {
            const blocks = request.result || [];
            this.els.historyList.innerHTML = '';
            const allTxs = blocks.flatMap(b => b.transactions).sort((a,b) => b.date - a.date);
            
            if(!allTxs.length) this.els.historyList.innerHTML = '<p>No archives.</p>';

            allTxs.forEach(tx => {
                const row = Utils.createElement('div', { className: 'transaction', style: {opacity:'0.8'} }, [
                    Utils.createElement('span', { textContent: Utils.formatDate(tx.date) + ' - ' + (tx.note || 'Unknown') }),
                    Utils.createElement('div', { style: {display:'flex', alignItems:'center'} }, [
                        Utils.createElement('span', { className: `amount ${tx.amount<0?'negative':''}`, textContent: Utils.formatCurrency(tx.amount) }),
                        Utils.createElement('button', {
                            className: 'btn-secondary', textContent: 'Edit', style: {padding:'2px 8px', fontSize:'0.7rem', marginLeft:'10px'},
                            onclick: () => this.showArchiveEditModal(accountId, tx)
                        })
                    ])
                ]);
                this.els.historyList.appendChild(row);
            });
        };
    }
loadPluginIntoStudio(plugin) {
    this.hideModal(this.els.pluginModal);
    if (this.studio) {
        this.studio.loadPlugin(plugin);
    }
}
    showArchiveEditModal(accountId, tx) {
        this.els.editTxTitle.textContent = `Edit Archived Tx`;
        this.els.editTxAmount.value = (Math.abs(tx.amount) / 100).toFixed(2);
        this.els.editTxDate.value = new Date(tx.date).toISOString().slice(0, 16);
        this.els.editTxNote.value = tx.note || '';
        this.els.editTxDate.disabled = true;

        this.els.editTxSave.onclick = async () => {
            const newAmount = Utils.parseToCents(this.els.editTxAmount.value) * (Math.sign(tx.amount) || -1);
            const newNote = this.els.editTxNote.value;
            try {
                await this.state.editArchivedTransaction(accountId, tx.id, newAmount, newNote);
                this.hideModal(this.els.editTxModal);
                Toaster.show("Archive patched.", "success");
                this.showArchiveModal(accountId);
                this.render();
            } catch (err) { Toaster.show(err.message, "error"); }
        };
        this.showModal(this.els.editTxModal);
    }

    showPluginModal() {
        this.renderPluginList();
        this.showModal(this.els.pluginModal, 'Manage Extensions');
    }

async renderPluginList() {
        this.els.pluginList.innerHTML = '';
        const installed = await this.db.getAll('installed_plugins'); // [cite: 2287]
        
        if (installed.length === 0) {
            this.els.pluginList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary)">No extensions installed.</div>';
            return;
        }

        installed.forEach(p => {
            const isSigned = !!p.signerId;
            const statusIcon = isSigned ? '✅ Signed' : '⚠️ Unsigned';
            const statusColor = isSigned ? '#10b981' : '#f59e0b';

            const row = Utils.createElement('div', { 
                className: 'scheduled-item', 
                style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '10px' }
            }, [
                Utils.createElement('div', {}, [
                    Utils.createElement('strong', { textContent: p.name }),
                    Utils.createElement('div', { 
                        textContent: statusIcon, 
                        style: { fontSize:'0.75rem', color: statusColor, fontWeight: 'bold' } 
                    })
                ]),
 
                Utils.createElement('div', { style: {display:'flex', gap:'5px'} }, [
                    // --- NEW: EDIT BUTTON ---
                    Utils.createElement('button', {
                        className: 'btn-secondary',
                        textContent: '✏️',
                        title: 'Edit in Studio',
                        style: { padding: '4px 8px' },
                        onclick: (e) => {
                            e.stopPropagation();
                            this.loadPluginIntoStudio(p); // Call new helper
                        }
                    }),
                    // ------------------------

                    Utils.createElement('button', { 
                        className: 'btn-secondary', 
                        textContent: '💾',
                        title: 'Download .zdp',
                        style: { padding: '4px 8px' },
                        onclick: async (e) => {
                            e.stopPropagation();
                            // Allow export even if unsigned (it just exports raw code wrapped in JSON)
                            await window.app.plugins.exportPluginPackage(p.id);
                        }
                    }),
                    Utils.createElement('button', { 
                        className: 'btn-danger', 
                        textContent: 'Delete',
                        style: { padding: '4px 10px', fontSize: '0.8rem' },
                        onclick: (e) => {
                            e.stopPropagation();
                            this.showConfirmModal(
                                `Delete ${p.name}?`, 
                                "This will permanently remove the extension.",
                                async () => {
                                    await this.db.delete('installed_plugins', p.id);
                                    this.renderPluginList();
                                    if(p.active) {
                                        setTimeout(() => {
                                            this.showConfirmModal(
                                                "Reload Required", 
                                                "App must reload to fully unload the plugin code.",
                                                () => location.reload()
                                            );
                                        }, 300);
                                    } else {
                                        Toaster.show("Extension deleted", "success");
                                    }
                                }
                            );
                        }
                    })
                ])
            ]);
            this.els.pluginList.appendChild(row);
        });
    }

    async handlePluginUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const plugin = await window.app.plugins.installPlugin(file);
            Toaster.show(`Extension "${plugin.name}" installed! Reloading...`, 'success');
            setTimeout(() => location.reload(), 1000);
        } catch (err) {
            Toaster.show('Error: ' + err.message, 'error');
            console.error(err);
        }
        e.target.value = '';
    }

    handleExport() {
        const data = {
            currentMonth: this.state.data.currentMonth,
            months: Object.fromEntries(this.state.data.months),
            envelopes: Array.from(this.state.data.envelopes.values()).map(e => ({ ...e })),
            accounts: Array.from(this.state.data.accounts.values()).map(a => ({ ...a })),
            scheduled: Array.from(this.state.data.scheduled.values()).map(s => ({ ...s }))
        };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'budget.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        this.showConfirmModal('Restore Backup?', 'Replace all data?', () => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!data.envelopes || !data.accounts || !data.months) throw new Error('Invalid backup');
                    
                    const db = this.db.instance;
                    const tx1 = db.transaction(['envelopes', 'accounts', 'scheduled', 'months', 'appState'], 'readwrite');
                    ['envelopes', 'accounts', 'scheduled', 'months', 'appState'].forEach(s => tx1.objectStore(s).clear());
                    await new Promise((res, rej) => { tx1.oncomplete = res; tx1.onerror = rej; });

                    const tx2 = db.transaction(['envelopes', 'accounts', 'scheduled', 'months', 'appState'], 'readwrite');
                    data.envelopes.forEach(i => tx2.objectStore('envelopes').put(i));
                    data.accounts.forEach(i => tx2.objectStore('accounts').put(i));
                    (data.scheduled || []).forEach(i => tx2.objectStore('scheduled').put(i));
                    
                    const months = Array.isArray(data.months) ? data.months : Object.values(data.months);
                    months.forEach(i => tx2.objectStore('months').put(i));
                    tx2.objectStore('appState').put({ id: 'main', currentMonth: data.currentMonth || new Date().toISOString().slice(0,7) });
                    
                    await new Promise((res, rej) => { tx2.oncomplete = res; tx2.onerror = rej; });
                    
                    Toaster.show('Restored. Reloading...', 'success');
                    setTimeout(() => location.reload(), 1000);
                } catch (err) { Toaster.show('Import failed: ' + err.message, 'error'); }
            };
            reader.readAsText(file);
        });
        e.target.value = null;
    }

    async handleShowImportMapper(event) {
        const file = event.target.files[0];
        if (!file) return;
        const accountId = this.els.importAccountId.value;
        if (!accountId) return Toaster.show('Context lost', 'error');

        try {
            const { headers, data } = await Utils.parseCSV(file);
            this._importData = data;
            
            const selects = [this.els.mapColDate, this.els.mapColPayee, this.els.mapColAmount, this.els.mapColDebit, this.els.mapColCredit];
            selects.forEach(sel => {
                sel.innerHTML = '<option value="">-- Select --</option>';
                headers.forEach(h => sel.appendChild(Utils.createElement('option', { value: h, textContent: h })));
            });
            this.showModal(this.els.importMapModal);
        } catch (err) { Toaster.show(err.message, 'error'); }
        event.target.value = null;
    }

    async handleProcessImport() {
        const map = {
            date: this.els.mapColDate.value,
            payee: this.els.mapColPayee.value,
            amount: this.els.mapColAmount.value,
            debit: this.els.mapColDebit.value,
            credit: this.els.mapColCredit.value
        };
        const accountId = this.els.importAccountId.value;
        if (!map.date || !map.payee) return Toaster.show('Date and Payee required', 'info');
        if (!map.amount && (!map.debit || !map.credit)) return Toaster.show('Amount columns required', 'info');

        this.hideModal(this.els.importMapModal);
        this.els.importPreviewList.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px;">Analyzing...</td></tr>';
        if (this.els.importPreviewConfirm) {
            this.els.importPreviewConfirm.disabled = true;
            this.els.importPreviewConfirm.textContent = 'Processing...';
        }
        this.showModal(this.els.importPreviewModal, 'Analyzing...');

        const rawTxs = [];
        for (const row of this._importData) {
            let cents = 0;
            if (map.amount) cents = Utils.parseToCents(row[map.amount]);
            else {
                const d = Utils.parseToCents(row[map.debit]);
                const c = Utils.parseToCents(row[map.credit]);
                cents = (c > 0) ? c : -Math.abs(d);
            }
            if (cents === 0) continue;
            
            const payee = row[map.payee] || 'Unknown';
            const date = Utils.parseDate(row[map.date]);
            
            const isDupe = this.state.getAccount(accountId).transactions.some(t => t.amount === cents && t.date === date.getTime() && t.note === payee);
            if (isDupe) continue;

            if (date) rawTxs.push({ id: Utils.generateId(), date: date.toISOString(), payee, amount: cents });
        }

        try {
            const { categorizedTxs, uncategorizedTxs, clusters } = await this.state.analyzeImport(rawTxs);
            this._buildImportPreview(categorizedTxs, uncategorizedTxs, clusters);
            if (this.els.importPreviewConfirm) {
                this.els.importPreviewConfirm.disabled = false;
                this.els.importPreviewConfirm.textContent = 'Import';
            }
        } catch (err) { 
            this.els.importPreviewList.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`;
        }
    }

    _buildImportPreview(categorized, uncategorized, clusters) {
        this.els.importPreviewList.innerHTML = '';
        this._importTransactions = [];
        
        const jarOpts = [
            Utils.createElement('option', { value: '', textContent: '--- Uncategorized ---' }),
            ...Array.from(this.state.data.envelopes.values())
                        .filter(e => !e.deleted) 
                        .map(e => Utils.createElement('option', { value: e.id, textContent: e.name }))
                ];

        clusters.forEach(c => {
            this.els.importPreviewList.appendChild(Utils.createElement('tr', { style: {backgroundColor: 'var(--accent-light)'} }, [
                Utils.createElement('td', { textContent: `Found ${c.txs.length} for "${c.name}"`, style: {fontWeight:'bold'} }),
                Utils.createElement('td', { textContent: 'New Jar?' }),
                Utils.createElement('td'),
                Utils.createElement('td', {}, [
                    Utils.createElement('select', { className: 'import-cluster-select', dataset: { clusterName: c.name } }, [
                        ...jarOpts.map(o => o.cloneNode(true)),
                        Utils.createElement('option', { value: '---NEW---', textContent: `Create: "${c.name}"` })
                    ])
                ])
            ]));
        });

        [...categorized, ...uncategorized].forEach(tx => {
            if (clusters.some(c => c.name === tx.predictedJarId)) return;
            this._importTransactions.push(tx);
            
            const select = Utils.createElement('select', { className: 'import-jar-select', dataset: { txId: tx.id } }, jarOpts.map(o => o.cloneNode(true)));
            select.value = tx.predictedJarId || '';
            
            this.els.importPreviewList.appendChild(Utils.createElement('tr', {}, [
                Utils.createElement('td', { textContent: new Date(tx.date).toLocaleDateString() }),
                Utils.createElement('td', { textContent: tx.payee }),
                Utils.createElement('td', { textContent: Utils.formatCurrency(tx.amount) }),
                Utils.createElement('td', {}, [select])
            ]));
        });
    }

    async handleConfirmImport() {
        const btn = this.els.importPreviewConfirm;
        if(btn) btn.disabled = true;
        await new Promise(r => setTimeout(r, 50));

        const accountId = this.els.importAccountId.value;
        const clusterMap = new Map();
        document.querySelectorAll('.import-cluster-select').forEach(s => clusterMap.set(s.dataset.clusterName, s.value));
        const overrideMap = new Map();
        document.querySelectorAll('.import-jar-select').forEach(s => overrideMap.set(s.dataset.txId, s.value));
        
        const jarUpdates = new Map();

        try {
            for (const [name, val] of clusterMap.entries()) {
                if (val === '---NEW---') {
                    const jar = new Envelope({ name });
                    await this.state.addEnvelope(jar);
                    jarUpdates.set(name, jar.id);
                } else if (val) {
                    jarUpdates.set(name, val);
                } else {
                    jarUpdates.set(name, null);
                }
            }

            const batch = this._importTransactions.map(tx => {
                let jarId = tx.predictedJarId;
                if (jarUpdates.has(jarId)) jarId = jarUpdates.get(jarId);
                if (overrideMap.has(tx.id)) jarId = overrideMap.get(tx.id) || null;
                
                return { date: tx.date, note: tx.payee, amount: tx.amount, jarId };
            });

            await this.state.batchImportTransactions(accountId, batch);
            Toaster.show(`Imported ${batch.length} transactions.`, 'success');
            this.hideModal(this.els.importPreviewModal);
            this.showAccountHistory(accountId);
            this.render();
        } catch (err) { Toaster.show(err.message, 'error'); }
        
        this._importData = null;
        if(btn) btn.disabled = false;
    }

    handleAddScheduled(e) {
        e.preventDefault();
        const name = this.els.scheduledNameEl.value.trim();
        const amount = Utils.parseToCents(this.els.scheduledAmountEl.value);
        const freq = this.els.scheduledFrequencyEl.value;
        const envId = this.els.scheduledEnvelope.value || null;
        const accId = this.els.scheduledAccount.value;
        const date = this.els.scheduledDateEl.value || new Date().toISOString().split('T')[0];
        const type = this.els.scheduledType.value;

        if (!name || amount <= 0 || !accId) return Toaster.show('Required fields missing', 'error');
        
        const s = new ScheduledTransaction({ name, amount, envelopeId: envId, accountId: accId, date, frequency: freq, type });
        this.state.addScheduled(s).then(() => {
            this.els.addScheduledForm.reset();
            this.renderScheduled();
        }).catch(err => Toaster.show(err.message, 'error'));
    }

    handleEditScheduled(id) {
        const s = this.state.getScheduled(id);
        if (!s) return;
        this.els.editScheduledId.value = s.id;
        this.els.editScheduledName.value = s.name;
        this.els.editScheduledAmount.value = (s.amount / 100).toFixed(2);
        this.els.editScheduledFrequency.value = s.frequency;
        this.els.editScheduledEnvelope.value = s.envelopeId || "";
        this.els.editScheduledAccount.value = s.accountId;
        this.els.editScheduledDate.value = s.date;
        this.els.editScheduledType.value = s.type || 'expense';
        this.showModal(this.els.editScheduledModal);
    }

    async handleEditScheduledSave() {
        const data = {
            id: this.els.editScheduledId.value,
            name: this.els.editScheduledName.value.trim(),
            amount: Utils.parseToCents(this.els.editScheduledAmount.value),
            frequency: this.els.editScheduledFrequency.value,
            envelopeId: this.els.editScheduledEnvelope.value || null,
            accountId: this.els.editScheduledAccount.value,
            date: this.els.editScheduledDate.value,
            type: this.els.editScheduledType.value
        };
        try {
            await this.state.updateScheduled(data.id, data);
            this.hideModal(this.els.editScheduledModal);
            this.renderScheduled();
        } catch (err) { Toaster.show(err.message, 'error'); }
    }

    handleDeleteScheduled(id) {
        this.showConfirmModal('Delete Bill?', 'Remove this scheduled transaction?', () => {
            this.state.deleteScheduled(id).then(() => this.renderScheduled());
        });
    }

    handleAddAccount(e) {
        if (e) e.preventDefault();
        const name = this.els.newAccountNameEl.value.trim();
        const type = this.els.newAccountTypeEl.value;
        const currency = document.getElementById('new-account-currency')?.value || 'AUD';  // ADD
        const balance = Math.round(parseFloat(this.els.initialBalanceEl.value || 0) * 100);
        
        const acc = new Account({ name, balance, type, currency });  // ADD currency
        this.state.addAccount(acc).then(() => {
            this.els.addAccountForm.reset();
            this.renderAccounts();
            this.render();
        }).catch(err => Toaster.show(err.message, 'error'));
    }

    handleAddEnvelope(e, isMobile = false) {
        if(e) e.preventDefault();
        const input = isMobile ? this.els.mobileNewJarName : this.els.newEnvelopeNameEl;
        const name = input.value.trim();
        if (!name) return Toaster.show('Name required', 'error');
        
        const env = new Envelope({ name });
        this.state.addEnvelope(env).then(() => {
            input.value = '';
            if(isMobile) this.hideModal(this.els.addJarModal);
            this.render();
        }).catch(err => Toaster.show(err.message, 'error'));
    }

showAddIncomeModal() {
        this.els.amountModalTitle.textContent = "Add Income";
        this._configureAmountModal({ showJar: false, showAcc: true, showSplit: false });
        this._populateAccountSelect(this.els.paymentAccount, true);
        this.els.modalDate.valueAsDate = new Date();
        
        this.els.modalConfirm.onclick = async () => {
            const amt = Utils.parseToCents(this.els.modalAmount.value);
            const acc = this.els.paymentAccount.value;
            const note = this.els.modalNote.value;

            // Check for future date - redirect to scheduled transaction
            if (this._isFutureDate()) {
                this.hideModal(this.els.amountModal);
                this._openScheduledWithData({
                    amount: amt,
                    note,
                    accountId: acc,
                    date: this.els.modalDate.value,
                    isIncome: true
                });
                return;
            }

            const date = this._getSelectedDate();
            
            try {
                await this.state.addIncome(amt, note, acc, date);
                this.hideModal(this.els.amountModal);
                this.render();
            } catch (e) { Toaster.show(e.message, 'error'); }
        };
        this.showModal(this.els.amountModal);
    }

    async changeMonth(delta) {
        await this.state.changeMonth(delta);
        this.render();
    }

    handleLock() {
        if (this.state.data.pinHash) {
            this.state.data.locked = true;
            this.showPinLock(true);
        } else {
            this.showPinLock(false);
        }
    }

    showPinLock(isUnlock = true) {
        const lock = this.els.pinLock;
        const title = document.getElementById('pin-title');
        const input = this.els.pinInput;
        const submit = this.els.pinSubmit;
        const forgot = document.getElementById('pin-forgot');
        
        lock.style.display = 'flex';
        lock.classList.add('active');
        input.value = '';
        input.focus();

        if (isUnlock) {
            title.textContent = "Enter PIN";
            submit.textContent = "Unlock";
            forgot.style.display = "block";
            submit.onclick = () => this.handlePinSubmit();
            forgot.onclick = () => this.handlePinForgot();
        } else {
            title.textContent = "Set New PIN";
            submit.textContent = "Save PIN";
            forgot.style.display = "none";
            submit.onclick = async () => {
                const pin = input.value;
                if (pin.length !== 4) return Toaster.show("4 digits required", 'error');
                
                if (localStorage.getItem('zerodollars_sync_enc_key') && !window.app?.simpleSync?.syncKey) {
                    const old = await this.askForPin("Security Check", "Enter OLD PIN to rotate keys.");
                    if(!old) return;
                    await window.app.simpleSync.unlockSync(old);
                }

                await PinManager.setPin(pin, this.db);
                if (window.app?.simpleSync?.syncKey) await window.app.simpleSync.saveKey(pin);
                
                Toaster.show("PIN Set!", "success");
                this.state.data.pinHash = true;
                this.state.data.locked = true;
                this.showPinLock(true);
            };
        }
        input.onkeyup = (e) => { if(e.key==='Enter' || input.value.length===4) submit.click(); };
    }

    async handlePinSubmit() {
        const pin = this.els.pinInput.value;
        try {
            if (await PinManager.checkPin(pin, this.db)) {
                this.state.data.locked = false;
                this.els.pinLock.style.display = 'none';
                this.els.pinLock.classList.remove('active');
                if (window.app?.simpleSync) window.app.simpleSync.unlockSync(pin);
            } else {
                throw new Error("Wrong PIN");
            }
        } catch (e) {
            this.els.pinInput.classList.add('shake-anim');
            setTimeout(() => this.els.pinInput.classList.remove('shake-anim'), 300);
        }
    }

    async handlePinForgot() {
        if (confirm("Reset PIN and unlock? Removes security.")) {
            await PinManager.removePin(this.db);
            this.state.data.locked = false;
            this.state.data.pinHash = null;
            this.els.pinLock.style.display = 'none';
        }
    }

    askForPin(title, desc) {
        return new Promise(resolve => {
            const input = Utils.createElement('input', { type: 'password', maxLength: 4, className: 'pin-input', style: {fontSize:'1.5rem', textAlign:'center', marginTop:'15px'} });
            const confirm = Utils.createElement('button', { className: 'btn-primary', textContent: 'Verify' });
            const cancel = Utils.createElement('button', { className: 'btn-secondary', textContent: 'Cancel' });
            const actions = Utils.createElement('div', { className: 'modal-actions', style: {marginTop:'20px', display:'flex', gap:'10px'} }, [cancel, confirm]);
            const modal = Utils.createElement('div', { className: 'modal active', style: {zIndex:3000} }, [
                Utils.createElement('div', { className: 'modal-content' }, [
                    Utils.createElement('h3', { textContent: title }),
                    Utils.createElement('p', { textContent: desc }),
                    input, actions
                ])
            ]);
            
            const cleanup = () => modal.remove();
            confirm.onclick = () => { cleanup(); resolve(input.value); };
            cancel.onclick = () => { cleanup(); resolve(null); };
            document.body.appendChild(modal);
            setTimeout(() => input.focus(), 50);
        });
    }

    handleThemeToggle() {
        const body = document.body;
        const current = body.dataset.theme || 'light';
        const newTheme = current === 'dark' ? 'light' : 'dark';
        body.dataset.theme = newTheme;
        document.getElementById('theme-toggle').textContent = newTheme === 'dark' ? '☀️' : '🌙';
        this.db.put('settings', { id: 'theme', value: newTheme });
    }

    async handleSmartFund() {
        try {
            const { totalFunded, skippedBills } = await this.state.smartFund();
            this.render();
            let msg = `Funded ${Utils.formatCurrency(totalFunded)}`;
            if (skippedBills.length) msg += `. Skipped ${skippedBills.length} unlinked bills.`;
            Toaster.show(msg, skippedBills.length ? 'info' : 'success');
        } catch (e) { Toaster.show(e.message, 'error'); }
    }

    handleDetectRecurring() {
        this.activeView.showSuggestions?.(this.state);
    }

    handleMagicProcessing() {
        // 1. Prevent Double-Firing (Enter + Click race condition)
        if (this._magicLock) return;
        this._magicLock = true;
        setTimeout(() => this._magicLock = false, 500);

        const input = document.getElementById('magic-input');
        const raw = input.value.trim();
        if(!raw) return;

        console.log("✨ Magic Input:", raw);

        const amtMatch = raw.match(/(?:\$)?(\d+(\.\d{1,2})?)|\.(\d{1,2})/);
        if(!amtMatch) return Toaster.show("No amount found", 'error');
        
        const amount = Utils.parseToCents(amtMatch[0].replace('$',''));
        let note = raw.replace(amtMatch[0], '').trim();
        note = note.replace(/^(at|for|in|on)\s+/i, '');
        if(!note) note = "Quick Spend";

        // Clear input now
        input.value = '';
        input.blur();

       
        const envelopes = Array.from(this.state.data.envelopes.values()).filter(e => !e.deleted);
        
        const jarId = MLManager.predictJarUnified(note, this.state.data.naiveBayesModel, envelopes);
        
        console.log("✨ Predicted Jar ID:", jarId);

        this.hideModal(this.els.magicModal);
        
        this.els.amountModalTitle.textContent = "Confirm Spend";
        
        // 2. Configure Modal (Reset selects)
        this._configureAmountModal({ showJar: true, showAcc: true, showSplit: true });
        
        // 3. Set Fields
        this.els.modalDate.valueAsDate = new Date();
        this.els.modalAmount.value = (amount/100).toFixed(2);
        this.els.modalNote.value = note;
        
        // 4. Set Jar Selection
        if (jarId) {
            const env = this.state.getEnvelope(jarId);
            if (env) {
                console.log("✨ Setting selection to:", env.name);
                this.els.modalJar.value = jarId;
                Toaster.show(`✨ Categorized: ${env.name}`, 'success');
            } else {
                console.warn("✨ Predicted ID not found in envelopes map.");
                this.els.modalJar.value = "";
            }
        } else {
            this.els.modalJar.value = "";
        }

        // 5. Update Confirm Button
        this.els.modalConfirm.onclick = () => this.confirmLogSpend(this.els.modalJar.value);
        
        this.showModal(this.els.amountModal);
    }

    setupMobileUI() {
        const fab = document.getElementById('fab-add-btn');
        if(fab) fab.addEventListener('click', () => this.showModal(this.els.creationModal));
        
        const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
        
        bind('fab-action-transaction', () => { this.hideModal(this.els.creationModal); this.handleGenericTransaction(); });
        bind('fab-action-jar', () => { this.hideModal(this.els.creationModal); this.showModal(this.els.addJarModal); });
        bind('fab-action-bill', () => { 
            this.hideModal(this.els.creationModal); 
            this._populateAccountSelect(this.els.mobSchedAcc);
            this._updateSelects(); 
            this.showModal(this.els.addScheduledMobileModal); 
        });
        bind('fab-action-account', () => { this.hideModal(this.els.creationModal); this.showModal(this.els.addAccountModal); });
        bind('fab-action-magic', () => { 
            this.hideModal(this.els.creationModal); 
            this.showModal(this.els.magicModal);
            setTimeout(() => document.getElementById('magic-input')?.focus(), 100);
        });

        bind('mobile-add-jar-btn', () => this.handleAddEnvelope(null, true));
        bind('mobile-add-account-btn', () => {
            this.els.newAccountNameEl.value = this.els.mobileAccountName.value;
            this.els.initialBalanceEl.value = this.els.mobileAccountBalance.value;
            this.els.newAccountTypeEl.value = this.els.mobileAccountType.value;
            this.handleAddAccount();
            this.hideModal(this.els.addAccountModal);
        });
        bind('mob-sched-save', () => this.handleMobileAddScheduled());
        bind('magic-process', () => this.handleMagicProcessing());
        document.getElementById('magic-input')?.addEventListener('keypress', e => { if(e.key==='Enter') this.handleMagicProcessing(); });
    }

    handleGenericTransaction() {
        this.els.amountModalTitle.textContent = 'Add Transaction';
        this._configureAmountModal({ showJar: true, showAcc: true, showSplit: true });
        this.els.modalJar.value = "";
        this.els.modalConfirm.onclick = () => this.confirmLogSpend(this.els.modalJar.value);
        this.showModal(this.els.amountModal);
    }

    handleMobileAddScheduled() {
        const name = this.els.mobSchedName.value.trim();
        const amount = Utils.parseToCents(this.els.mobSchedAmount.value);
        const freq = this.els.mobSchedFreq.value;
        const env = this.els.mobSchedEnv.value || null;
        const acc = this.els.mobSchedAcc.value;
        const date = this.els.mobSchedDate.value || new Date().toISOString().split('T')[0];
        const type = this.els.mobSchedType.value;

        if (!name || amount <= 0 || !acc) return Toaster.show('Required fields missing', 'error');
        const s = new ScheduledTransaction({ name, amount, envelopeId: env, accountId: acc, date, frequency: freq, type });
        this.state.addScheduled(s).then(() => {
            this.hideModal(this.els.addScheduledMobileModal);
            this.renderScheduled();
        }).catch(e => Toaster.show(e.message, 'error'));
    }

    _cacheGlobalElements() {
        const get = (id) => document.getElementById(id);
        return {
            tbbAmount: get('tbb-amount'),
            currentMonth: get('current-month'),
            scheduledList: get('scheduled-list'),
            
            amountModal: get('amount-modal'),
            amountModalTitle: get('modal-title'),
            modalAmount: get('modal-amount'),
            modalDate: get('modal-date'),
            modalNote: get('modal-note'),
            modalJar: get('modal-jar'),
            paymentAccount: get('payment-account'),
            enableSplit: get('enable-split'),
            splitSection: get('split-section'),
            splitsList: get('splits-list'),
            modalConfirm: get('modal-confirm'),
            
            //zaps
            zapModal: document.getElementById('zap-modal'),
            zapQr: document.getElementById('zap-qr'),
            zapAmount: document.getElementById('zap-amount'),
            zapString: document.getElementById('zap-string'),
            btnCopyInvoice: document.getElementById('btn-copy-invoice'),
            btnCheckPayment: document.getElementById('btn-check-payment'),
            
            // Plugins & Dev Mode
            pluginBtn: get('plugins-btn'),
            pluginModal: get('plugin-modal'),
            pluginList: get('plugin-list'),
            pluginFileInput: get('plugin-file-input'),
            pluginUploadBtn: get('btn-upload-plugin'),
            btnOpenStudio: get('btn-open-studio'),
            pluginCreatorModal: get('plugin-creator-modal'),
            btnTestPlugin: get('btn-test-plugin'),
            btnCompilePlugin: get('btn-compile-plugin'),
            btnRegenIdentity: get('btn-regen-identity'),
            btnPublishPlugin: document.getElementById('btn-publish-plugin'),
            
            accTransferModal: get('account-transfer-modal'),
            accTransFrom: get('acc-trans-from'),
            accTransTo: get('acc-trans-to'),
            accTransAmount: get('acc-trans-amount'),
            accTransNote: get('acc-trans-note'),
            accTransConfirm: get('acc-trans-confirm'),
            accTransCancel: get('acc-trans-cancel'),
            
            confirmModal: get('confirm-modal'),
            confirmTitle: get('confirm-title'),
            confirmDesc: get('confirm-description'),
            confirmYes: get('confirm-yes'),
            btnConfirmCancel: get('confirm-cancel'),
            
            transferModal: get('transfer-modal'),
            transferFrom: get('transfer-from'),
            transferTo: get('transfer-to'),
            transferAmount: get('transfer-amount'),
            transferNote: get('transfer-note'),
            newAccountCurrencyEl: get('new-account-currency'),
            mobileAccountCurrency: get('mobile-account-currency'),
            reconcileModal: get('reconcile-modal'),
            reconcileAmount: get('reconcile-amount'),
            
            importMapModal: get('import-map-modal'),
            mapColDate: get('map-col-date'),
            mapColPayee: get('map-col-payee'),
            mapColAmount: get('map-col-amount'),
            mapColDebit: get('map-col-debit'),
            mapColCredit: get('map-col-credit'),
            
            importPreviewModal: get('import-preview-modal'),
            importPreviewList: get('import-preview-list'),
            importPreviewConfirm: get('import-preview-confirm'),
            importAccountId: get('import-account-id'),
            
            editModal: get('edit-modal'),
            editTxModal: get('edit-tx-modal'),
            editTxTitle: get('edit-tx-title'),
            editTxAmount: get('edit-tx-amount'),
            editTxDate: get('edit-tx-date'),
            editTxNote: get('edit-tx-note'),
            editTxSave: get('edit-tx-save'),
            
            historyModal: get('history-modal'),
            historyList: get('history-list'),
            historyTitle: get('history-title'),
            
            coverModal: get('cover-modal'),
            coverToName: get('cover-to-name'),
            coverFrom: get('cover-from'),
            coverAmount: get('cover-amount'),
            coverNote: get('cover-note'),
            
            reassignModal: get('reassign-modal'),
            reassignTxDetails: get('reassign-tx-details'),
            reassignJarSelect: get('reassign-jar-select'),
            reassignConfirm: get('reassign-confirm'),
            
            pinLock: get('pin-lock'),
            pinInput: get('pin-input'),
            pinSubmit: get('pin-submit'),
            
            addEnvelopeForm: get('add-envelope-form'),
            newEnvelopeNameEl: get('new-envelope-name'),
            addAccountForm: get('add-account-form'),
            newAccountNameEl: get('new-account-name'),
            initialBalanceEl: get('initial-balance'),
            newAccountTypeEl: get('new-account-type'),
            addScheduledForm: get('add-scheduled-form'),
            scheduledNameEl: get('scheduled-name'),
            scheduledAmountEl: get('scheduled-amount'),
            scheduledFrequencyEl: get('scheduled-frequency'),
            scheduledEnvelope: get('scheduled-envelope'),
            scheduledAccount: get('scheduled-account'),
            scheduledDateEl: get('scheduled-date'),
            scheduledType: get('scheduled-type'),
            
            creationModal: get('creation-modal'),
            addJarModal: get('add-jar-modal'),
            mobileNewJarName: get('mobile-new-jar-name'),
            addAccountModal: get('add-account-modal'),
            mobileAccountName: get('mobile-account-name'),
            mobileAccountBalance: get('mobile-account-balance'),
            mobileAccountType: get('mobile-account-type'),
            addScheduledMobileModal: get('add-scheduled-mobile-modal'),
            mobSchedName: get('mob-sched-name'),
            mobSchedAmount: get('mob-sched-amount'),
            mobSchedFreq: get('mob-sched-frequency'),
            mobSchedEnv: get('mob-sched-envelope'),
            mobSchedAcc: get('mob-sched-account'),
            mobSchedDate: get('mob-sched-date'),
            mobSchedType: get('mob-sched-type'),
            magicModal: get('magic-modal'),
            
            editScheduledModal: get('edit-scheduled-modal'),
            editScheduledId: get('edit-scheduled-id'),
            editScheduledName: get('edit-scheduled-name'),
            editScheduledAmount: get('edit-scheduled-amount'),
            editScheduledFrequency: get('edit-scheduled-frequency'),
            editScheduledEnvelope: get('edit-scheduled-envelope'),
            editScheduledAccount: get('edit-scheduled-account'),
            editScheduledDate: get('edit-scheduled-date'),
            editScheduledType: get('edit-scheduled-type'),
            
            // Tax Report Modal
            taxReportModal: get('tax-report-modal'),
            taxReportAccount: get('tax-report-account'),
            taxReportFY: get('tax-report-fy'),
            taxReportSummary: get('tax-report-summary'),
            taxSummaryContent: get('tax-summary-content'),
            taxReportEmpty: get('tax-report-empty'),
            taxReportCancel: get('tax-report-cancel'),
            taxReportPreview: get('tax-report-preview'),
            taxReportDownload: get('tax-report-download'),
            
            envelopeSelects: document.querySelectorAll('#modal-jar, #transfer-from, #transfer-to, #scheduled-envelope, #edit-scheduled-envelope, #mob-sched-envelope, #cover-from'),
            accountSelects: document.querySelectorAll('#payment-account, #scheduled-account, #edit-scheduled-account, #mob-sched-account')
        };
    }

    _bindGlobalEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleTabSwitch(e.target.dataset.tab));
        });

        if (this.els.confirmYes) {
            this.els.confirmYes.addEventListener('click', () => {
                if (this.currentAction) this.currentAction();
                this.hideModal(this.els.confirmModal);
                this.currentAction = null;
            });
        }
        document.getElementById('confirm-cancel')?.addEventListener('click', () => this.hideModal(this.els.confirmModal));

        document.getElementById('add-income-btn')?.addEventListener('click', () => this.showAddIncomeModal());
        document.getElementById('prev-month')?.addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('next-month')?.addEventListener('click', () => this.changeMonth(1));
        document.getElementById('export-btn')?.addEventListener('click', () => this.handleExport());
        document.getElementById('import-file')?.addEventListener('change', (e) => this.handleImport(e));
        document.getElementById('lock-btn')?.addEventListener('click', () => this.handleLock());
        document.getElementById('theme-toggle')?.addEventListener('click', () => this.handleThemeToggle());
        document.getElementById('smart-fund-btn')?.addEventListener('click', () => this.handleSmartFund());
        document.getElementById('detect-recurring')?.addEventListener('click', () => this.handleDetectRecurring());
        document.getElementById('transfer-confirm')?.addEventListener('click', () => this.handleTransferConfirm());
        document.getElementById('cover-confirm')?.addEventListener('click', () => this.handleCoverConfirm());
        document.getElementById('reconcile-confirm')?.addEventListener('click', () => this.handleReconcileConfirm());

        this.els.addEnvelopeForm?.addEventListener('submit', (e) => this.handleAddEnvelope(e));
        this.els.addAccountForm?.addEventListener('submit', (e) => this.handleAddAccount(e));
        this.els.addScheduledForm?.addEventListener('submit', (e) => this.handleAddScheduled(e));
        
        this.els.importMapModal?.querySelector('.btn-secondary').addEventListener('click', () => this.hideModal(this.els.importMapModal));
        this.els.importMapModal?.querySelector('.btn-primary').addEventListener('click', () => this.handleProcessImport());
        this.els.importPreviewModal?.querySelector('.btn-secondary').addEventListener('click', () => this.hideModal(this.els.importPreviewModal));
        this.els.importPreviewConfirm?.addEventListener('click', () => this.handleConfirmImport());
        this.els.accTransConfirm?.addEventListener('click', () => this.handleAccountTransferConfirm());
        this.els.accTransCancel?.addEventListener('click', () => this.hideModal(this.els.accTransferModal));
        this.els.btnPublishPlugin?.addEventListener('click', () => this.handlePublishToStore());
        
        // Plugin events
        this.els.pluginBtn?.addEventListener('click', () => {
            document.getElementById('action-menu').classList.remove('show');
            this.showPluginModal();
        });
        this.els.pluginUploadBtn?.addEventListener('click', () => {
            this.els.pluginFileInput.click();
        });
        this.els.pluginFileInput?.addEventListener('change', (e) => {
            this.handlePluginUpload(e);
        });
        
        // Extension Studio Handlers
        this.els.btnOpenStudio?.addEventListener('click', () => {
            // Hide the main dropdown menu first
            document.getElementById('action-menu').classList.remove('show');
            // Open the IDE
            this.studio.show(); 
        });


        document.getElementById('import-csv-file')?.addEventListener('change', (e) => this.handleShowImportMapper(e));
        document.getElementById('edit-scheduled-save')?.addEventListener('click', () => this.handleEditScheduledSave());
        document.getElementById('edit-save')?.addEventListener('click', () => this.handleEditSave());
        document.getElementById('add-split')?.addEventListener('click', () => this._addSplitRow());
        
        document.getElementById('modal-date')?.addEventListener('change', () => {
            if (this._isFutureDate()) {
                Toaster.show('Future date — this will create a scheduled transaction', 'info');
            }
        });
        

        const closeIds = [
            'modal-cancel', 'transfer-cancel', 'cover-cancel', 'edit-cancel', 
            'edit-tx-cancel', 'edit-scheduled-cancel', 'reassign-cancel', 
            'reconcile-cancel', 'history-close', 'suggestions-close'
        ];

        closeIds.forEach(id => {
            document.getElementById(id)?.addEventListener('click', (e) => {
                this.hideModal(e.target.closest('.modal'));
            });
        });

        document.querySelectorAll('.modal-close').forEach(b => {
            b.addEventListener('click', (e) => this.hideModal(e.target.closest('.modal')));
        });
    // Allow dev to paste their nsec so they can receive money
        document.getElementById('btn-import-nsec')?.addEventListener('click', async () => {
            const nsec = prompt("Paste your nsec (starts with 'nsec1...'):\n\nEnsure this account has a Lightning Address set in its profile!");
            if(nsec) {
                try {
                    if(!window.NostrTools) throw new Error("Nostr lib missing");
                    const { data } = window.NostrTools.nip19.decode(nsec);
                    this.devPrivateKey = Utils.bytesToHex(data);
                    localStorage.setItem('dev_nsec_v1', nsec); // Save for future
                    this._updateDevIdentityDisplay();
                    Toaster.show("Identity Imported! You can now receive zaps.", "success");
                } catch(e) {
                    Toaster.show("Invalid nsec", "error");
                }
            }
        });
    }
    

    
    showZapModal(invoice, amountSats, onPaidCallback) {
        this.els.zapAmount.textContent = `${parseInt(amountSats).toLocaleString()} sats`;
        this.els.zapString.textContent = invoice.substring(0, 30) + '...';
        
        // Render QR (Using your existing QRCode lib)
        this.els.zapQr.innerHTML = '';
        new QRCode(this.els.zapQr, {
            text: invoice,
            width: 200,
            height: 200,
            correctLevel: QRCode.CorrectLevel.M
        });

        // Copy Handler
        this.els.btnCopyInvoice.onclick = async () => {
            await navigator.clipboard.writeText(invoice);
            Toaster.show("Invoice copied!", "success");
        };

        // "I Have Paid" Handler
        this.els.btnCheckPayment.onclick = () => {
            this.hideModal(this.els.zapModal);
            if (onPaidCallback) onPaidCallback();
        };

        this.showModal(this.els.zapModal);
    }
    async handlePublishToStore() {
    // A. Gather Data
    const name = document.getElementById('plugin-creator-name').value.trim();
    const desc = document.getElementById('plugin-creator-desc').value.trim();
    const price = document.getElementById('plugin-creator-price').value || '0';
    const category = document.getElementById('plugin-creator-category').value;
    const image = document.getElementById('plugin-creator-image').value.trim();
    const code = document.getElementById('plugin-creator-code').value;

    // B. Validation
    if (!name || !code) return Toaster.show("Name and Code are required", "error");
    if (!this.devPrivateKey) return Toaster.show("Please import a Key first", "error");

    const priceInt = parseInt(price);
    const isPaid = priceInt > 0;

    if (!confirm(`🚀 Publish "${name}" for ${isPaid ? priceInt + ' sats' : 'FREE'}?`)) return;

    try {
        Toaster.show("📦 Packaging & Signing...", "info");

        // C. Create the .zdp Blob (The Executable)
        [cite_start]// We use the existing helper from PluginSystem [cite: 396]
        const zdpBlob = await window.app.plugins.createSignedPackage(code, this.devPrivateKey);
        
        // Convert to Base64 Data URI for storage on Nostr
        const reader = new FileReader();
        reader.readAsDataURL(zdpBlob);
        
        reader.onloadend = async () => {
            const dataUri = reader.result; 
            
            // D. Construct the Listing Event (NIP-99 / Classifieds)
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const { finalizeEvent, getPublicKey, SimplePool } = window.NostrTools;
            
            const tags = [
                ['d', slug],                         // Unique identifier
                ['title', name],
                ['summary', desc],
                ['t', 'zerodollars-plugin'],         // Global Store Tag
                ['t', category],                     // Category Tag
                ['price', price, 'sats'],            // PRICE TAG (The Magic)
                ['resource', dataUri],               // The Code
            ];

            if (image) tags.push(['image', image]);

            const listingEvent = {
                kind: 30402, // Classified Listing Kind
                created_at: Math.floor(Date.now() / 1000),
                content: desc, // Description goes in content too for clients that don't parse tags
                tags: tags,
                pubkey: getPublicKey(this.devPrivateKey),
            };

            // E. Sign the Listing
            const signedListing = finalizeEvent(listingEvent, this.devPrivateKey);

            // F. Broadcast
            Toaster.show("📡 Broadcasting to Relays...", "info");
            const pool = new SimplePool();
            const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
            
            await Promise.any(pool.publish(RELAYS, signedListing));
            
            Toaster.show(`✅ Published! Check the Store tab.`, "success");
            
            // Force refresh the store view
            if(window.app.ui.views.marketplace) {
                window.app.ui.views.marketplace.isLoaded = false;
            }
        };

    } catch (e) {
        console.error(e);
        Toaster.show("Publish Error: " + e.message, "error");
    }
}
    
showTaxReportModal(accountId) {
    const account = this.state.getAccount(accountId);
    if (!account) return;
    
    this._taxReportAccountId = accountId;
    
    // Set account info
    this.els.taxReportAccount.textContent = `${account.name} (${account.currency})`;
    
    // Populate FY dropdown (last 5 years)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const defaultFY = currentMonth < 6 ? currentYear : currentYear + 1;
    
    this.els.taxReportFY.innerHTML = '';
    for (let fy = defaultFY; fy >= defaultFY - 4; fy--) {
        const opt = document.createElement('option');
        opt.value = fy;
        opt.textContent = `FY${fy - 1}-${fy} (Jul ${fy - 1} - Jun ${fy})`;
        this.els.taxReportFY.appendChild(opt);
    }
    
    // Reset state
    this.els.taxReportSummary.style.display = 'none';
    this.els.taxReportEmpty.style.display = 'none';
    this.els.taxReportDownload.disabled = true;
    this._taxReportData = null;
    
    this.showModal(this.els.taxReportModal);
}

previewTaxReport() {
    const accountId = this._taxReportAccountId;
    const fy = parseInt(this.els.taxReportFY.value);
    
    try {
        const report = this.state.generateTaxReport(accountId, fy);
        this._taxReportData = { accountId, fy, report };
        
        if (report.events.length === 0) {
            this.els.taxReportSummary.style.display = 'none';
            this.els.taxReportEmpty.style.display = 'block';
            this.els.taxReportDownload.disabled = true;
            return;
        }
        
        // Format currency helper
        const fmt = (cents) => {
            const val = cents / 100;
            const sign = val < 0 ? '-' : '';
            return `${sign}$${Math.abs(val).toFixed(2)}`;
        };
        
        // Build summary
        const s = report.summary;
        this.els.taxSummaryContent.innerHTML = `
            <div>Disposal Events:</div><div><strong>${report.events.length}</strong></div>
            <div>Total Proceeds:</div><div><strong>${fmt(s.totalProceeds)}</strong></div>
            <div>Total Cost Basis:</div><div><strong>${fmt(s.totalCostBasis)}</strong></div>
            <div>Gross Gain/Loss:</div><div style="color: ${s.totalGain >= 0 ? '#10b981' : '#ef4444'}"><strong>${fmt(s.totalGain)}</strong></div>
            <div>CGT Discount (50%):</div><div><strong>-${fmt(s.totalDiscount)}</strong></div>
            <div style="border-top: 1px solid var(--border); padding-top: 8px;">Net Taxable Gain:</div>
            <div style="border-top: 1px solid var(--border); padding-top: 8px; color: ${s.totalTaxable >= 0 ? '#10b981' : '#ef4444'}"><strong>${fmt(s.totalTaxable)}</strong></div>
        `;
        
        this.els.taxReportSummary.style.display = 'block';
        this.els.taxReportEmpty.style.display = 'none';
        this.els.taxReportDownload.disabled = false;
        
    } catch (e) {
        console.error('Tax report error:', e);
        Toaster.show(`Error: ${e.message}`, 'error');
    }
}

downloadTaxReport() {
    if (!this._taxReportData) return;
    
    const { accountId, fy } = this._taxReportData;
    
    try {
        this.state.downloadTaxCSV(accountId, fy);
        Toaster.show('Tax report downloaded', 'success');
        this.hideModal(this.els.taxReportModal);
    } catch (e) {
        Toaster.show(`Error: ${e.message}`, 'error');
    }
}
    _updateTBB() {
        const monthData = this.state.data.months.get(this.state.data.currentMonth);
        if (this.els.tbbAmount) {
            this.els.tbbAmount.textContent = Utils.formatCurrency(monthData?.tbb || 0);
            this.els.tbbAmount.className = (monthData?.tbb < 0) ? 'negative' : '';
        }
        if (this.els.currentMonth) {
            this.els.currentMonth.textContent = new Date(this.state.data.currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
    }

    _updateSelects() {
        const envs = Array.from(this.state.data.envelopes.values()).filter(e => !e.deleted);
        this.els.envelopeSelects.forEach(sel => {
            const val = sel.value;
            sel.innerHTML = '<option value="">Select Jar</option>';
            envs.forEach(env => sel.appendChild(Utils.createElement('option', { value: env.id, textContent: env.name })));
            sel.value = val;
        });
        this._populateAccountSelect(null);
    }

    _populateAccountSelect(targetSelect, excludeCredit = false) {
        const accs = Array.from(this.state.data.accounts.values()).filter(a => a.status === 'open' && !a.deleted);
        const targets = targetSelect ? [targetSelect] : this.els.accountSelects;
        targets.forEach(sel => {
            const val = sel.value;
            sel.innerHTML = '<option value="">Select Account</option>';
            accs.forEach(acc => {
                if (excludeCredit && acc.type === 'credit') return;
                sel.appendChild(Utils.createElement('option', { value: acc.id, textContent: acc.name }));
            });
            sel.value = val;
        });
    }

_renderScheduled() {
        if (!this.els.scheduledList) return;
        this.els.scheduledList.innerHTML = '';

        // [MODIFIED] Use stored date (s.date) instead of s.nextDate() to preserve "Overdue" status
        const items = Array.from(this.state.data.scheduled.values())
            .filter(s => !s.deleted)
            .map(s => {
                // Create date object from stored date without auto-advancing
                const nextDate = new Date(s.date);
                nextDate.setHours(0, 0, 0, 0); // Normalize time
                return { ...s, nextDate };
            })
            .sort((a, b) => a.nextDate - b.nextDate);

        if(!items.length) {
            this.els.scheduledList.innerHTML = '<div style="padding:20px;text-align:center;color:grey">No bills due.</div>';
            return;
        }

        let grp = '';
        items.forEach(s => {
            // Calculate difference in days from Today
            const diff = Math.ceil((s.nextDate - new Date().setHours(0,0,0,0))/(1000*60*60*24));
            
            let g = 'Future';
            if(diff < 0) g = 'Overdue ⚠️'; 
            else if(diff === 0) g = 'Due Today'; 
            else if(diff <= 7) g = 'This Week'; 
            else if(diff <= 30) g = 'This Month';
            
            if(g !== grp) {
                this.els.scheduledList.appendChild(Utils.createElement('div', { className: 'list-group-header', textContent: g }));
                grp = g;
            }

            const env = s.envelopeId ? this.state.getEnvelope(s.envelopeId) : null;
            const acc = this.state.getAccount(s.accountId);
            const isInc = s.type === 'income';

            this.els.scheduledList.appendChild(Utils.createElement('div', { className: 'scheduled-item' }, [
                Utils.createElement('div', { className: 'scheduled-content' }, [
                    Utils.createElement('span', { className: 'scheduled-name', textContent: s.name }),
                    Utils.createElement('span', { className: isInc?'positive-text':'', textContent: (isInc?'+ ':'') + Utils.formatCurrency(s.amount), style: {fontWeight:'bold'} }),
                    Utils.createElement('span', { className: 'scheduled-meta', textContent: `${s.nextDate.toLocaleDateString()} (${s.frequency})` }),
                    Utils.createElement('span', { className: 'scheduled-meta', textContent: `${env?env.name:'-'} via ${acc?acc.name:'-'}` })
                ]),
                Utils.createElement('div', { className: 'scheduled-actions' }, [
                    Utils.createElement('button', { 
                        className: 'btn-primary', textContent: 'Pay', onclick: () => this.state.applyScheduled(s.id).then(()=>this.render()).catch(e=>Toaster.show(e.message,'error')) }),
                    Utils.createElement('button', { className: 'btn-secondary', textContent: 'Edit', onclick: () => this.handleEditScheduled(s.id) }),
                    Utils.createElement('button', { className: 'btn-danger', textContent: '×', onclick: () => this.handleDeleteScheduled(s.id) })
                ])
            ]));
        });
    }

    _configureAmountModal({ showJar, showAcc, showSplit }) {
        this.els.modalJar.style.display = showJar ? 'block' : 'none';
        this.els.paymentAccount.style.display = showAcc ? 'block' : 'none';
        this.els.enableSplit.parentElement.style.display = showSplit ? 'block' : 'none';
        this.els.splitSection.style.display = 'none';
        this.els.enableSplit.checked = false;
        this.els.modalAmount.value = '';
        this.els.modalNote.value = '';
        this._updateSelects();
    }
    
    _openScheduledWithData({ amount, note, envelopeId, accountId, date, isIncome = false }) {
        Toaster.show('Future date selected — creating scheduled transaction', 'info');

        // Determine which modal to use (mobile vs desktop)
        const isMobile = window.innerWidth < 769;
        
        if (isMobile) {
            // Pre-populate mobile scheduled modal
            const mobAmount = document.getElementById('mob-sched-amount');
            const mobNote = document.getElementById('mob-sched-note');
            const mobEnvelope = document.getElementById('mob-sched-envelope');
            const mobAccount = document.getElementById('mob-sched-acc');
            const mobDate = document.getElementById('mob-sched-date');
            const mobFreq = document.getElementById('mob-sched-freq');
            
            if (mobAmount) mobAmount.value = (amount / 100).toFixed(2);
            if (mobNote) mobNote.value = note || '';
            if (mobEnvelope && envelopeId) mobEnvelope.value = envelopeId;
            if (mobAccount && accountId) mobAccount.value = accountId;
            if (mobDate) mobDate.value = date;
            if (mobFreq) mobFreq.value = 'once'; // Default to one-time for converted transactions
            
            this._populateAccountSelect(mobAccount);
            this._updateSelects();
            this.showModal(this.els.addScheduledMobileModal);
        } else {
            // Pre-populate desktop scheduled form
            const deskAmount = document.getElementById('scheduled-amount');
            const deskNote = document.getElementById('scheduled-note');
            const deskEnvelope = document.getElementById('scheduled-envelope');
            const deskAccount = document.getElementById('scheduled-account');
            const deskDate = document.getElementById('scheduled-date');
            const deskFreq = document.getElementById('scheduled-freq');
            
            if (deskAmount) deskAmount.value = (amount / 100).toFixed(2);
            if (deskNote) deskNote.value = note || '';
            if (deskEnvelope && envelopeId) deskEnvelope.value = envelopeId;
            if (deskAccount && accountId) deskAccount.value = accountId;
            if (deskDate) deskDate.value = date;
            if (deskFreq) deskFreq.value = 'once';
            
            this._updateSelects();
            
            // Scroll to the scheduled section or show modal if exists
            const scheduledSection = document.getElementById('scheduled-section');
            if (scheduledSection) {
                scheduledSection.scrollIntoView({ behavior: 'smooth' });
                // Flash highlight to draw attention
                scheduledSection.style.transition = 'background 0.3s';
                scheduledSection.style.background = 'var(--accent-light)';
                setTimeout(() => scheduledSection.style.background = '', 1000);
            }
        }
    }
    
    _isFutureDate() {
        if (!this.els.modalDate.value) return false;
        
        const todayStr = new Date().toISOString().split('T')[0];
        return this.els.modalDate.value > todayStr;
    }
    _getSelectedDate() {
        if (!this.els.modalDate.value) return Date.now();
        
        const todayStr = new Date().toISOString().split('T')[0];
        // If user selected "Today", preserve current time for correct sorting
        if (this.els.modalDate.value === todayStr) {
            return Date.now();
        }
        
        // Parse as LOCAL time (not UTC) to prevent off-by-one day errors
        const [year, month, day] = this.els.modalDate.value.split('-').map(Number);
        // Set to noon to avoid daylight savings edge cases
        return new Date(year, month - 1, day, 12, 0, 0).getTime();
    }
    _resetAmountModal() {
        this.els.modalAmount.value = '';
        this.els.modalNote.value = '';
        this.els.modalDate.valueAsDate = new Date();
        this.els.splitsList.innerHTML = '';
        this.els.enableSplit.checked = false;
    }

    _addSplitRow() {
        const split = Utils.createElement('div', { className: 'split-item' }, [
            Utils.createElement('select', { className: 'split-jar' }, Array.from(this.state.data.envelopes.values()).map(e => Utils.createElement('option', { value: e.id, textContent: e.name }))),
            Utils.createElement('input', { type: 'number', className: 'split-amt', step: '0.01', placeholder: '0.00' }),
            Utils.createElement('button', { className: 'remove-split', textContent: 'Remove', onclick: (e) => e.target.parentElement.remove() })
        ]);
        this.els.splitsList.appendChild(split);
    }

    _getSplits() {
        const splits = [];
        this.els.splitsList.querySelectorAll('.split-item').forEach(i => {
            const jar = i.querySelector('.split-jar').value;
            const amt = Utils.parseToCents(i.querySelector('.split-amt').value);
            if(jar && amt > 0) splits.push({ jar, amt });
        });
        return splits;
    }
}
