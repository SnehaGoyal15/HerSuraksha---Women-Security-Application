import { getContacts, deleteContact, updateContact } from "../firebase/firestore.js";
import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, confirmT, t, translateTemplate } from "../utils/language.js";
import { triggerSOS } from "./sos-button.js";

if (!isLoggedIn()) {
    window.location.href = 'login.html';
}

const user = getCurrentUser();
applyTranslations();

// Toast message function
function showToast(message, type) {
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function openCurrentLocation() {
    console.log("📍 Location button clicked");
    const locationBtn = document.getElementById("locationBtn");
    const originalText = locationBtn.innerHTML;
    
    if (locationBtn) {
        locationBtn.innerHTML = '<span style="opacity:0.7;">📍...</span>';
    }
    
    if (!navigator.geolocation) {
        alertT("Geolocation is not supported by your browser.");
        if (locationBtn) locationBtn.innerHTML = originalText;
        return;
    }
    
    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            let lat = position.coords.latitude;
            let lng = position.coords.longitude;
            sessionStorage.setItem('userLat', lat);
            sessionStorage.setItem('userLng', lng);
            window.open("https://www.google.com/maps?q=" + lat + "," + lng);
            if (locationBtn) locationBtn.innerHTML = originalText;
            showToast('📍 Opening your location in Google Maps', 'success');
        },
        function(error) {
            if (locationBtn) locationBtn.innerHTML = originalText;
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    alert("📍 Location access is blocked.\n\nPlease enable location:\n1. Click the lock icon 🔒 in address bar\n2. Go to Site Settings\n3. Set Location to Allow\n4. Refresh the page");
                    break;
                case error.POSITION_UNAVAILABLE:
                    alert("📍 Location information unavailable. Please check your GPS.");
                    break;
                case error.TIMEOUT:
                    alert("📍 Location request timed out. Please try again.");
                    break;
                default:
                    alert(`📍 Unable to get location: ${error.message}`);
            }
        },
        options
    );
}

const welcomeEl = document.getElementById('welcomeMessage');
if (welcomeEl && user) {
    const firstName = user.name ? user.name.split(' ')[0] : "User";
    welcomeEl.innerHTML = translateTemplate("contacts_header", { name: firstName });
}

document.getElementById('helpBtn').addEventListener('click', () => {
    window.location.href = 'help.html';
});

window.moveUp = async function(contactId) {
    let contacts = await getContacts(user.userId);
    contacts.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    
    const index = contacts.findIndex(c => c.id === contactId);
    if (index > 0) {
        [contacts[index - 1], contacts[index]] = [contacts[index], contacts[index - 1]];
        for (let i = 0; i < contacts.length; i++) {
            await updateContact(contacts[i].id, { priority: i + 1 });
        }
        loadContacts();
    }
};

window.moveDown = async function(contactId) {
    let contacts = await getContacts(user.userId);
    contacts.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    
    const index = contacts.findIndex(c => c.id === contactId);
    if (index < contacts.length - 1) {
        [contacts[index], contacts[index + 1]] = [contacts[index + 1], contacts[index]];
        for (let i = 0; i < contacts.length; i++) {
            await updateContact(contacts[i].id, { priority: i + 1 });
        }
        loadContacts();
    }
};

function openEditContact(contact) {
    const contactData = {
        id: contact.id,
        name: contact.name || '',
        phone: contact.phone || '',
        email: contact.email || '',
        relation: contact.relation || ''
    };
    sessionStorage.setItem('editContact', JSON.stringify(contactData));
    window.location.href = 'edit-contact.html';
}

async function handleDeleteContact(contactId) {
    if (!confirmT('Are you sure you want to delete this contact?')) {
        return;
    }

    const result = await deleteContact(contactId);
    if (result) {
        alertT('Contact deleted successfully!');
        loadContacts();
    } else {
        alertT('Error deleting contact. Please try again.');
    }
}

