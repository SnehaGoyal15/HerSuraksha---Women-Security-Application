// JS/UTILS/LOCATION.JS
let lastLocation = null;
let lastLocationTime = 0;

export function getLocation(forceNew = false) {
    return new Promise((resolve) => {
        // If cached location is less than 2 minutes old and not forcing new, return it
        if (!forceNew && lastLocation && (Date.now() - lastLocationTime) < 120000) {
            console.log("📍 Using cached location");
            resolve(lastLocation);
            return;
        }
        
        if (!navigator.geolocation) {
            resolve({ success: false, error: "Geolocation not supported" });
            return;
        }
        
        // Faster options for first attempt
        const options = {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 60000
        };
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                lastLocation = {
                    success: true,
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    url: `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`
                };
                lastLocationTime = Date.now();
                resolve(lastLocation);
            },
            (error) => {
                let errorMessage = "";
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = "Location permission denied";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "Location information unavailable";
                        break;
                    case error.TIMEOUT:
                        errorMessage = "Location request timed out";
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

// Force fresh location (for SOS if needed)
export function getFreshLocation() {
    return getLocation(true);
}