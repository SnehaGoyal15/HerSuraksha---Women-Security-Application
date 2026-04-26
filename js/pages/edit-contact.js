import { updateContact } from "../firebase/firestore.js";
import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { db } from "../firebase/firebase-config.js";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, t } from "../utils/language.js";
import { triggerSOS } from "./sos-button.js";

if (!isLoggedIn()) {
    window.location.href = 'login.html';
}
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

document.getElementById('helpBtn').addEventListener('click', () => {
    window.location.href = 'help.html';
});

function openCurrentLocation() {
    const locationBtn = document.getElementById("locationBtn");
    const originalText = locationBtn ? locationBtn.innerHTML : "";
    
    if (locationBtn) {
        locationBtn.innerHTML = '<span style="opacity:0.7;">...</span>';
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
            window.open("https://www.google.com/maps?q=" + lat + "," + lng, "_blank");
            if (locationBtn) locationBtn.innerHTML = originalText;
            showToast(t("Opening your location in Google Maps"), 'success');
        },
        function(error) {
            if (locationBtn) locationBtn.innerHTML = originalText;
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    alertT("Location access is blocked.\n\nPlease enable location:\n1. Click the lock icon in address bar\n2. Go to Site Settings\n3. Set Location to Allow\n4. Refresh the page");
                    break;
                case error.POSITION_UNAVAILABLE:
                    alertT("Location information unavailable. Please check your GPS.");
                    break;
                case error.TIMEOUT:
                    alertT("Location request timed out. Please try again.");
                    break;
                default:
                    alertT("Unable to get your current location. Please try again.");
            }
        },
        options
    );
}

const contactData = sessionStorage.getItem('editContact');
let contactId = null;

if (contactData) {
    const contact = JSON.parse(contactData);
    contactId = contact.id;
    
    document.getElementById('editName').value = contact.name || '';
    document.getElementById('editPhone').value = contact.phone || '';
    document.getElementById('editRelation').value = contact.relation || '';
    document.getElementById('editEmail').value = contact.email || '';
} else {
    sessionStorage.removeItem('editContact');
    alertT('No contact selected for editing');
    window.location.href = 'contacts.html';
}

document.getElementById('saveEditBtn').addEventListener('click', async () => {
    if (!contactId) {
        alertT('No contact selected for editing');
        window.location.href = 'contacts.html';
        return;
    }

    const updatedData = {
        name: document.getElementById('editName').value.trim(),
        phone: document.getElementById('editPhone').value.trim(),
        relation: document.getElementById('editRelation').value.trim(),
        email: document.getElementById('editEmail').value.trim()
    };
    
    if (!updatedData.name || !updatedData.phone) {
        alertT('Please fill in Name and Phone Number');
        return;
    }
    
    try {
        const result = await updateContact(contactId, updatedData);
        if (result) {
            alertT('Contact updated successfully!');
            sessionStorage.removeItem('editContact');
            window.location.href = 'contacts.html';
        } else {
            alertT('Error updating contact. Please try again.');
        }
    } catch (error) {
        console.error('Error updating contact:', error);
        alertT('Error updating contact. Please try again.');
    }
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    sessionStorage.removeItem('editContact');
    window.location.href = 'contacts.html';
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

initFakeCallWatcher({ currentPage: "edit-contact.html" });
initSafetyTimerWatcher({
    currentPage: "edit-contact.html",
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});
