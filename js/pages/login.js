import { loginAnonymously, isLoggedIn } from "../firebase/auth.js";
import { applyTranslations, t } from "../utils/language.js";

applyTranslations();

const loginBtn = document.getElementById('loginBtn');
const messageEl = document.getElementById('message');

function setMessage(message) {
    messageEl.innerText = message;
}

loginBtn.addEventListener('click', async () => {
    const name = document.getElementById('name').value.trim();
    const mobile = document.getElementById('mobile').value.trim();
    const email = document.getElementById('email').value.trim();
    const blood = document.getElementById('blood').value.trim();

    if (!name || !mobile || !email || !blood) {
        setMessage(t('All fields required'));
        return;
    }

    if (!/^\d{10}$/.test(mobile)) {
        setMessage(t('Please enter a valid 10-digit mobile number'));
        return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        setMessage(t('Please enter a valid email address'));
        return;
    }

    loginBtn.disabled = true;
    setMessage(t('Logging In...'));

    const result = await loginAnonymously({ name, mobile, email, blood });

    if (result.success) {
        setMessage(t('Login successful!'));
        setTimeout(() => window.location.href = 'dashboard.html', 1000);
    } else {
        setMessage(result.error);
        loginBtn.disabled = false;
    }
});

if (isLoggedIn()) {
    window.location.href = 'dashboard.html';
}
