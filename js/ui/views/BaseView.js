import { Utils } from '../../utils/index.js';

export class BaseView {
    /**
     * @param {string} elementId - The ID of the main container for this view
     */
    constructor(elementId) {
        this.root = document.getElementById(elementId);
        this.isVisible = false;
        
        if (!this.root) {
            console.warn(`View root #${elementId} not found`);
        }
    }

    /**
     * Displays the view container.
     */
    show() {
        if (this.root) {
            this.root.classList.add('active');
            this.root.style.display = 'block';
            this.isVisible = true;
            this.onShow();
        }
    }

    /**
     * Hides the view container.
     */
    hide() {
        if (this.root) {
            this.root.classList.remove('active');
            this.root.style.display = 'none';
            this.isVisible = false;
        }
    }

    /**
     * Abstract method to render the view based on app state.
     * @param {AppState} state 
     */
    render(state) {
        throw new Error("Render method must be implemented by the subclass.");
    }

    /**
     * Lifecycle hook called when view becomes active.
     */
    onShow() {}
}
