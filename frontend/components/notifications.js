const notifications = {
    show(message, type = 'success') {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const notification = document.createElement('div');
        notification.className = `toast toast-${type}`;
        notification.textContent = message;
        container.appendChild(notification);
        setTimeout(() => { notification.classList.add('show'); }, 100);
        setTimeout(() => {
            notification.classList.remove('show');
            notification.addEventListener('transitionend', () => { notification.remove(); });
        }, 4000);
    },
    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); }
};