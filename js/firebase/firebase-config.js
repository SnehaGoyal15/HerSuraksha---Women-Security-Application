import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

export { auth, db };