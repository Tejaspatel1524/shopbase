/* ============================================
   ShopBase â€” Application Logic (v3)
   Auth, Profile, Receipt & Customer Management
   ============================================ */

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
    apiKey: "AIzaSyChlvj-2nC2iAVe1sVoEdV3NchMalOFjss",
    authDomain: "shopbase-eea44.firebaseapp.com",
    projectId: "shopbase-eea44",
    storageBucket: "shopbase-eea44.firebasestorage.app",
    messagingSenderId: "419044947513",
    appId: "1:419044947513:web:a45b6ef6263e8261ecffe8"
};
firebase.initializeApp(firebaseConfig);
const firebaseAuth = firebase.auth();
const db = firebase.firestore();

(function () {
    'use strict';

    // ===== STORAGE KEYS =====
    const STORAGE_KEY = 'shopbase_data';
    const SETTINGS_KEY = 'shopbase_settings';
    const AUTH_KEY = 'shopbase_auth';

    // ===== DATA LAYER =====
    function getData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { customers: [], version: 1 };
            return JSON.parse(raw);
        } catch { return { customers: [], version: 1 }; }
    }

    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        syncToCloud(); // Auto-sync to Firestore
    }

    // ===== FIRESTORE CLOUD SYNC =====
    function getFirestoreUserId() {
        const fbUser = firebaseAuth.currentUser;
        if (fbUser) return fbUser.uid;
        const auth = getAuth();
        if (auth && auth.user && auth.user.id) return auth.user.id;
        return null;
    }

    async function syncToCloud() {
        const userId = getFirestoreUserId();
        if (!userId) return;

        try {
            isSyncing = true; // Prevent onSnapshot from re-triggering
            const data = getData();
            const settings = getSettings();
            const auth = getAuth();

            await db.collection('users').doc(userId).set({
                user: auth ? auth.user : null,
                settings: settings,
                customers: data.customers || [],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (err) {
            console.error('Cloud sync error:', err);
        } finally {
            setTimeout(() => { isSyncing = false; }, 1000); // Reset after 1s
        }
    }

    async function loadFromCloud() {
        const userId = getFirestoreUserId();
        if (!userId) return false;

        try {
            const doc = await db.collection('users').doc(userId).get();
            if (doc.exists) {
                const cloudData = doc.data();

                // Always load customers from cloud (cloud is the source of truth)
                if (cloudData.customers && cloudData.customers.length > 0) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ customers: cloudData.customers, version: 1 }));
                    console.log('Loaded', cloudData.customers.length, 'customers from cloud');
                }

                // Always load settings from cloud
                if (cloudData.settings) {
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloudData.settings));
                }

                // Load auth/user info from cloud
                if (cloudData.user) {
                    const currentAuth = getAuth();
                    if (currentAuth) {
                        currentAuth.user = { ...currentAuth.user, ...cloudData.user };
                        localStorage.setItem(AUTH_KEY, JSON.stringify(currentAuth));
                    }
                }

                return true;
            }
        } catch (err) {
            console.error('Cloud load error:', err);
        }
        return false;
    }

    async function migrateLocalToCloud() {
        const data = getData();
        if (data.customers && data.customers.length > 0) {
            await syncToCloud();
            console.log('Local data migrated to cloud');
        }
    }

    // ===== REAL-TIME SYNC =====
    let realtimeUnsubscribe = null;
    let isSyncing = false; // Prevent infinite loops

    function startRealtimeSync() {
        const userId = getFirestoreUserId();
        if (!userId) return;

        // Stop any existing listener
        stopRealtimeSync();

        realtimeUnsubscribe = db.collection('users').doc(userId)
            .onSnapshot((doc) => {
                if (isSyncing) return; // Skip if we triggered the change
                if (!doc.exists) return;

                const cloudData = doc.data();

                // Update local customers from cloud
                if (cloudData.customers) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ customers: cloudData.customers, version: 1 }));
                }

                // Update local settings from cloud
                if (cloudData.settings && cloudData.settings.shopName) {
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloudData.settings));
                }

                // Re-render UI with new data
                renderCustomerList();
                updateNavBadge();
                updateHeaderFromAuth();
                console.log('Real-time sync: UI updated from cloud');
            }, (err) => {
                console.error('Real-time sync error:', err);
            });
    }

    function stopRealtimeSync() {
        if (realtimeUnsubscribe) {
            realtimeUnsubscribe();
            realtimeUnsubscribe = null;
        }
    }

    function getSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return { shopName: '', shopPhone: '', shopAddress: '', gst: '', tagline: '', category: 'general' };
            return JSON.parse(raw);
        } catch { return { shopName: '', shopPhone: '', shopAddress: '', gst: '', tagline: '', category: 'general' }; }
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        syncToCloud(); // Auto-sync settings to cloud
    }

    function getAuth() {
        try {
            const raw = localStorage.getItem(AUTH_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch { return null; }
    }

    function saveAuth(auth) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    }

    function clearAuth() {
        localStorage.removeItem(AUTH_KEY);
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function generateReceiptNumber() {
        const count = parseInt(localStorage.getItem('shopbase_receipt_count') || '0') + 1;
        localStorage.setItem('shopbase_receipt_count', count.toString());
        return `SB-${count.toString().padStart(4, '0')}`;
    }

    // ===== STATE =====
    let currentCustomerId = null;
    let editingCustomerId = null;
    let statsVisible = false;
    let currentReceiptData = null;
    let pendingAuthData = {};
    let confirmationResult = null;
    let recaptchaVerifier = null;
    let resendTimer = null;

    // ===== DOM REFS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const splash = $('#splash-screen');
    const authContainer = $('#auth-container');
    const app = $('#app');

    const viewHome = $('#view-home');
    const viewProfile = $('#view-profile');
    const viewOwner = $('#view-owner');
    const viewPayments = $('#view-payments');
    const bottomNav = $('#bottom-nav');
    const fabBtn = $('#fab-add');

    const searchInput = $('#search-input');
    const searchClear = $('#search-clear');
    const customerListEl = $('#customer-list');
    const emptyState = $('#empty-state');
    const noResults = $('#no-results');
    const listTitle = $('#list-title');
    const listCount = $('#list-count');

    const statsPanel = $('#stats-panel');
    const btnStats = $('#btn-stats');

    // Profile
    const profileAvatar = $('#profile-avatar');
    const profileName = $('#profile-name');
    const profilePhone = $('#profile-phone');
    const profileAddress = $('#profile-address');
    const profileNotes = $('#profile-notes');
    const profileDate = $('#profile-date');
    const summaryTotal = $('#summary-total');
    const summaryPending = $('#summary-pending');
    const summaryVisits = $('#summary-visits');
    const transactionListEl = $('#transaction-list');
    const emptyTransactions = $('#empty-transactions');

    // Modals
    const modalCustomer = $('#modal-customer');
    const modalTransaction = $('#modal-transaction');
    const modalDelete = $('#modal-delete');
    const modalReceipt = $('#modal-receipt');
    const modalSettings = $('#modal-settings');
    const modalLogout = $('#modal-logout');
    const formCustomer = $('#form-customer');
    const formTransaction = $('#form-transaction');
    const formSettings = $('#form-settings');

    // Toast
    const toastEl = $('#toast');
    const toastMessage = $('#toast-message');

    // ===== INIT =====
    function initApp() {
        setTimeout(() => {
            splash.classList.add('hidden');

            // Listen for Firebase auth state
            firebaseAuth.onAuthStateChanged((firebaseUser) => {
                if (firebaseUser) {
                    const auth = getAuth();
                    if (auth && auth.isLoggedIn && auth.user) {
                        showMainApp();
                    } else {
                        pendingAuthData.firebaseUser = firebaseUser;
                        pendingAuthData.email = firebaseUser.email || '';
                        pendingAuthData.method = firebaseUser.providerData[0]?.providerId === 'password' ? 'email' : 'google';
                        goToSetup();
                    }
                } else {
                    showAuth();
                }
            });
        }, 2200);
    }

    function showAuth() {
        authContainer.classList.remove('hidden');
        app.classList.add('hidden');
        showAuthStep('auth-login');
    }

    async function showMainApp() {
        authContainer.classList.add('hidden');
        app.classList.remove('hidden');

        // Load data from cloud (if available)
        await loadFromCloud();
        // Migrate any existing local data to cloud
        migrateLocalToCloud();

        updateHeaderFromAuth();
        renderCustomerList();
        updateNavBadge();

        // Start real-time sync â€” live updates across devices!
        startRealtimeSync();
    }

    function updateHeaderFromAuth() {
        const auth = getAuth();
        const settings = getSettings();

        const headerShopName = $('#header-shop-name');
        if (settings.shopName) {
            headerShopName.textContent = settings.shopName;
        } else {
            headerShopName.textContent = 'Your Customers, Your Data';
        }

        const avatarBtn = $('#owner-avatar-initial');
        if (auth && auth.user && auth.user.name) {
            avatarBtn.textContent = getInitials(auth.user.name);
        } else {
            avatarBtn.textContent = 'U';
        }
    }

    // ===== AUTH FLOW =====
    function showAuthStep(stepId) {
        $$('.auth-step').forEach(s => s.classList.remove('active'));
        const step = $(`#${stepId}`);
        if (step) step.classList.add('active');
    }

    // Look up user by phone number
    // Look up user by email
    function findUserByEmail(email) {
        try {
            const users = JSON.parse(localStorage.getItem('shopbase_users') || '[]');
            return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        } catch { return null; }
    }

    // Save user to users list
    function saveUser(userData) {
        try {
            const users = JSON.parse(localStorage.getItem('shopbase_users') || '[]');
            const existing = users.findIndex(u => u.id === userData.id);
            if (existing >= 0) {
                users[existing] = userData;
            } else {
                users.push(userData);
            }
            localStorage.setItem('shopbase_users', JSON.stringify(users));
        } catch { /* ignore */ }
    }

    // Complete login
    function completeLogin(user) {
        saveAuth({ isLoggedIn: true, user });
        showMainApp();
        showToast(`Welcome back, ${user.name.split(' ')[0]}! \uD83D\uDC4B`);
    }

    // Complete signup (go to profile setup)
    function goToSetup() {
        showAuthStep('auth-setup');
    }

    function completeSetup(name, shopName, category, address) {
        const fbUser = firebaseAuth.currentUser;
        const userId = fbUser ? fbUser.uid : generateId();
        const user = {
            id: userId,
            name,
            phone: '',
            email: pendingAuthData.email || (fbUser && fbUser.email) || '',
            authMethod: pendingAuthData.method || 'email',
            firebaseUid: fbUser ? fbUser.uid : null,
            createdAt: Date.now()
        };

        saveUser(user);
        saveAuth({ isLoggedIn: true, user });

        const settings = getSettings();
        settings.shopName = shopName;
        settings.shopPhone = '';
        settings.category = category;
        settings.shopAddress = address;
        saveSettings(settings);

        showMainApp();
        showToast(`Welcome to ShopBase, ${name.split(' ')[0]}! \uD83C\uDF89`);
    }

    // ===== AUTH LOADING HELPERS =====
    function setLoginLoading(loading) {
        const btn = $('#btn-login');
        const text = $('#login-btn-text');
        const loader = $('#login-btn-loader');
        if (btn) btn.disabled = loading;
        if (text) text.classList.toggle('hidden', loading);
        if (loader) loader.classList.toggle('hidden', !loading);
    }

    function setSignupLoading(loading) {
        const btn = $('#btn-signup');
        const text = $('#signup-btn-text');
        const loader = $('#signup-btn-loader');
        if (btn) btn.disabled = loading;
        if (text) text.classList.toggle('hidden', loading);
        if (loader) loader.classList.toggle('hidden', !loading);
    }

    function getAuthErrorMessage(code) {
        const messages = {
            'auth/user-not-found': 'No account found. Please sign up first.',
            'auth/wrong-password': 'Wrong password. Try again.',
            'auth/invalid-credential': 'Invalid email or password.',
            'auth/email-already-in-use': 'Email already registered. Try login instead.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/too-many-requests': 'Too many attempts. Wait a moment.',
            'auth/network-request-failed': 'Network error. Check your connection.',
        };
        return messages[code] || 'Something went wrong. Please try again.';
    }

    // ===== AUTH EVENT LISTENERS =====

    // Switch between login and signup
    $('#btn-goto-signup').addEventListener('click', () => showAuthStep('auth-signup'));
    $('#btn-goto-login').addEventListener('click', () => showAuthStep('auth-login'));

    // Login form
    $('#form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#login-email').value.trim();
        const password = $('#login-password').value;

        if (!email || !password) { showToast('Please fill in all fields'); return; }

        setLoginLoading(true);
        $('#login-error').classList.add('hidden');

        try {
            const result = await firebaseAuth.signInWithEmailAndPassword(email, password);
            const fbUser = result.user;
            const existingUser = findUserByEmail(fbUser.email);
            if (existingUser) {
                completeLogin(existingUser);
            } else {
                pendingAuthData = { email: fbUser.email, method: 'email', firebaseUser: fbUser };
                goToSetup();
            }
        } catch (err) {
            console.error('Login error:', err);
            const errorEl = $('#login-error');
            errorEl.textContent = getAuthErrorMessage(err.code);
            errorEl.classList.remove('hidden');
        } finally {
            setLoginLoading(false);
        }
    });

    // Signup form
    $('#form-signup').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('#signup-name').value.trim();
        const email = $('#signup-email').value.trim();
        const password = $('#signup-password').value;

        if (!name || !email || !password) { showToast('Please fill in all fields'); return; }

        setSignupLoading(true);
        $('#signup-error').classList.add('hidden');

        try {
            const result = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            const fbUser = result.user;
            await fbUser.updateProfile({ displayName: name });
            pendingAuthData = { email: fbUser.email, method: 'email', firebaseUser: fbUser };
            $('#setup-name').value = name;
            goToSetup();
        } catch (err) {
            console.error('Signup error:', err);
            const errorEl = $('#signup-error');
            errorEl.textContent = getAuthErrorMessage(err.code);
            errorEl.classList.remove('hidden');
        } finally {
            setSignupLoading(false);
        }
    });

    // Google sign-in (login page)
    $('#btn-auth-google').addEventListener('click', async () => {
        pendingAuthData = { method: 'google' };
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await firebaseAuth.signInWithPopup(provider);
            const fbUser = result.user;
            pendingAuthData.email = fbUser.email || '';
            pendingAuthData.firebaseUser = fbUser;
            const existingUser = findUserByEmail(fbUser.email);
            if (existingUser) {
                completeLogin(existingUser);
            } else {
                if (fbUser.displayName) $('#setup-name').value = fbUser.displayName;
                goToSetup();
            }
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                showToast('Google sign-in failed. Try again.');
            }
        }
    });

    // Google sign-in (signup page)
    const googleSignupBtn = $('#btn-auth-google-signup');
    if (googleSignupBtn) {
        googleSignupBtn.addEventListener('click', async () => {
            pendingAuthData = { method: 'google' };
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                const result = await firebaseAuth.signInWithPopup(provider);
                const fbUser = result.user;
                pendingAuthData.email = fbUser.email || '';
                pendingAuthData.firebaseUser = fbUser;
                const existingUser = findUserByEmail(fbUser.email);
                if (existingUser) {
                    completeLogin(existingUser);
                } else {
                    if (fbUser.displayName) $('#setup-name').value = fbUser.displayName;
                    goToSetup();
                }
            } catch (err) {
                if (err.code !== 'auth/popup-closed-by-user') {
                    showToast('Google sign-in failed. Try again.');
                }
            }
        });
    }

    // Setup form submit
    $('#form-setup').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#setup-name').value.trim();
        const shopName = $('#setup-shop').value.trim();
        const category = $('#setup-category').value;
        const address = $('#setup-address').value.trim();
        if (!name || !shopName) { showToast('Name and shop name are required'); return; }
        completeSetup(name, shopName, category, address);
    });

    let toastTimer;
    function showToast(message) {
        clearTimeout(toastTimer);
        toastMessage.textContent = message;
        toastEl.classList.remove('hidden');
        toastEl.style.animation = 'toastIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards';
        toastTimer = setTimeout(() => {
            toastEl.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toastEl.classList.add('hidden'), 300);
        }, 2500);
    }

    // ===== NAVIGATION =====
    function showView(viewId) {
        $$('.view').forEach(v => v.classList.remove('active'));
        $(viewId).classList.add('active');

        // Show FAB only on home tab
        if (viewId === '#view-home') {
            fabBtn.style.display = '';
        } else {
            fabBtn.style.display = 'none';
        }
    }

    function setActiveTab(tabName) {
        $$('.nav-tab').forEach(t => t.classList.remove('active'));
        const tab = $(`.nav-tab[data-tab="${tabName}"]`);
        if (tab) tab.classList.add('active');
    }

    function goHome() {
        currentCustomerId = null;
        showView('#view-home');
        setActiveTab('home');
        renderCustomerList();
    }

    function goToProfile(customerId) {
        currentCustomerId = customerId;
        showView('#view-profile');
        // Don't change tab â€” keep current tab highlighted
        renderProfile();
    }

    function goToOwnerProfile() {
        showView('#view-owner');
        setActiveTab('profile');
        renderOwnerProfile();
    }

    function goToPayments() {
        showView('#view-payments');
        setActiveTab('payments');
        renderPaymentsView();
    }

    function updateNavBadge() {
        const data = getData();
        const customers = data.customers || [];
        let pendingCount = 0;
        customers.forEach(c => {
            const txns = c.transactions || [];
            const hasPending = txns.some(t => t.status === 'pending' || t.status === 'partial');
            if (hasPending) pendingCount++;
        });

        const badge = $('#nav-pending-badge');
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // ===== RENDER CUSTOMER LIST =====
    function renderCustomerList(filter = '') {
        const data = getData();
        let customers = data.customers || [];

        customers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (filter) {
            const q = filter.toLowerCase().trim();
            customers = customers.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.phone.includes(q)
            );
        }

        customerListEl.innerHTML = '';

        if (data.customers.length === 0) {
            emptyState.classList.remove('hidden');
            noResults.classList.add('hidden');
            listCount.textContent = '0';
            return;
        }

        emptyState.classList.add('hidden');

        if (customers.length === 0) {
            noResults.classList.remove('hidden');
            listCount.textContent = '0';
            return;
        }

        noResults.classList.add('hidden');
        listCount.textContent = customers.length;
        listTitle.textContent = filter ? 'Search Results' : 'All Customers';

        customers.forEach((customer, index) => {
            const initials = getInitials(customer.name);
            const txns = customer.transactions || [];
            const totalPending = txns.reduce((sum, t) => {
                if (t.status === 'pending') return sum + (t.amount || 0);
                if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
                return sum;
            }, 0);
            const lastVisit = txns.length > 0
                ? formatDateShort(Math.max(...txns.map(t => new Date(t.date).getTime())))
                : 'No visits';

            const item = document.createElement('div');
            item.className = 'customer-item';
            item.style.animationDelay = `${index * 0.04}s`;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.innerHTML = `
                <div class="customer-avatar ${index % 2 === 1 ? 'alt' : ''}">${initials}</div>
                <div class="customer-info">
                    <div class="customer-name">${escapeHtml(customer.name)}</div>
                    <div class="customer-phone">${formatPhone(customer.phone)}</div>
                </div>
                <div class="customer-meta">
                    <div class="customer-txn-count">${txns.length} txn${txns.length !== 1 ? 's' : ''}</div>
                    <div class="customer-last-visit">${lastVisit}</div>
                    ${totalPending > 0 ? `<div class="customer-pending-badge">₹${formatAmount(totalPending)} due</div>` : ''}
                </div>
                ${totalPending > 0 ? `<button class="customer-remind-btn" data-customer-id="${customer.id}" aria-label="Send payment reminder" title="Send WhatsApp Reminder">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                </button>` : ''}
            `;

            item.addEventListener('click', (e) => {
                // Don't navigate if clicking the remind button
                if (e.target.closest('.customer-remind-btn')) return;
                goToProfile(customer.id);
            });
            item.addEventListener('keydown', (e) => { if (e.key === 'Enter') goToProfile(customer.id); });
            customerListEl.appendChild(item);
        });

        updateStats();
    }

    // ===== RENDER PROFILE =====
    function renderProfile() {
        const data = getData();
        const customer = data.customers.find(c => c.id === currentCustomerId);
        if (!customer) { goHome(); return; }

        profileAvatar.textContent = getInitials(customer.name);
        profileName.textContent = customer.name;
        profilePhone.textContent = `ðŸ“ž ${formatPhone(customer.phone)}`;
        profilePhone.href = `tel:${customer.phone}`;

        if (customer.address) {
            profileAddress.textContent = `ðŸ“ ${customer.address}`;
            profileAddress.classList.remove('hidden');
        } else {
            profileAddress.classList.add('hidden');
        }

        if (customer.notes) {
            profileNotes.textContent = `"${customer.notes}"`;
            profileNotes.classList.remove('hidden');
        } else {
            profileNotes.classList.add('hidden');
        }

        profileDate.textContent = `Customer since ${formatDateFull(customer.createdAt)}`;

        const txns = customer.transactions || [];
        const totalSpent = txns.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalPending = txns.reduce((sum, t) => {
            if (t.status === 'pending') return sum + (t.amount || 0);
            if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
            return sum;
        }, 0);

        summaryTotal.textContent = `₹${formatAmount(totalSpent)}`;
        summaryPending.textContent = `₹${formatAmount(totalPending)}`;
        summaryVisits.textContent = txns.length;

        // Show/hide payment reminder button
        const reminderSection = $('#reminder-section');
        if (totalPending > 0) {
            reminderSection.classList.remove('hidden');
            $('#reminder-amount').textContent = `₹${formatAmount(totalPending)} pending`;
        } else {
            reminderSection.classList.add('hidden');
        }

        renderTransactions(txns, customer);
    }

    // ===== RENDER OWNER PROFILE =====
    function renderOwnerProfile() {
        const auth = getAuth();
        const settings = getSettings();

        if (auth && auth.user) {
            $('#owner-profile-avatar').textContent = getInitials(auth.user.name);
            $('#owner-profile-name').textContent = auth.user.name;

            const contact = auth.user.email || (auth.user.phone ? formatPhone(auth.user.phone) : '');
            $('#owner-profile-contact').textContent = contact;

            const method = auth.user.authMethod === 'google' ? 'Google Account' : 'Phone Login';
            $('#owner-profile-method').textContent = method;
        }

        const categoryLabels = {
            general: 'General Store', electronics: 'Electronics', clothing: 'Clothing & Fashion',
            grocery: 'Grocery', pharmacy: 'Pharmacy', hardware: 'Hardware',
            mobile: 'Mobile & Accessories', jewellery: 'Jewellery', other: 'Other'
        };

        $('#owner-shop-name').textContent = settings.shopName || '--';
        $('#owner-shop-category').textContent = categoryLabels[settings.category] || settings.category || '--';
        $('#owner-shop-phone').textContent = settings.shopPhone ? formatPhone(settings.shopPhone) : '--';
        $('#owner-shop-address').textContent = settings.shopAddress || '--';
        $('#owner-shop-gst').textContent = settings.gst || '--';
    }

    // ===== RENDER PAYMENTS VIEW =====
    function renderPaymentsView() {
        const data = getData();
        const customers = data.customers || [];
        const pendingListEl = $('#pending-customer-list');
        const emptyPending = $('#empty-pending');

        // Calculate pending data per customer
        const pendingCustomers = [];
        customers.forEach(c => {
            const txns = c.transactions || [];
            const totalPending = txns.reduce((sum, t) => {
                if (t.status === 'pending') return sum + (t.amount || 0);
                if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
                return sum;
            }, 0);
            const pendingTxnCount = txns.filter(t => t.status === 'pending' || t.status === 'partial').length;
            if (totalPending > 0) {
                pendingCustomers.push({ ...c, totalPending, pendingTxnCount });
            }
        });

        // Sort by highest pending first
        pendingCustomers.sort((a, b) => b.totalPending - a.totalPending);

        const grandTotal = pendingCustomers.reduce((sum, c) => sum + c.totalPending, 0);

        // Update summary cards
        $('#payments-total-pending').textContent = `₹${formatAmount(grandTotal)}`;
        $('#payments-customers-count').textContent = pendingCustomers.length;

        // Render list
        pendingListEl.innerHTML = '';

        if (pendingCustomers.length === 0) {
            emptyPending.classList.remove('hidden');
            return;
        }

        emptyPending.classList.add('hidden');

        const whatsappSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;

        pendingCustomers.forEach((customer, index) => {
            const item = document.createElement('div');
            item.className = 'pending-item';
            item.style.animationDelay = `${index * 0.05}s`;
            item.innerHTML = `
                <div class="pending-avatar">${getInitials(customer.name)}</div>
                <div class="pending-info">
                    <div class="pending-name">${escapeHtml(customer.name)}</div>
                    <div class="pending-detail">${formatPhone(customer.phone)} Â· ${customer.pendingTxnCount} pending txn${customer.pendingTxnCount !== 1 ? 's' : ''}</div>
                </div>
                <div class="pending-right">
                    <span class="pending-amount">₹${formatAmount(customer.totalPending)}</span>
                    <button class="pending-remind-btn" data-customer-id="${customer.id}" title="Send WhatsApp Reminder">
                        ${whatsappSvg}
                    </button>
                </div>
            `;

            // Click on card to go to customer profile
            item.addEventListener('click', (e) => {
                if (e.target.closest('.pending-remind-btn')) return;
                goToProfile(customer.id);
            });

            pendingListEl.appendChild(item);
        });

        // Attach remind handlers
        pendingListEl.querySelectorAll('.pending-remind-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cId = btn.dataset.customerId;
                const c = customers.find(x => x.id === cId);
                if (c) sendPaymentReminder(c);
            });
        });

        // Update nav badge
        updateNavBadge();
    }

    // ===== RENDER TRANSACTIONS =====
    function renderTransactions(transactions, customer) {
        transactionListEl.innerHTML = '';

        if (transactions.length === 0) {
            emptyTransactions.classList.remove('hidden');
            return;
        }

        emptyTransactions.classList.add('hidden');
        const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

        sorted.forEach((txn, index) => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            item.style.animationDelay = `${index * 0.04}s`;

            let amountClass = '';
            if (txn.status === 'pending') amountClass = 'pending';
            if (txn.status === 'partial') amountClass = 'partial';

            let partialInfo = '';
            if (txn.status === 'partial' && txn.paidAmount !== undefined) {
                partialInfo = `<div class="txn-partial-info">Paid: ₹${formatAmount(txn.paidAmount)} / ₹${formatAmount(txn.amount)} â€” Remaining: ₹${formatAmount(txn.amount - txn.paidAmount)}</div>`;
            }

            item.innerHTML = `
                <div class="txn-top">
                    <span class="txn-item-name">${escapeHtml(txn.item)}</span>
                    <span class="txn-amount ${amountClass}">₹${formatAmount(txn.amount)}</span>
                </div>
                <div class="txn-bottom">
                    <span class="txn-date">${formatDateFull(new Date(txn.date).getTime())}</span>
                    <span class="txn-status ${txn.status}">${txn.status}</span>
                </div>
                ${partialInfo}
                ${txn.notes ? `<div class="txn-notes">${escapeHtml(txn.notes)}</div>` : ''}
                <div class="txn-actions">
                    <button class="txn-action-btn receipt" data-txn-id="${txn.id}" title="View Receipt">ðŸ§¾ Receipt</button>
                    <button class="txn-action-btn whatsapp" data-txn-id="${txn.id}" title="Share on WhatsApp">ðŸ“± WhatsApp</button>
                    <button class="txn-action-btn delete" data-txn-id="${txn.id}" title="Delete">ðŸ—‘ï¸ Delete</button>
                </div>
            `;

            transactionListEl.appendChild(item);
        });

        // Attach handlers
        transactionListEl.querySelectorAll('.txn-action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); deleteTransaction(btn.dataset.txnId); });
        });
        transactionListEl.querySelectorAll('.txn-action-btn.receipt').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); showReceipt(btn.dataset.txnId, customer); });
        });
        transactionListEl.querySelectorAll('.txn-action-btn.whatsapp').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); shareOnWhatsApp(btn.dataset.txnId, customer); });
        });
    }

    // ===== RECEIPT =====
    function showReceipt(txnId, customer) {
        const txn = (customer.transactions || []).find(t => t.id === txnId);
        if (!txn) return;

        const settings = getSettings();
        const receiptNum = generateReceiptNumber();
        currentReceiptData = { txn, customer, settings, receiptNum };

        $('#receipt-shop-name').textContent = settings.shopName || 'My Shop';
        $('#receipt-shop-address').textContent = settings.shopAddress || '';
        $('#receipt-shop-phone').textContent = settings.shopPhone ? `ðŸ“ž ${formatPhone(settings.shopPhone)}` : '';
        if (settings.gst) {
            $('#receipt-shop-phone').textContent += ` | GST: ${settings.gst}`;
        }

        $('#receipt-number').textContent = receiptNum;
        $('#receipt-date').textContent = `Date: ${formatDateFull(new Date(txn.date).getTime())}`;
        $('#receipt-customer-name').textContent = customer.name;
        $('#receipt-customer-phone').textContent = `ðŸ“ž ${formatPhone(customer.phone)}`;

        $('#receipt-items').innerHTML = `<tr><td>${escapeHtml(txn.item)}</td><td>₹${formatAmount(txn.amount)}</td></tr>`;
        $('#receipt-total').textContent = `₹${formatAmount(txn.amount)}`;

        const statusLine = $('#receipt-status-line');
        statusLine.className = 'receipt-status-line ' + txn.status;
        if (txn.status === 'paid') statusLine.textContent = 'âœ… PAID IN FULL';
        else if (txn.status === 'pending') statusLine.textContent = `â³ PAYMENT PENDING â€” ₹${formatAmount(txn.amount)}`;
        else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            statusLine.textContent = `ðŸ”„ PARTIAL â€” Paid ₹${formatAmount(paid)}, Due ₹${formatAmount(txn.amount - paid)}`;
        }

        openModal(modalReceipt);
    }

    function generateReceiptText(data) {
        const { txn, customer, settings, receiptNum } = data;
        const divider = 'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”';

        let text = `ðŸ§¾ *${settings.shopName || 'My Shop'}*\n`;
        if (settings.shopAddress) text += `ðŸ“ ${settings.shopAddress}\n`;
        if (settings.shopPhone) text += `ðŸ“ž ${formatPhone(settings.shopPhone)}\n`;
        text += `${divider}\n*Receipt #${receiptNum}*\n`;
        text += `ðŸ“… Date: ${formatDateFull(new Date(txn.date).getTime())}\n${divider}\n`;
        text += `*Bill To:*\nðŸ‘¤ ${customer.name}\nðŸ“ž ${formatPhone(customer.phone)}\n${divider}\n`;
        text += `*Item:* ${txn.item}\n*Amount:* ₹${formatAmount(txn.amount)}\n${divider}\n`;
        text += `*TOTAL: ₹${formatAmount(txn.amount)}*\n`;

        if (txn.status === 'paid') text += `âœ… *PAID IN FULL*\n`;
        else if (txn.status === 'pending') text += `â³ *PAYMENT PENDING*\nðŸ’° Due: ₹${formatAmount(txn.amount)}\n`;
        else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            text += `ðŸ”„ *PARTIAL PAYMENT*\nðŸ’° Paid: ₹${formatAmount(paid)} | Due: ₹${formatAmount(txn.amount - paid)}\n`;
        }

        if (txn.notes) text += `\nðŸ“ _${txn.notes}_\n`;
        text += `${divider}\nThank you for your purchase! ðŸ™\n_Powered by ShopBase_`;
        return text;
    }

    // ===== WHATSAPP =====
    function shareOnWhatsApp(txnId, customer) {
        const txn = (customer.transactions || []).find(t => t.id === txnId);
        if (!txn) return;

        const settings = getSettings();
        const receiptNum = generateReceiptNumber();
        const text = generateReceiptText({ txn, customer, settings, receiptNum });

        let phone = customer.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;

        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        showToast('Opening WhatsApp... ðŸ“±');
    }

    function shareCurrentReceiptOnWhatsApp() {
        if (!currentReceiptData) return;
        const text = generateReceiptText(currentReceiptData);
        let phone = currentReceiptData.customer.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        showToast('Opening WhatsApp... ðŸ“±');
    }

    // ===== PAYMENT REMINDERS =====
    function generateReminderText(customer) {
        const settings = getSettings();
        const txns = customer.transactions || [];
        const pendingTxns = txns.filter(t => t.status === 'pending' || t.status === 'partial');

        if (pendingTxns.length === 0) return null;

        const totalPending = pendingTxns.reduce((sum, t) => {
            if (t.status === 'pending') return sum + (t.amount || 0);
            if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
            return sum;
        }, 0);

        const divider = 'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”';
        let text = `ðŸ”” *Payment Reminder*\n${divider}\n`;
        text += `Dear *${customer.name}*,\n\n`;
        text += `This is a friendly reminder from *${settings.shopName || 'our shop'}* regarding your pending payment.\n\n`;
        text += `ðŸ“‹ *Pending Items:*\n`;

        pendingTxns.forEach(t => {
            const date = formatDateFull(new Date(t.date).getTime());
            if (t.status === 'pending') {
                text += `  â€¢ ${t.item} â€” ₹${formatAmount(t.amount)} (${date})\n`;
            } else if (t.status === 'partial') {
                const remaining = (t.amount || 0) - (t.paidAmount || 0);
                text += `  â€¢ ${t.item} â€” ₹${formatAmount(remaining)} remaining (${date})\n`;
            }
        });

        text += `\n${divider}\n`;
        text += `ðŸ’° *Total Pending: ₹${formatAmount(totalPending)}*\n`;
        text += `${divider}\n\n`;
        text += `Please clear the dues at your earliest convenience.\n\n`;
        text += `Thank you! ðŸ™\n\n`;
        text += `â€” *${settings.shopName || 'My Shop'}*\n`;
        if (settings.shopAddress) text += `ðŸ“ ${settings.shopAddress}\n`;
        if (settings.shopPhone) text += `ðŸ“ž ${formatPhone(settings.shopPhone)}\n`;
        text += `\n_Sent via ShopBase_`;

        return text;
    }

    function sendPaymentReminder(customer) {
        const text = generateReminderText(customer);
        if (!text) {
            showToast('No pending dues for this customer');
            return;
        }

        let phone = customer.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;

        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        showToast('Opening WhatsApp reminder... ðŸ“±');
    }

    function sendReminderForCurrentCustomer() {
        const data = getData();
        const customer = data.customers.find(c => c.id === currentCustomerId);
        if (!customer) return;
        sendPaymentReminder(customer);
    }

    // ===== STATS =====
    function updateStats() {
        const data = getData();
        const customers = data.customers || [];
        const allTxns = customers.flatMap(c => c.transactions || []);

        const totalRevenue = allTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalPending = allTxns.reduce((sum, t) => {
            if (t.status === 'pending') return sum + (t.amount || 0);
            if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
            return sum;
        }, 0);

        $('#stat-customers').textContent = customers.length;
        $('#stat-transactions').textContent = allTxns.length;
        $('#stat-revenue').textContent = `₹${formatAmount(totalRevenue)}`;
        $('#stat-pending').textContent = `₹${formatAmount(totalPending)}`;
        updateNavBadge();
    }

    // ===== CUSTOMER CRUD =====
    function addCustomer(name, phone, email, address, notes) {
        const data = getData();
        const customer = {
            id: generateId(),
            name: name.trim(), phone: phone.trim(), email: email.trim(),
            address: address.trim(), notes: notes.trim(),
            transactions: [], createdAt: Date.now()
        };
        data.customers.push(customer);
        saveData(data);
        return customer;
    }

    function updateCustomer(id, name, phone, email, address, notes) {
        const data = getData();
        const customer = data.customers.find(c => c.id === id);
        if (customer) {
            customer.name = name.trim(); customer.phone = phone.trim();
            customer.email = email.trim(); customer.address = address.trim();
            customer.notes = notes.trim();
            saveData(data);
        }
        return customer;
    }

    function deleteCustomer(id) {
        const data = getData();
        data.customers = data.customers.filter(c => c.id !== id);
        saveData(data);
    }

    // ===== TRANSACTION CRUD =====
    function addTransaction(customerId, item, amount, date, status, paidAmount, notes) {
        const data = getData();
        const customer = data.customers.find(c => c.id === customerId);
        if (!customer) return;
        if (!customer.transactions) customer.transactions = [];

        const txn = {
            id: generateId(),
            item: item.trim(), amount: parseFloat(amount) || 0,
            date, status,
            paidAmount: status === 'partial' ? (parseFloat(paidAmount) || 0) : undefined,
            notes: notes.trim(), createdAt: Date.now()
        };

        customer.transactions.push(txn);
        saveData(data);
        return txn;
    }

    function deleteTransaction(txnId) {
        const data = getData();
        const customer = data.customers.find(c => c.id === currentCustomerId);
        if (!customer) return;
        customer.transactions = (customer.transactions || []).filter(t => t.id !== txnId);
        saveData(data);
        renderProfile();
        showToast('Transaction deleted');
    }

    // ===== EXPORT DATA =====
    function exportData() {
        const data = getData();
        const settings = getSettings();
        const auth = getAuth();

        const exportObj = {
            exportDate: new Date().toISOString(),
            shopName: settings.shopName,
            owner: auth ? auth.user : null,
            settings,
            customers: data.customers
        };

        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shopbase-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported successfully âœ“');
    }

    // ===== MODALS =====
    function openModal(modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
    function closeModal(modal) { modal.classList.add('hidden'); document.body.style.overflow = ''; }

    function openCustomerModal(editId = null) {
        editingCustomerId = editId;
        if (editId) {
            const data = getData();
            const customer = data.customers.find(c => c.id === editId);
            if (customer) {
                $('#modal-customer-title').textContent = 'Edit Customer';
                $('#input-name').value = customer.name;
                $('#input-phone').value = customer.phone;
                $('#input-email').value = customer.email || '';
                $('#input-address').value = customer.address || '';
                $('#input-customer-notes').value = customer.notes || '';
                $('#btn-save-customer').textContent = 'Update Customer';
            }
        } else {
            $('#modal-customer-title').textContent = 'Add Customer';
            formCustomer.reset();
            $('#btn-save-customer').textContent = 'Save Customer';
        }
        openModal(modalCustomer);
        setTimeout(() => $('#input-name').focus(), 100);
    }

    function openTransactionModal() {
        formTransaction.reset();
        $('#input-date').value = new Date().toISOString().split('T')[0];
        $('#input-status').value = 'paid';
        togglePartialField();
        openModal(modalTransaction);
        setTimeout(() => $('#input-item').focus(), 100);
    }

    function openSettingsModal() {
        const settings = getSettings();
        $('#input-shop-name').value = settings.shopName || '';
        $('#input-shop-phone').value = settings.shopPhone || '';
        $('#input-shop-address').value = settings.shopAddress || '';
        $('#input-shop-gst').value = settings.gst || '';
        $('#input-shop-tagline').value = settings.tagline || '';
        openModal(modalSettings);
        setTimeout(() => $('#input-shop-name').focus(), 100);
    }

    function togglePartialField() {
        const status = $('#input-status').value;
        const group = $('#partial-amount-group');
        if (status === 'partial') group.classList.remove('hidden');
        else group.classList.add('hidden');
    }

    // ===== HELPERS =====
    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return parts[0].slice(0, 2).toUpperCase();
    }

    function formatPhone(phone) {
        if (!phone) return '';
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
        return phone;
    }

    function formatAmount(num) {
        if (num === undefined || num === null) return '0';
        return num.toLocaleString('en-IN');
    }
    function formatCurrency(num) {
        return 'Rs.' + formatAmount(num);
    }

    function formatDateShort(timestamp) {
        if (!timestamp) return '--';
        const d = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    function formatDateFull(timestamp) {
        if (!timestamp) return '--';
        return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== EVENT LISTENERS =====

    // Search
    searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        searchClear.classList.toggle('hidden', val.length === 0);
        renderCustomerList(val);
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        renderCustomerList();
        searchInput.focus();
    });

    // Stats toggle
    btnStats.addEventListener('click', () => {
        statsVisible = !statsVisible;
        statsPanel.classList.toggle('hidden', !statsVisible);
        if (statsVisible) updateStats();
    });

    // Bottom Navigation
    $$('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (tabName === 'home') goHome();
            else if (tabName === 'payments') goToPayments();
            else if (tabName === 'profile') goToOwnerProfile();
        });
    });

    // Edit shop from owner profile
    $('#btn-edit-shop').addEventListener('click', openSettingsModal);

    // Export data
    $('#btn-export-data').addEventListener('click', exportData);

    // Logout
    $('#btn-logout').addEventListener('click', () => openModal(modalLogout));
    $('#btn-cancel-logout').addEventListener('click', () => closeModal(modalLogout));
    $('#modal-logout-close').addEventListener('click', () => closeModal(modalLogout));
    $('#btn-confirm-logout').addEventListener('click', () => {
        stopRealtimeSync(); // Stop listening to cloud changes
        firebaseAuth.signOut(); // Sign out from Firebase
        clearAuth();
        closeModal(modalLogout);
        app.classList.add('hidden');
        showAuth();
        showToast('Logged out successfully');
    });

    // Payment reminder (profile page)
    $('#btn-send-reminder').addEventListener('click', sendReminderForCurrentCustomer);

    // Quick remind buttons (customer list) â€” delegated
    customerListEl.addEventListener('click', (e) => {
        const remindBtn = e.target.closest('.customer-remind-btn');
        if (remindBtn) {
            e.stopPropagation();
            const customerId = remindBtn.dataset.customerId;
            const data = getData();
            const customer = data.customers.find(c => c.id === customerId);
            if (customer) sendPaymentReminder(customer);
        }
    });

    // FAB
    $('#fab-add').addEventListener('click', () => openCustomerModal());

    // Back button
    $('#btn-back').addEventListener('click', goHome);

    // Edit customer
    $('#btn-edit-customer').addEventListener('click', () => openCustomerModal(currentCustomerId));

    // Delete customer
    $('#btn-delete-customer').addEventListener('click', () => openModal(modalDelete));
    $('#btn-cancel-delete').addEventListener('click', () => closeModal(modalDelete));
    $('#modal-delete-close').addEventListener('click', () => closeModal(modalDelete));
    $('#btn-confirm-delete').addEventListener('click', () => {
        if (currentCustomerId) {
            deleteCustomer(currentCustomerId);
            closeModal(modalDelete);
            goHome();
            showToast('Customer deleted');
        }
    });

    // Add transaction button
    $('#btn-add-transaction').addEventListener('click', openTransactionModal);

    // Modal close buttons
    $('#modal-customer-close').addEventListener('click', () => closeModal(modalCustomer));
    $('#modal-transaction-close').addEventListener('click', () => closeModal(modalTransaction));
    $('#modal-receipt-close').addEventListener('click', () => closeModal(modalReceipt));
    $('#modal-settings-close').addEventListener('click', () => closeModal(modalSettings));

    // Close modals on overlay click
    [modalCustomer, modalTransaction, modalDelete, modalReceipt, modalSettings, modalLogout].forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    });

    // Partial amount toggle
    $('#input-status').addEventListener('change', togglePartialField);

    // Receipt actions
    $('#btn-share-whatsapp').addEventListener('click', shareCurrentReceiptOnWhatsApp);
    $('#btn-print-receipt').addEventListener('click', () => window.print());

    // Customer form submit
    formCustomer.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#input-name').value;
        const phone = $('#input-phone').value;
        const email = $('#input-email').value;
        const address = $('#input-address').value;
        const notes = $('#input-customer-notes').value;

        if (!name || !phone) { showToast('Name and phone are required'); return; }

        if (editingCustomerId) {
            updateCustomer(editingCustomerId, name, phone, email, address, notes);
            closeModal(modalCustomer);
            showToast('Customer updated âœ“');
            if (currentCustomerId === editingCustomerId) renderProfile();
        } else {
            addCustomer(name, phone, email, address, notes);
            closeModal(modalCustomer);
            showToast('Customer added âœ“');
            renderCustomerList();
        }
        editingCustomerId = null;
    });

    // Transaction form submit
    formTransaction.addEventListener('submit', (e) => {
        e.preventDefault();
        const item = $('#input-item').value;
        const amount = $('#input-amount').value;
        const date = $('#input-date').value;
        const status = $('#input-status').value;
        const paidAmount = $('#input-paid-amount').value;
        const notes = $('#input-txn-notes').value;

        if (!item || !amount || !date) { showToast('Please fill all required fields'); return; }

        addTransaction(currentCustomerId, item, amount, date, status, paidAmount, notes);
        closeModal(modalTransaction);
        renderProfile();
        showToast('Transaction added âœ“');
    });

    // Settings form submit
    formSettings.addEventListener('submit', (e) => {
        e.preventDefault();
        const settings = {
            shopName: $('#input-shop-name').value.trim(),
            shopPhone: $('#input-shop-phone').value.trim(),
            shopAddress: $('#input-shop-address').value.trim(),
            gst: $('#input-shop-gst').value.trim(),
            tagline: $('#input-shop-tagline').value.trim(),
            category: getSettings().category || 'general'
        };

        if (!settings.shopName) { showToast('Shop name is required'); return; }

        saveSettings(settings);
        closeModal(modalSettings);
        updateHeaderFromAuth();

        // If on owner profile, refresh it
        if (viewOwner.classList.contains('active')) renderOwnerProfile();

        showToast('Shop settings saved âœ“');
    });

    // Keyboard: Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [modalCustomer, modalTransaction, modalDelete, modalReceipt, modalSettings, modalLogout].forEach(m => {
                if (!m.classList.contains('hidden')) closeModal(m);
            });
        }
    });

    // Handle back navigation
    window.addEventListener('popstate', () => {
        if (viewProfile.classList.contains('active') || viewOwner.classList.contains('active')) goHome();
    });

    // Logout handlers
    $('#btn-logout').addEventListener('click', () => openModal(modalLogout));
    $('#btn-cancel-logout').addEventListener('click', () => closeModal(modalLogout));
    $('#modal-logout-close').addEventListener('click', () => closeModal(modalLogout));
    $('#btn-confirm-logout').addEventListener('click', async () => {
        closeModal(modalLogout);
        clearAuth();
        try {
            await firebaseAuth.signOut();
        } catch (e) {
            console.error('Firebase signOut error:', e);
        }
        showAuth();
        showToast('Logged out successfully');
    });

    // ===== START =====
    initApp();

})();
