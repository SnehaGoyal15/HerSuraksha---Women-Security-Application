import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { db } from "../firebase/firebase-config.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, t, translateTemplate } from "../utils/language.js";
import { triggerSOS } from "./sos-button.js";

if (!isLoggedIn()) {
    window.location.href = 'login.html';
}

const user = getCurrentUser();
applyTranslations();

console.log("Current user:", user);

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

const headerTitle = document.querySelector('.header-title');
if (headerTitle && user) {
    const firstName = user.name ? user.name.split(' ')[0] : 'User';
    headerTitle.textContent = translateTemplate("help_header", { name: firstName });
}

const greetingEl = document.getElementById('greetingMessage');
if (greetingEl) {
    if (user && user.name) {
        const firstName = user.name.split(' ')[0];
        greetingEl.innerHTML = translateTemplate("help_greeting_named_emoji", { name: firstName });
    } else {
        greetingEl.innerHTML = translateTemplate("help_greeting_guest_emoji");
    }
    console.log("Greeting updated to:", greetingEl.innerHTML);
}

document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', function() {
        const answer = this.nextElementSibling;
        if (answer.style.display === 'none' || answer.style.display === '') {
            answer.style.display = 'block';
        } else {
            answer.style.display = 'none';
        }
    });
});

let selectedRating = 0;

const stars = document.querySelectorAll('.star');
const ratingValue = document.getElementById('selectedRating');

if (stars.length > 0) {
    stars.forEach(star => {
        star.addEventListener('click', function() {
            selectedRating = parseInt(this.dataset.rating);
            stars.forEach((s, index) => {
                if (index < selectedRating) {
                    s.classList.add('selected');
                } else {
                    s.classList.remove('selected');
                }
            });
            if (ratingValue) {
                ratingValue.textContent = selectedRating === 1
                    ? translateTemplate("selected_rating_one")
                    : translateTemplate("selected_rating_many", { count: selectedRating });
            }
        });
        
        star.addEventListener('mouseenter', function() {
            const hoverRating = parseInt(this.dataset.rating);
            stars.forEach((s, index) => {
                if (index < hoverRating) {
                    s.style.opacity = '1';
                    s.style.transform = 'scale(1.1)';
                } else {
                    s.style.opacity = '0.5';
                    s.style.transform = 'scale(1)';
                }
            });
        });
        
        star.addEventListener('mouseleave', function() {
            stars.forEach((s, index) => {
                s.style.opacity = index < selectedRating ? '1' : '0.5';
                s.style.transform = 'scale(1)';
            });
        });
    });
}

const submitBtn = document.getElementById('submitFeedback');
const feedbackText = document.getElementById('feedbackText');
const feedbackMessage = document.getElementById('feedbackMessage');

if (submitBtn) {
    submitBtn.addEventListener('click', async function() {
        const text = feedbackText ? feedbackText.value.trim() : '';
        
        if (!text && selectedRating === 0) {
            showFeedbackMessage(t('Please write feedback or select a rating'), 'error');
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = t('Submitting...');
        
        try {
            const feedbackData = {
                userId: user?.userId || 'anonymous',
                userName: user?.name || 'Unknown',
                userEmail: user?.email || 'No email',
                rating: selectedRating,
                feedback: text || 'No feedback text',
                timestamp: serverTimestamp()
            };
            
            await addDoc(collection(db, "feedback"), feedbackData);
            
            showFeedbackMessage(t('Thank you for your feedback!'), 'success');
            
            if (feedbackText) feedbackText.value = '';
            selectedRating = 0;
            stars.forEach(star => star.classList.remove('selected'));
            if (ratingValue) ratingValue.textContent = '';
            
        } catch (error) {
            console.error("Error submitting feedback:", error);
            showFeedbackMessage(t('Failed to submit feedback. Please try again.'), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = t('Submit Feedback');
        }
    });
}

function showFeedbackMessage(message, type) {
    if (!feedbackMessage) return;
    
    feedbackMessage.textContent = message;
    feedbackMessage.className = 'feedback-message ' + type;
    
    setTimeout(() => {
        feedbackMessage.textContent = '';
        feedbackMessage.className = 'feedback-message';
    }, 5000);
}

document.getElementById('homeBtn')?.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
});

document.getElementById('contactsBtn')?.addEventListener('click', () => {
    window.location.href = 'contacts.html';
});

document.getElementById('addBtn')?.addEventListener('click', () => {
    window.location.href = 'add-contact.html';
});

document.getElementById('locationBtn')?.addEventListener('click', openCurrentLocation);

document.getElementById('accountBtn')?.addEventListener('click', () => {
    window.location.href = 'account.html';
});

document.getElementById('helpBtn')?.addEventListener('click', () => {
    window.location.href = 'help.html';
});

document.querySelectorAll('.icon-box').forEach(icon => {
    icon.addEventListener('click', function() {
        document.querySelectorAll('.icon-box').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});

initFakeCallWatcher({ currentPage: "help.html" });
initSafetyTimerWatcher({
    currentPage: "help.html",
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});

