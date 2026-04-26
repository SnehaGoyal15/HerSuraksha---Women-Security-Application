import { db } from "../firebase/firebase-config.js";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { getCurrentUser } from "../firebase/auth.js";

let activeSessionId = null;
let updateInterval = null;
let autoStopTimer = null;
const PUBLIC_TRACKING_BASE_URL = "https://hersuraksha.web.app";

function getTrackingBaseUrl() {
    const currentOrigin = window.location.origin;
    const isPublicOrigin = currentOrigin &&
        currentOrigin !== "null" &&
        !currentOrigin.includes("localhost") &&
        !currentOrigin.includes("127.0.0.1");

    return isPublicOrigin ? currentOrigin : PUBLIC_TRACKING_BASE_URL;
}

/**
 * Start 8-hour live location tracking
 * @returns {Promise<string>} - Live tracking link to share via email
 */
export async function startLiveTracking8Hours() {
    const user = getCurrentUser();
    
    if (!user) {
        throw new Error("User not logged in");
    }
    
    // Get current location
    const location = await getCurrentLocation();
    
    if (!location.success) {
        throw new Error("Could not get your location. Please enable GPS.");
    }
    
    // Create unique session ID
    const sessionId = `${user.userId}_${Date.now()}`;
    activeSessionId = sessionId;
    
    // Calculate end time (8 hours from now)
    const endTime = new Date(Date.now() + (8 * 60 * 60 * 1000));
    
    // Store in Firestore
    const sessionRef = doc(db, "liveLocations", sessionId);
    await setDoc(sessionRef, {
        sessionId: sessionId,
        userId: user.userId,
        userName: user.name || "User",
        startTime: new Date(),
        endTime: endTime,
        durationHours: 8,
        isActive: true,
        currentLocation: {
            lat: location.lat,
            lng: location.lng,
            timestamp: new Date(),
            accuracy: location.accuracy
        },
        locationHistory: [{
            lat: location.lat,
            lng: location.lng,
            timestamp: new Date()
        }]
    });
    
    // Start periodic location updates (every 30 seconds)
    startLocationUpdates(sessionRef);
    
    // Set auto-stop after 8 hours
    autoStopTimer = setTimeout(async () => {
        await stopLiveTracking();
    }, 8 * 60 * 60 * 1000);
    
    // Generate tracking link - USING track.html (short URL)
    const trackingLink = `${getTrackingBaseUrl()}/track.html?id=${sessionId}`;
    
    console.log("✅ Live tracking started for 8 hours");
    console.log("🔗 Tracking link:", trackingLink);
    
    return trackingLink;
}

/**
 * Start periodic location updates
 */
function startLocationUpdates(sessionRef) {
    if (updateInterval) clearInterval(updateInterval);
    
    updateInterval = setInterval(async () => {
        const location = await getCurrentLocation();
        
        if (location.success && activeSessionId) {
            try {
                // Update current location
                await updateDoc(sessionRef, {
                    currentLocation: {
                        lat: location.lat,
                        lng: location.lng,
                        timestamp: new Date(),
                        accuracy: location.accuracy
                    },
                    lastUpdate: new Date()
                });
                
                // Also add to history (keep last 50 points)
                const docSnap = await getDoc(sessionRef);
                if (docSnap.exists()) {
                    const history = docSnap.data().locationHistory || [];
                    const updatedHistory = [{
                        lat: location.lat,
                        lng: location.lng,
                        timestamp: new Date()
                    }, ...history].slice(0, 50);
                    
                    await updateDoc(sessionRef, {
                        locationHistory: updatedHistory
                    });
                }
                
                console.log("📍 Location updated:", location.lat, location.lng);
            } catch (error) {
                console.error("Error updating location:", error);
            }
        }
    }, 30000); // Update every 30 seconds
}

/**
 * Stop live tracking
 */
export async function stopLiveTracking() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    
    if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
    }
    
    if (activeSessionId) {
        try {
            const sessionRef = doc(db, "liveLocations", activeSessionId);
            await updateDoc(sessionRef, {
                isActive: false,
                endedAt: new Date()
            });
            console.log("🛑 Live tracking stopped");
        } catch (error) {
            console.error("Error stopping tracking:", error);
        }
    }
    
    activeSessionId = null;
}

/**
 * Get current location
 */
function getCurrentLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ success: false, error: "Geolocation not supported" });
            return;
        }
        
        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    success: true,
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                let errorMessage = "";
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = "Location permission denied";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "Location unavailable";
                        break;
                    case error.TIMEOUT:
                        errorMessage = "Location timeout";
                        break;
                    default:
                        errorMessage = error.message;
                }
                resolve({ success: false, error: errorMessage });
            },
            options
        );
    });
}

/**
 * Check if tracking is active
 */
export function isTrackingActive() {
    return activeSessionId !== null;
}

/**
 * Get active session ID
 */
export function getActiveSessionId() {
    return activeSessionId;
}
