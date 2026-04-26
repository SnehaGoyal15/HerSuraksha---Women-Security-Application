import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    updateDoc,
    query,
    where
} from "firebase/firestore";

const CONTACTS_COLLECTION = "emergencyContacts";
const SAVED_PLACES_COLLECTION = "savedNearbyPlaces";

export async function addContact(contactData) {
    try {
        const docRef = await addDoc(collection(db, CONTACTS_COLLECTION), {
            ...contactData,
            timestamp: new Date()
        });
        console.log("Contact added:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding contact:", error);
        return null;
    }
}

export async function getContacts(userId) {
    try {
        const q = query(
            collection(db, CONTACTS_COLLECTION),
            where("userId", "==", userId)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error getting contacts:", error);
        return [];
    }
}

export async function deleteContact(contactId) {
    try {
        await deleteDoc(doc(db, CONTACTS_COLLECTION, contactId));
        return true;
    } catch (error) {
        console.error("Error deleting contact:", error);
        return false;
    }
}

export async function updateContact(contactId, updatedData) {
    try {
        const contactRef = doc(db, CONTACTS_COLLECTION, contactId);
        await updateDoc(contactRef, updatedData);
        return true;
    } catch (error) {
        console.error("Error updating contact:", error);
        return false;
    }
}

export async function addSavedPlace(placeData) {
    try {
        const docRef = await addDoc(collection(db, SAVED_PLACES_COLLECTION), {
            ...placeData,
            timestamp: new Date()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error adding saved place:", error);
        return null;
    }
}

export async function getSavedPlaces(userId) {
    try {
        const q = query(
            collection(db, SAVED_PLACES_COLLECTION),
            where("userId", "==", userId)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(placeDoc => ({
            id: placeDoc.id,
            ...placeDoc.data()
        }));
    } catch (error) {
        console.error("Error getting saved places:", error);
        return [];
    }
}

export async function deleteSavedPlace(placeId) {
    try {
        await deleteDoc(doc(db, SAVED_PLACES_COLLECTION, placeId));
        return true;
    } catch (error) {
        console.error("Error deleting saved place:", error);
        return false;
    }
}
