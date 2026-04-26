export function initLogoAnimation() {
    const logoContainer = document.getElementById('logoContainer');
    const mainContainer = document.getElementById('mainContainer');
    
    // Pehle logo center mein dikhe
    logoContainer.classList.add('logo-center');
    logoContainer.classList.remove('logo-top-left', 'hidden');
    
    // 1 second baad logo shrink hokar top-left jayega
    setTimeout(() => {
        logoContainer.classList.add('logo-top-left');
        logoContainer.classList.remove('logo-center');
        
        // Thoda delay for smooth animation
        setTimeout(() => {
            if (mainContainer) {
                mainContainer.classList.remove('hidden');
            }
        }, 800);
    }, 1000);
}