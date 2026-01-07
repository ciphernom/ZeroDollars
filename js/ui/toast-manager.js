// js/ui/toast-manager.js
import { Utils } from '../utils/index.js';

export class ToastManager {
    constructor() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = Utils.createElement('div', { id: 'toast-container' });
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a transient message
     * @param {string} message 
     * @param {'success'|'error'|'info'} type 
     * @param {number} duration (ms)
     */
    show(message, type = 'info', duration = 3000) {
        const iconMap = { success: '✅', error: '⚠️', info: 'ℹ️' };
        
        const el = Utils.createElement('div', { 
            className: `toast ${type}`,
            onclick: () => this.dismiss(el)
        });

        // Securely create the content span
        const span = Utils.createElement('span', { 
            textContent: `${iconMap[type]} ${message}` 
        });
        
        el.appendChild(span);
        this.container.appendChild(el);

        if (duration > 0) {
            setTimeout(() => this.dismiss(el), duration);
        }
    }

    /**
     * Replaces window.confirm()
     * @param {string} message 
     * @param {Function} onConfirm - Callback if user clicks Yes
     * @param {string} confirmText 
     */
confirm(message, onConfirm, confirmText = 'Yes') {
    const el = Utils.createElement('div', { className: 'toast info' });

    // 1. Create Message Span
    const msgSpan = Utils.createElement('span', { textContent: `🤔 ${message}` });

    // 2. Create Actions Container
    const actionsDiv = Utils.createElement('div', { className: 'toast-actions' });

    // 3. Create Buttons
    const btnCancel = Utils.createElement('button', { 
        className: 'toast-btn cancel', 
        textContent: 'Cancel',
        onclick: (e) => {
            e.stopPropagation();
            this.dismiss(el);
        }
    });

    const btnConfirm = Utils.createElement('button', { 
        className: 'toast-btn confirm', 
        textContent: confirmText,
        onclick: (e) => {
            e.stopPropagation();
            onConfirm();
            this.dismiss(el);
        }
    });

    actionsDiv.append(btnCancel, btnConfirm);
    el.append(msgSpan, actionsDiv);
    this.container.appendChild(el);
}

    dismiss(element) {
        element.style.animation = 'toastFadeOut 0.2s forwards';
        element.addEventListener('animationend', () => {
            if (element.parentElement) element.remove();
        });
    }
}

// Export singleton instance
export const Toaster = new ToastManager();
