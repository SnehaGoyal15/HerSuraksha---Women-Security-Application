import { getCurrentUser, logout } from '../firebase/auth.js';

export function initSidebar() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const page = item.dataset.page;
            handleNavigation(page);
        });
    });
}

function handleNavigation(page) {
    switch(page) {
        case 'home':
            window.location.href = 'dashboard.html';
            break;
        case 'contacts':
            window.location.href = 'contacts.html';
            break;
        case 'add':
            window.location.href = 'contacts.html?action=add';
            break;
        case 'profile':
            const user = getCurrentUser();
            alert(`Welcome ${user.name}!`);
            break;
        case 'location':
            window.location.href = 'dashboard.html#location';
            break;
    }
}