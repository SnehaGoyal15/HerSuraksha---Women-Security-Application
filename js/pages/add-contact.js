import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase/firebase-config.js";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, t, translateTemplate } from "../utils/language.js";
import { triggerSOS } from "./sos-button.js";

if(!isLoggedIn()) {
    window.location.href = "login.html";
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

document.getElementById('helpBtn').onclick = function() {
    window.location.href = 'help.html';
};

const welcome = document.getElementById("welcomeMessage");
if(welcome && user) {
    const firstName = user.name ? user.name.split(" ")[0] : "User";
    welcome.innerHTML = translateTemplate("add_contact_header", { name: firstName });
}

const saveBtn = document.getElementById("saveContact");
if(saveBtn) {
    saveBtn.onclick = async function() {
        const name = document.getElementById("contactName").value;
        const phone = document.getElementById("contactPhone").value;
        const relation = document.getElementById("contactRelation").value;
        const email = document.getElementById("contactEmail").value;

        if(name == "" || phone == "" || email == "") {
            alertT("Please enter name, phone and email");
            return;
        }

        try {
            await addDoc(collection(db, "emergencyContacts"), {
                userId: user.userId,
                name: name,
                phone: phone,
                relation: relation,
                email: email
            });

            alertT("Contact saved successfully");
            document.getElementById("contactName").value = "";
            document.getElementById("contactPhone").value = "";
            document.getElementById("contactRelation").value = "";
            document.getElementById("contactEmail").value = "";
        } catch(error) {
            console.error(error);
            alertT("Error saving contact");
        }
    };
}

document.getElementById("homeBtn").onclick = function() {
    window.location.href = "dashboard.html";
};

document.getElementById("contactsBtn").onclick = function() {
    window.location.href = "contacts.html";
};

document.getElementById("addBtn").onclick = function() {
    window.location.href = "add-contact.html";
};

document.getElementById("locationBtn").onclick = openCurrentLocation;

document.getElementById("accountBtn").onclick = function() {
    window.location.href = "account.html";
};

document.querySelectorAll(".icon-box").forEach(icon => {
    icon.addEventListener("click", function() {
        document.querySelectorAll(".icon-box").forEach(i => i.classList.remove("active"));
        this.classList.add("active");
    });
});

if (window.location.pathname.includes('add-contact.html')) {
    const addIcon = document.getElementById('addBtn')?.closest('.icon-box');
    if (addIcon) {
        addIcon.classList.add('active');
    }
}

initFakeCallWatcher({ currentPage: "add-contact.html" });
initSafetyTimerWatcher({
    currentPage: "add-contact.html",
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});
