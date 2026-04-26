import { getCurrentUser, isLoggedIn, logout, waitForAuthUser } from "../firebase/auth.js";
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { auth, db } from "../firebase/firebase-config.js";
import { initFakeCallWatcher } from "../utils/fake-call-scheduler.js";
import { initSafetyTimerWatcher } from "../utils/safety-timer.js";
import { alertT, applyTranslations, confirmT, getCurrentLanguage, promptT, setCurrentLanguage, t, translateTemplate } from "../utils/language.js";
import { triggerSOS } from "./sos-button.js";

if (!isLoggedIn()) {
    window.location.href = 'login.html';
}

const user = getCurrentUser();
const headerTitle = document.getElementById('welcomeMessage');
if (headerTitle && user) {
    const firstName = user.name ? user.name.split(' ')[0] : 'User';
    headerTitle.innerHTML = translateTemplate("account_header", { name: firstName });
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

function resizeImageForProfile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const maxSize = 320;
                const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
                const width = Math.round(img.width * scale);
                const height = Math.round(img.height * scale);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas not supported'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                resolve(dataUrl);
            };

            img.onerror = () => reject(new Error('Could not read selected image'));
            img.src = reader.result;
        };

        reader.onerror = () => reject(new Error('Could not open selected file'));
        reader.readAsDataURL(file);
    });
}

// Updated location function with better error handling
function openCurrentLocation() {
    console.log("📍 Location button clicked");
    const locationBtn = document.getElementById("locationBtn");
    const originalText = locationBtn.innerHTML;
    
    if (locationBtn) {
        locationBtn.innerHTML = '<span style="opacity:0.7;">📍...</span>';
    }
    
    if (!navigator.geolocation) {
        console.error("❌ Geolocation not supported");
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
            
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            window.open(mapsUrl, '_blank');
            
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
            showToast('❌ Could not get location', 'error');
        },
        options
    );
}

async function loadUserData() {
    if (!user || !user.userId) return;
    
    try {
        const userDoc = await getDoc(doc(db, "users", user.userId));
        if (userDoc.exists()) {
            const data = userDoc.data();
            
            document.getElementById('displayName').textContent = data.name || 'Not set';
            document.getElementById('displayMobile').textContent = data.mobile || 'Not set';
            document.getElementById('displayEmail').textContent = data.email || 'Not set';
            document.getElementById('displayBlood').textContent = data.blood || 'Not set';
            document.getElementById('displayAddress').textContent = data.address || 'Not added yet';
            
            document.getElementById('editName').value = data.name || '';
            document.getElementById('editMobile').value = data.mobile || '';
            document.getElementById('editEmail').value = data.email || '';
            document.getElementById('editBlood').value = data.blood || '';
            document.getElementById('editAddress').value = data.address || '';
            
            if (data.photoURL) {
                document.getElementById('avatarImg').src = data.photoURL;
            }
            
            const fakeCallName = localStorage.getItem('fakeCallName') || 'Mom';
            const fakeCallNumber = localStorage.getItem('fakeCallNumber') || '1234567890';
            const fakeCallRingtone = localStorage.getItem('fakeCallRingtone') || 'default';
            const preferredLanguage = data.languagePreference || getCurrentLanguage();
            
            document.getElementById('fakeCallName').value = fakeCallName;
            document.getElementById('fakeCallNumber').value = fakeCallNumber;
            document.getElementById('fakeCallRingtone').value = fakeCallRingtone;
            document.getElementById('appLanguageSelect').value = preferredLanguage;
            setCurrentLanguage(preferredLanguage);
            applyTranslations();
        }
    } catch (error) {
        console.error("Error loading user data:", error);
        alertT('Failed to load user data. Please refresh the page.');
    }
}

loadUserData();

const profileAvatar = document.getElementById('profileAvatar');
const photoUpload = document.getElementById('photoUpload');
const avatarImg = document.getElementById('avatarImg');

if (profileAvatar) {
    profileAvatar.addEventListener('click', () => {
        photoUpload.click();
    });
}

if (photoUpload) {
    photoUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.match('image.*')) {
            alertT('Please select an image file');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            alertT('File size too large. Maximum 5MB allowed.');
            return;
        }
        
        try {
            avatarImg.style.opacity = '0.5';
            const photoURL = await resizeImageForProfile(file);
            await updateDoc(doc(db, "users", user.userId), { photoURL: photoURL });
            avatarImg.src = photoURL;
            avatarImg.style.opacity = '1';
            photoUpload.value = '';
            alertT('Profile photo updated successfully!');
        } catch (error) {
            console.error("Error uploading photo:", error);
            alertT('Failed to upload photo. Please try again.');
            avatarImg.style.opacity = '1';
            photoUpload.value = '';
        }
    });
}

const editProfileBtn = document.getElementById('editProfileBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const viewMode = document.getElementById('viewMode');
const editMode = document.getElementById('editMode');

if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
        viewMode.style.display = 'none';
        editMode.style.display = 'block';
    });
}

if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
        viewMode.style.display = 'block';
        editMode.style.display = 'none';
        loadUserData();
    });
}

const saveProfileBtn = document.getElementById('saveProfileBtn');