async function loadContacts() {
    const contactsList = document.getElementById('contactsList');
    if (!user) return;
    
    let contacts = await getContacts(user.userId);
    contacts.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    contacts = contacts.map((contact, index) => {
        if (!contact.priority) {
            contact.priority = index + 1;
        }
        return contact;
    });
    
    if (contacts.length === 0) {
        contactsList.innerHTML = `
            <div class="no-contacts">
                <p>📭 No emergency contacts added yet</p>
                <p style="font-size:16px; margin-top:15px;">Click "Add New Contact" to add one</p>
            </div>
        `;
        return;
    }
    
    contactsList.innerHTML = contacts.map(contact => `
        <div class="contact-card ${contact.priority === 1 ? 'priority-1' : ''}" data-id="${contact.id}">
            <div class="contact-info-wrapper">
                <div class="priority-number">${contact.priority}</div>
                <div class="contact-info">
                    <div class="contact-name">${escapeHtml(contact.name)}</div>
                    <div class="contact-details">
                        <div class="contact-phone">
                            <svg width="18" height="18" viewBox="0 0 24 24">
                                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#666"/>
                            </svg>
                            ${escapeHtml(contact.phone)}
                        </div>
                        ${contact.email ? `<div class="contact-email">✉️ ${escapeHtml(contact.email)}</div>` : ''}
                        ${contact.relation ? `<span class="contact-relation">${escapeHtml(contact.relation)}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="priority-buttons">
                ${contact.priority > 1 ? `<button class="priority-up" data-action="move-up" data-contact-id="${contact.id}">▲</button>` : '<div style="width:36px;"></div>'}
                ${contact.priority < contacts.length ? `<button class="priority-down" data-action="move-down" data-contact-id="${contact.id}">▼</button>` : '<div style="width:36px;"></div>'}
            </div>

            <div class="action-buttons">
                <button class="action-btn call-btn" data-action="call" data-phone="${escapeAttribute(contact.phone)}">
                    <svg width="22" height="22" viewBox="0 0 24 24">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white"/>
                    </svg>
                </button>
                
                <button class="action-btn msg-btn" data-action="message" data-phone="${escapeAttribute(contact.phone)}">
                    <svg width="22" height="22" viewBox="0 0 24 24">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" fill="white"/>
                    </svg>
                </button>

                <button class="action-btn edit-btn" data-action="edit" data-contact-id="${contact.id}">
                    <svg width="22" height="22" viewBox="0 0 24 24">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="white"/>
                    </svg>
                </button>
                
                <button class="action-btn delete-btn" data-action="delete" data-contact-id="${contact.id}">
                    <svg width="22" height="22" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="white"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(str) {
    return escapeHtml(String(str || ''));
}

loadContacts();

document.getElementById('contactsList').addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const contactId = actionButton.dataset.contactId;
    const phone = actionButton.dataset.phone || '';

    if (action === 'move-up' && contactId) {
        await window.moveUp(contactId);
        return;
    }

    if (action === 'move-down' && contactId) {
        await window.moveDown(contactId);
        return;
    }

    if (action === 'call' && phone) {
        window.location.href = `tel:${phone}`;
        return;
    }

    if (action === 'message' && phone) {
        window.location.href = `sms:${phone}`;
        return;
    }

    if (action === 'edit' && contactId) {
        const contacts = await getContacts(user.userId);
        const contact = contacts.find((item) => item.id === contactId);
        if (contact) {
            openEditContact(contact);
        }
        return;
    }

    if (action === 'delete' && contactId) {
        await handleDeleteContact(contactId);
    }
});

document.getElementById('addNewContact').addEventListener('click', () => {
    window.location.href = 'add-contact.html';
});

document.getElementById('homeBtn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
});

document.getElementById('contactsBtn').addEventListener('click', () => {
    window.location.href = 'contacts.html';
});

document.getElementById('addBtn').addEventListener('click', () => {
    window.location.href = 'add-contact.html';
});

document.getElementById('locationBtn').addEventListener('click', openCurrentLocation);

document.getElementById('accountBtn').addEventListener('click', () => {
    window.location.href = 'account.html';
});

document.querySelectorAll('.icon-box').forEach(icon => {
    icon.addEventListener('click', function() {
        document.querySelectorAll('.icon-box').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});

if (window.location.pathname.includes('contacts.html')) {
    const contactsIcon = document.getElementById('contactsBtn')?.closest('.icon-box');
    if (contactsIcon) {
        contactsIcon.classList.add('active');
    }
}

initFakeCallWatcher({ currentPage: "contacts.html" });
initSafetyTimerWatcher({
    currentPage: "contacts.html",
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});
