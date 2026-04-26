import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getLocation } from "./utils/location.js";

const firebaseConfig = {
    apiKey: "AIzaSyDbTUDZBPVhqZhNZ4B1KVDNc7crRS1BJEk",
    authDomain: "hersuraksha.firebaseapp.com",
    projectId: "hersuraksha",
    storageBucket: "hersuraksha.firebasestorage.app",
    messagingSenderId: "851245511690",
    appId: "1:851245511690:web:f2e2942fb64cc9b9b5dbf3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("✅ Firebase initialized");

// ===== LOCATION PRE-FETCH =====
let cachedLocation = null;
let locationFetching = false;

function preFetchLocation() {
    if (locationFetching) return;
    locationFetching = true;
    
    console.log("📍 Pre-fetching location in background...");
    getLocation().then(location => {
        if (location.success) {
            cachedLocation = location;
            console.log("✅ Location pre-fetched:", cachedLocation.lat, cachedLocation.lng);
        } else {
            console.log("⚠️ Location pre-fetch failed:", location.error);
        }
        locationFetching = false;
    }).catch(err => {
        console.log("⚠️ Location pre-fetch error:", err);
        locationFetching = false;
    });
}

// Export cached location for SOS button
export function getCachedLocation() {
    return cachedLocation;
}

// ===== LOGO ANIMATION & REDIRECT =====
document.addEventListener('DOMContentLoaded', () => {
    const logoContainer = document.getElementById('logoContainer');
    
    // 1 second baad logo top-left move karega
    setTimeout(() => {
        if (logoContainer) {
            logoContainer.classList.add('logo-top-left');
            logoContainer.classList.remove('logo-center');
        }
        
        // 1 second baad check login and redirect
        setTimeout(() => {
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    // User is logged in, pre-fetch location in background
                    setTimeout(() => preFetchLocation(), 1000);
                    window.location.href = 'dashboard.html';
                } else {
                    window.location.href = 'login.html';
                }
            });
        }, 1000);
    }, 1000);
});