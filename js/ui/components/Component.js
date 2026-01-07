import { Utils } from '../../utils/index.js';

export class Component {
    constructor(props = {}) {
        this.props = props;
        this.element = null;
    }

    // Override this
    render() {
        return Utils.createElement('div');
    }

    // Call this to get the DOM
    get dom() {
        if (!this.element) {
            this.element = this.render();
        }
        return this.element;
    }

    // Helper for reactive updates
    update(newProps) {
        this.props = { ...this.props, ...newProps };
        const oldEl = this.element;
        const newEl = this.render();
        
        if (oldEl && oldEl.parentNode) {
            oldEl.parentNode.replaceChild(newEl, oldEl);
        }
        this.element = newEl;
    }
}
