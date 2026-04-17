/* ============================================
   ShopBase — Application Logic (v3)
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
        // Setup invisible reCAPTCHA
        setupRecaptcha();

        setTimeout(() => {
            splash.classList.add('hidden');

            // Listen for Firebase auth state
            firebaseAuth.onAuthStateChanged((firebaseUser) => {
                if (firebaseUser) {
                    // User is signed in with Firebase
                    const auth = getAuth();
                    if (auth && auth.isLoggedIn && auth.user) {
                        showMainApp();
                    } else {
                        // Firebase user exists but no local profile — need setup
                        pendingAuthData.firebaseUser = firebaseUser;
                        pendingAuthData.phone = firebaseUser.phoneNumber || '';
                        pendingAuthData.email = firebaseUser.email || '';
                        pendingAuthData.method = firebaseUser.phoneNumber ? 'phone' : 'google';
                        goToSetup();
                    }
                } else {
                    showAuth();
                }
            });
        }, 2200);
    }

    function setupRecaptcha() {
        try {
            // Clear existing container
            const container = document.getElementById('recaptcha-container');
            if (container) container.innerHTML = '';

            recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                size: 'invisible',
                callback: () => { /* reCAPTCHA solved */ },
                'expired-callback': () => {
                    console.log('reCAPTCHA expired, resetting...');
                    recaptchaVerifier = null;
                }
            });
            recaptchaVerifier.render().catch(err => {
                console.error('reCAPTCHA render error:', err);
            });
        } catch (e) {
            console.error('reCAPTCHA setup error:', e);
        }
    }

    function showAuth() {
        authContainer.classList.remove('hidden');
        app.classList.add('hidden');
        showAuthStep('auth-welcome');
    }

    function showMainApp() {
        authContainer.classList.add('hidden');
        app.classList.remove('hidden');
        updateHeaderFromAuth();
        renderCustomerList();
        updateNavBadge();
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
    function findUserByPhone(phone) {
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);
        try {
            const users = JSON.parse(localStorage.getItem('shopbase_users') || '[]');
            return users.find(u => u.phone.replace(/\D/g, '').slice(-10) === cleanPhone);
        } catch { return null; }
    }

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
            phone: pendingAuthData.phone || (fbUser && fbUser.phoneNumber) || '',
            email: pendingAuthData.email || (fbUser && fbUser.email) || '',
            authMethod: pendingAuthData.method || 'phone',
            firebaseUid: fbUser ? fbUser.uid : null,
            createdAt: Date.now()
        };

        saveUser(user);
        saveAuth({ isLoggedIn: true, user });

        const settings = getSettings();
        settings.shopName = shopName;
        settings.shopPhone = user.phone;
        settings.category = category;
        settings.shopAddress = address;
        saveSettings(settings);

        showMainApp();
        showToast(`Welcome to ShopBase, ${name.split(' ')[0]}! \uD83C\uDF89`);
    }

    // ===== OTP HELPERS =====
    function setPhoneLoading(loading) {
        const btn = $('#btn-phone-continue');
        const text = $('#phone-btn-text');
        const loader = $('#phone-btn-loader');
        btn.disabled = loading;
        text.classList.toggle('hidden', loading);
        loader.classList.toggle('hidden', !loading);
    }

    function setOtpLoading(loading) {
        const btn = $('#btn-otp-verify');
        const text = $('#otp-btn-text');
        const loader = $('#otp-btn-loader');
        btn.disabled = loading;
        text.classList.toggle('hidden', loading);
        loader.classList.toggle('hidden', !loading);
    }

    function clearOtpBoxes() {
        $$('.otp-box').forEach(b => { b.value = ''; b.classList.remove('filled'); });
    }

    function getOtpValue() {
        return Array.from($$('.otp-box')).map(b => b.value).join('');
    }

    function startResendTimer() {
        let seconds = 30;
        const timerEl = $('#resend-timer');
        const btn = $('#btn-resend-otp');
        btn.disabled = true;
        timerEl.textContent = seconds;
        btn.innerHTML = `Resend in <span id="resend-timer">${seconds}</span>s`;

        clearInterval(resendTimer);
        resendTimer = setInterval(() => {
            seconds--;
            const el = $('#resend-timer');
            if (el) el.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(resendTimer);
                btn.disabled = false;
                btn.textContent = 'Resend OTP';
            }
        }, 1000);
    }

    // ===== AUTH EVENT LISTENERS =====

    // Welcome → Phone
    $('#btn-auth-phone').addEventListener('click', () => {
        pendingAuthData = { method: 'phone' };
        showAuthStep('auth-phone');
        setTimeout(() => $('#auth-phone-input').focus(), 200);
    });

    // Welcome → Google (Real Firebase Google Popup)
    $('#btn-auth-google').addEventListener('click', async () => {
        pendingAuthData = { method: 'google' };
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await firebaseAuth.signInWithPopup(provider);
            const fbUser = result.user;

            pendingAuthData.email = fbUser.email || '';
            pendingAuthData.firebaseUser = fbUser;

            // Check if local profile exists
            const existingUser = findUserByEmail(fbUser.email);
            if (existingUser) {
                completeLogin(existingUser);
            } else {
                // Pre-fill setup with Google data
                const setupName = $('#setup-name');
                if (fbUser.displayName) setupName.value = fbUser.displayName;
                goToSetup();
            }
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                showToast('Google sign-in failed. Try again.');
                console.error('Google auth error:', err);
            }
        }
    });

    // Back buttons
    $('#btn-phone-back').addEventListener('click', () => {
        showAuthStep('auth-welcome');
    });
    $('#btn-otp-back').addEventListener('click', () => {
        showAuthStep('auth-phone');
        clearOtpBoxes();
        clearInterval(resendTimer);
    });

    // Phone form submit — Send OTP via Firebase
    $('#form-phone').addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = $('#auth-phone-input').value.replace(/\s/g, '');
        if (phone.length < 10) {
            showToast('Please enter a valid 10-digit phone number');
            return;
        }

        const fullPhone = '+91' + phone.slice(-10);
        pendingAuthData.phone = phone;

        setPhoneLoading(true);

        try {
            // Reset reCAPTCHA if needed
            if (!recaptchaVerifier) setupRecaptcha();

            // Add timeout to prevent infinite loading
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 25000)
            );

            confirmationResult = await Promise.race([
                firebaseAuth.signInWithPhoneNumber(fullPhone, recaptchaVerifier),
                timeoutPromise
            ]);

            // Show OTP screen
            $('#otp-desc').textContent = `Enter the 6-digit code sent to +91 ${phone.slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2')}`;
            clearOtpBoxes();
            $('#otp-error').classList.add('hidden');
            showAuthStep('auth-otp');
            setTimeout(() => $$('.otp-box')[0].focus(), 200);
            startResendTimer();
            showToast('OTP sent! Check your phone \uD83D\uDCF1');
        } catch (err) {
            console.error('OTP send error:', err);
            if (err.message === 'timeout') {
                showToast('Request timed out. Please try again.');
            } else if (err.code === 'auth/too-many-requests') {
                showToast('Too many attempts. Wait a few minutes.');
            } else if (err.code === 'auth/invalid-phone-number') {
                showToast('Invalid phone number format.');
            } else if (err.code === 'auth/quota-exceeded') {
                showToast('Daily SMS limit reached (10/day). Try Google login.');
            } else if (err.code === 'auth/captcha-check-failed') {
                showToast('Security check failed. Refresh and try again.');
            } else {
                showToast(`Error: ${err.code || err.message || 'Unknown'}`);
            }
            // Reset reCAPTCHA for retry
            recaptchaVerifier = null;
            setupRecaptcha();
        } finally {
            setPhoneLoading(false);
        }
    });

    // OTP box behavior (6 digits)
    $$('.otp-box').forEach((box, index) => {
        box.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val;
            if (val && index < 5) $$('.otp-box')[index + 1].focus();
            e.target.classList.toggle('filled', val.length > 0);
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                const prev = $$('.otp-box')[index - 1];
                prev.focus(); prev.value = ''; prev.classList.remove('filled');
            }
        });
        box.addEventListener('focus', (e) => e.target.select());
        // Handle paste
        box.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
            pasteData.split('').forEach((digit, i) => {
                const targetBox = $$('.otp-box')[i];
                if (targetBox) { targetBox.value = digit; targetBox.classList.add('filled'); }
            });
            const lastIndex = Math.min(pasteData.length, 6) - 1;
            if (lastIndex >= 0) $$('.otp-box')[lastIndex].focus();
        });
    });

    // OTP form submit — Verify code via Firebase
    $('#form-otp').addEventListener('submit', async (e) => {
        e.preventDefault();
        const otp = getOtpValue();

        if (otp.length !== 6) {
            showToast('Please enter the full 6-digit code');
            return;
        }

        if (!confirmationResult) {
            showToast('Session expired. Please resend OTP.');
            return;
        }

        setOtpLoading(true);
        $('#otp-error').classList.add('hidden');

        try {
            const result = await confirmationResult.confirm(otp);
            const fbUser = result.user;

            // Check if local user profile exists
            const existingUser = findUserByPhone(fbUser.phoneNumber || pendingAuthData.phone);
            if (existingUser) {
                completeLogin(existingUser);
            } else {
                pendingAuthData.firebaseUser = fbUser;
                goToSetup();
            }
        } catch (err) {
            console.error('OTP verify error:', err);
            $('#otp-error').classList.remove('hidden');
            clearOtpBoxes();
            setTimeout(() => $$('.otp-box')[0].focus(), 100);
            if (err.code === 'auth/invalid-verification-code') {
                showToast('Wrong code. Try again.');
            } else if (err.code === 'auth/code-expired') {
                showToast('Code expired. Please resend.');
            } else {
                showToast('Verification failed. Try again.');
            }
        } finally {
            setOtpLoading(false);
        }
    });

    // Resend OTP
    $('#btn-resend-otp').addEventListener('click', async () => {
        const phone = pendingAuthData.phone;
        if (!phone) return;

        const fullPhone = '+91' + phone.slice(-10);
        try {
            recaptchaVerifier = null;
            setupRecaptcha();
            confirmationResult = await firebaseAuth.signInWithPhoneNumber(fullPhone, recaptchaVerifier);
            showToast('New OTP sent! \uD83D\uDCE8');
            startResendTimer();
            clearOtpBoxes();
            setTimeout(() => $$('.otp-box')[0].focus(), 200);
        } catch (err) {
            console.error('Resend error:', err);
            showToast('Failed to resend. Try again later.');
        }
    });

    // Setup form submit
    $('#form-setup').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#setup-name').value.trim();
        const shopName = $('#setup-shop').value.trim();
        const category = $('#setup-category').value;
        const address = $('#setup-address').value.trim();

        if (!name || !shopName) {
            showToast('Name and shop name are required');
            return;
        }

        completeSetup(name, shopName, category, address);
    });

    // ===== TOAST =====
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
        // Don't change tab — keep current tab highlighted
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
        profilePhone.textContent = `📞 ${formatPhone(customer.phone)}`;
        profilePhone.href = `tel:${customer.phone}`;

        if (customer.address) {
            profileAddress.textContent = `📍 ${customer.address}`;
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
                    <div class="pending-detail">${formatPhone(customer.phone)} · ${customer.pendingTxnCount} pending txn${customer.pendingTxnCount !== 1 ? 's' : ''}</div>
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
                partialInfo = `<div class="txn-partial-info">Paid: ₹${formatAmount(txn.paidAmount)} / ₹${formatAmount(txn.amount)} — Remaining: ₹${formatAmount(txn.amount - txn.paidAmount)}</div>`;
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
                    <button class="txn-action-btn receipt" data-txn-id="${txn.id}" title="View Receipt">🧾 Receipt</button>
                    <button class="txn-action-btn whatsapp" data-txn-id="${txn.id}" title="Share on WhatsApp">📱 WhatsApp</button>
                    <button class="txn-action-btn delete" data-txn-id="${txn.id}" title="Delete">🗑️ Delete</button>
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
        $('#receipt-shop-phone').textContent = settings.shopPhone ? `📞 ${formatPhone(settings.shopPhone)}` : '';
        if (settings.gst) {
            $('#receipt-shop-phone').textContent += ` | GST: ${settings.gst}`;
        }

        $('#receipt-number').textContent = receiptNum;
        $('#receipt-date').textContent = `Date: ${formatDateFull(new Date(txn.date).getTime())}`;
        $('#receipt-customer-name').textContent = customer.name;
        $('#receipt-customer-phone').textContent = `📞 ${formatPhone(customer.phone)}`;

        $('#receipt-items').innerHTML = `<tr><td>${escapeHtml(txn.item)}</td><td>₹${formatAmount(txn.amount)}</td></tr>`;
        $('#receipt-total').textContent = `₹${formatAmount(txn.amount)}`;

        const statusLine = $('#receipt-status-line');
        statusLine.className = 'receipt-status-line ' + txn.status;
        if (txn.status === 'paid') statusLine.textContent = '✅ PAID IN FULL';
        else if (txn.status === 'pending') statusLine.textContent = `⏳ PAYMENT PENDING — ₹${formatAmount(txn.amount)}`;
        else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            statusLine.textContent = `🔄 PARTIAL — Paid ₹${formatAmount(paid)}, Due ₹${formatAmount(txn.amount - paid)}`;
        }

        openModal(modalReceipt);
    }

    function generateReceiptText(data) {
        const { txn, customer, settings, receiptNum } = data;
        const divider = '━━━━━━━━━━━━━━━━━━━━━━';

        let text = `🧾 *${settings.shopName || 'My Shop'}*\n`;
        if (settings.shopAddress) text += `📍 ${settings.shopAddress}\n`;
        if (settings.shopPhone) text += `📞 ${formatPhone(settings.shopPhone)}\n`;
        text += `${divider}\n*Receipt #${receiptNum}*\n`;
        text += `📅 Date: ${formatDateFull(new Date(txn.date).getTime())}\n${divider}\n`;
        text += `*Bill To:*\n👤 ${customer.name}\n📞 ${formatPhone(customer.phone)}\n${divider}\n`;
        text += `*Item:* ${txn.item}\n*Amount:* ₹${formatAmount(txn.amount)}\n${divider}\n`;
        text += `*TOTAL: ₹${formatAmount(txn.amount)}*\n`;

        if (txn.status === 'paid') text += `✅ *PAID IN FULL*\n`;
        else if (txn.status === 'pending') text += `⏳ *PAYMENT PENDING*\n💰 Due: ₹${formatAmount(txn.amount)}\n`;
        else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            text += `🔄 *PARTIAL PAYMENT*\n💰 Paid: ₹${formatAmount(paid)} | Due: ₹${formatAmount(txn.amount - paid)}\n`;
        }

        if (txn.notes) text += `\n📝 _${txn.notes}_\n`;
        text += `${divider}\nThank you for your purchase! 🙏\n_Powered by ShopBase_`;
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
        showToast('Opening WhatsApp... 📱');
    }

    function shareCurrentReceiptOnWhatsApp() {
        if (!currentReceiptData) return;
        const text = generateReceiptText(currentReceiptData);
        let phone = currentReceiptData.customer.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        showToast('Opening WhatsApp... 📱');
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

        const divider = '━━━━━━━━━━━━━━━━━━━━━━';
        let text = `🔔 *Payment Reminder*\n${divider}\n`;
        text += `Dear *${customer.name}*,\n\n`;
        text += `This is a friendly reminder from *${settings.shopName || 'our shop'}* regarding your pending payment.\n\n`;
        text += `📋 *Pending Items:*\n`;

        pendingTxns.forEach(t => {
            const date = formatDateFull(new Date(t.date).getTime());
            if (t.status === 'pending') {
                text += `  • ${t.item} — ₹${formatAmount(t.amount)} (${date})\n`;
            } else if (t.status === 'partial') {
                const remaining = (t.amount || 0) - (t.paidAmount || 0);
                text += `  • ${t.item} — ₹${formatAmount(remaining)} remaining (${date})\n`;
            }
        });

        text += `\n${divider}\n`;
        text += `💰 *Total Pending: ₹${formatAmount(totalPending)}*\n`;
        text += `${divider}\n\n`;
        text += `Please clear the dues at your earliest convenience.\n\n`;
        text += `Thank you! 🙏\n\n`;
        text += `— *${settings.shopName || 'My Shop'}*\n`;
        if (settings.shopAddress) text += `📍 ${settings.shopAddress}\n`;
        if (settings.shopPhone) text += `📞 ${formatPhone(settings.shopPhone)}\n`;
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
        showToast('Opening WhatsApp reminder... 📱');
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
        showToast('Data exported successfully ✓');
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
        clearAuth();
        closeModal(modalLogout);
        app.classList.add('hidden');
        showAuth();
        showToast('Logged out successfully');
    });

    // Payment reminder (profile page)
    $('#btn-send-reminder').addEventListener('click', sendReminderForCurrentCustomer);

    // Quick remind buttons (customer list) — delegated
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
            showToast('Customer updated ✓');
            if (currentCustomerId === editingCustomerId) renderProfile();
        } else {
            addCustomer(name, phone, email, address, notes);
            closeModal(modalCustomer);
            showToast('Customer added ✓');
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
        showToast('Transaction added ✓');
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

        showToast('Shop settings saved ✓');
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
