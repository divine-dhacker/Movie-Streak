// Initialize Firebase Auth
const auth = firebase.auth();

// Auth UI Elements
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const authMessage = document.getElementById('authMessage');
const signOutButton = document.getElementById('signOutButton');

// Configure auth settings
const actionCodeSettings = {
    url: window.location.href,
    handleCodeInApp: true
};

// Handle form submission
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    
    if (!email) {
        showAuthMessage('Please enter your email address.', 'error');
        return;
    }

    try {
        await auth.sendSignInLinkToEmail(email, actionCodeSettings);
        // Save the email for later use
        window.localStorage.setItem('emailForSignIn', email);
        showAuthMessage('Check your email! A sign-in link has been sent.', 'success');
        emailInput.value = '';
    } catch (error) {
        console.error('Error sending sign-in link:', error);
        showAuthMessage('Error sending sign-in link. Please try again.', 'error');
    }
});

// Handle sign-in with email link
if (auth.isSignInWithEmailLink(window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        email = window.prompt('Please provide your email for confirmation:');
    }
    
    if (email) {
        auth.signInWithEmailLink(email, window.location.href)
            .then((result) => {
                window.localStorage.removeItem('emailForSignIn');
                // Get username from email
                const username = email.split('@')[0];
                // Update user profile
                return result.user.updateProfile({
                    displayName: username,
                    photoURL: generateAvatarUrl(username)
                }).then(() => {
                    // Create/update user data in database
                    return db.ref(`users/${result.user.uid}`).set({
                        email: email,
                        name: username,
                        createdAt: firebase.database.ServerValue.TIMESTAMP,
                        lastLogin: firebase.database.ServerValue.TIMESTAMP,
                        streak: 0
                    });
                });
            })
            .then(() => {
                showToast('Successfully signed in!');
                closeAuthModal();
                window.location.href = '/'; // Clean up the URL
            })
            .catch((error) => {
                console.error('Error signing in with email link:', error);
                showAuthMessage('Error signing in. Please try again.', 'error');
            });
    }
}

// Auth state observer
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is signed in
        currentUserId = user.uid;
        currentUserName = user.displayName;
        currentUserPic = user.photoURL;
        
        // Save to localStorage as backup
        localStorage.setItem('currentUserId', currentUserId);
        localStorage.setItem('currentUserName', currentUserName);
        localStorage.setItem('currentUserPic', currentUserPic);
        
        // Update UI
        document.getElementById('profileNameModal').textContent = currentUserName;
        closeAuthModal();
        showMainAppUI();
        loadMovies();
        initializeFilterUI();
    } else {
        // User is signed out
        currentUserId = null;
        currentUserName = null;
        currentUserPic = null;
        
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('currentUserName');
        localStorage.removeItem('currentUserPic');
        
        showAuthModal();
    }
});

// Sign out handler
signOutButton.addEventListener('click', () => {
    auth.signOut().then(() => {
        showToast('Successfully signed out!');
        showAuthModal();
    }).catch((error) => {
        console.error('Error signing out:', error);
        showToast('Error signing out. Please try again.');
    });
});

// Helper functions
function showAuthMessage(message, type) {
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type}`;
    authMessage.style.display = 'block';
}

function showAuthModal() {
    authModal.style.display = 'flex';
}

function closeAuthModal() {
    authModal.style.display = 'none';
}

function generateAvatarUrl(name) {
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4a90e2&color=fff&size=128&bold=true&font-size=0.5`;
}