if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
        if (!user || !user.userId) return;
        
        const updatedData = {
            name: document.getElementById('editName').value.trim(),
            mobile: document.getElementById('editMobile').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            blood: document.getElementById('editBlood').value.trim(),
            address: document.getElementById('editAddress').value.trim()
        };
        
        if (!updatedData.name || !updatedData.mobile || !updatedData.email || !updatedData.blood) {
            alertT('Please fill in all required fields');
            return;
        }
        
        if (!/^\d{10}$/.test(updatedData.mobile)) {
            alertT('Please enter a valid 10-digit mobile number');
            return;
        }
        
        if (!/^\S+@\S+\.\S+$/.test(updatedData.email)) {
            alertT('Please enter a valid email address');
            return;
        }
        
        try {
            await updateDoc(doc(db, "users", user.userId), updatedData);
            const updatedUser = { ...user, ...updatedData };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            
            document.getElementById('displayName').textContent = updatedData.name;
            document.getElementById('displayMobile').textContent = updatedData.mobile;
            document.getElementById('displayEmail').textContent = updatedData.email;
            document.getElementById('displayBlood').textContent = updatedData.blood;
            document.getElementById('displayAddress').textContent = updatedData.address || 'Not added yet';
            
            viewMode.style.display = 'block';
            editMode.style.display = 'none';
            
            if (headerTitle) {
                const firstName = updatedData.name.split(' ')[0];
                headerTitle.innerHTML = translateTemplate("account_header", { name: firstName });
            }
            
            alertT('Profile updated successfully!');
        } catch (error) {
            console.error("Error updating profile:", error);
            alertT('Failed to update profile. Please try again.');
        }
    });
}

const saveFakeCallBtn = document.getElementById('saveFakeCallSettings');
const saveLanguageBtn = document.getElementById('saveLanguageBtn');

if (saveFakeCallBtn) {
    saveFakeCallBtn.addEventListener('click', () => {
        const fakeCallName = document.getElementById('fakeCallName').value.trim();
        const fakeCallNumber = document.getElementById('fakeCallNumber').value.trim();
        const fakeCallRingtone = document.getElementById('fakeCallRingtone').value;
        
        if (!fakeCallName) {
            alertT('Please enter a caller name');
            return;
        }
        
        localStorage.setItem('fakeCallName', fakeCallName);
        localStorage.setItem('fakeCallNumber', fakeCallNumber || '');
        localStorage.setItem('fakeCallRingtone', fakeCallRingtone);
        
        alertT('Fake call settings saved!');
    });
}

const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirmT('Are you sure you want to logout?')) {
            logoutBtn.disabled = true;
            logoutBtn.textContent = t('Logging Out...');
            await logout();
        }
    });
}

if (saveLanguageBtn) {
    saveLanguageBtn.addEventListener('click', async () => {
        const selectedLanguage = document.getElementById('appLanguageSelect').value;
        setCurrentLanguage(selectedLanguage);

        try {
            if (user?.userId) {
                await updateDoc(doc(db, "users", user.userId), {
                    languagePreference: selectedLanguage
                });
            }
            alert(selectedLanguage === "hi" ? "भाषा सफलतापूर्वक सहेजी गई!" : "Language saved successfully!");
            window.location.reload();
        } catch (error) {
            console.error("Error saving language:", error);
            alert(selectedLanguage === "hi" ? "भाषा सहेजने में समस्या हुई।" : "Failed to save language.");
        }
    });
}

const deleteAccountBtn = document.getElementById('deleteAccountBtn');

if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
        if (!confirm('⚠️ Are you sure you want to delete your account? This action cannot be undone!')) {
            return;
        }
        
        const confirmText = promptT('Type "DELETE" to confirm account deletion:');
        if (confirmText !== 'DELETE') {
            alertT('Account deletion cancelled');
            return;
        }
        
        try {
            deleteAccountBtn.disabled = true;
            deleteAccountBtn.textContent = t('Deleting...');

            const currentUser = auth.currentUser || await waitForAuthUser();
            if (!currentUser || currentUser.uid !== user.userId) {
                throw new Error('Authenticated user not available for deletion.');
            }

            const contactsQuery = query(
                collection(db, "emergencyContacts"),
                where("userId", "==", user.userId)
            );
            const contactsSnapshot = await getDocs(contactsQuery);
            const deletePromises = contactsSnapshot.docs.map(contactDoc => deleteDoc(contactDoc.ref));
            await Promise.all(deletePromises);

            await deleteDoc(doc(db, "users", user.userId));
            await deleteUser(currentUser);

            localStorage.removeItem('currentUser');
            localStorage.removeItem('isLoggedIn');
            alertT('Account deleted successfully');
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Error deleting account:", error);
            const message = error.code === 'auth/requires-recent-login'
                ? 'For security, please log in again and then try deleting your account.'
                : 'Failed to delete account. Please try again.';
            alertT(message);
            deleteAccountBtn.disabled = false;
            deleteAccountBtn.textContent = t('Delete Account');
        }
    });
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

if (window.location.pathname.includes('account.html')) {
    const accountIcon = document.getElementById('accountBtn')?.closest('.icon-box');
    if (accountIcon) {
        accountIcon.classList.add('active');
    }
}

initFakeCallWatcher({ currentPage: "account.html" });
initSafetyTimerWatcher({
    currentPage: "account.html",
    onTriggerSOS: async () => {
        await triggerSOS({ limit: 4, reason: "safety_timer" });
    }
});
