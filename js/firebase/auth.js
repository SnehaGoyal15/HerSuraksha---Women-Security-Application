import { auth, db } from './firebase-config.js';
import { doc, setDoc, getDoc } from "firebase/firestore";
import { signInAnonymously, signOut, onAuthStateChanged } from "firebase/auth";

const USERS_COLLECTION = "users";

export async function loginAnonymously(userData) {
    try {
        const currentAuthUser = auth.currentUser;
        const authUser = currentAuthUser?.isAnonymous
            ? currentAuthUser
            : (await signInAnonymously(auth)).user;
        const uid = authUser.uid;

        await setDoc(doc(db, USERS_COLLECTION, uid), {
            ...userData,
            createdAt: new Date()
        });
        
        const userToStore = { userId: uid, ...userData };
        localStorage.setItem('currentUser', JSON.stringify(userToStore));
        localStorage.setItem('isLoggedIn', 'true');
        
        console.log("✅ User saved:", userToStore);
        return { success: true, user: userToStore };
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: error.message };
    }
}

export async function getUserProfile(userId) {
    try {
        const docRef = doc(db, USERS_COLLECTION, userId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
        console.error("Error getting user:", error);
        return null;
    }
}

export function getCurrentUser() {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}

export function isLoggedIn() {
    return localStorage.getItem('isLoggedIn') === 'true';
}

export function waitForAuthUser() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            unsubscribe();
            resolve(firebaseUser);
        });
    });
}

export async function logout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout error:", error);
    } finally {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('isLoggedIn');
        window.location.href = 'login.html';
    }
}
