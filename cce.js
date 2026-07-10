// ================================================================
// Google Sheets API Wrapper
// ================================================================
class GoogleSheetsAPI {
    constructor() {
        this.apiUrl = "https://script.google.com/macros/s/AKfycbzpeKEtwqIaq1Bk5dspezdoozszk0b1s9hA5Bs66RxoRqXi84409GgE2bTCahX7KtRvEQ/exec"; // <-- REPLACE with your deployed URL
        this.cache = new Map();
        this.localCache = this.initLocalCache();
        this.cacheTimeout = 30 * 1000;
    }

    initLocalCache() {
        try {
            const cached = localStorage.getItem('tx_cache');
            return cached ? JSON.parse(cached) : {};
        } catch { return {}; }
    }

    saveLocalCache() {
        try { localStorage.setItem('tx_cache', JSON.stringify(this.localCache)); } catch (e) {}
    }

    async getSheet(sheetName, useCache = true) {
        const cacheKey = sheetName;
        const now = Date.now();
        if (useCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (now - cached.timestamp < this.cacheTimeout) return cached.data;
        }
        if (useCache && this.localCache[cacheKey]) {
            const cached = this.localCache[cacheKey];
            if (now - cached.timestamp < 5 * 60 * 1000) {
                this.cache.set(cacheKey, cached);
                return cached.data;
            }
        }
        try {
            const url = `${this.apiUrl}?sheet=${encodeURIComponent(sheetName)}&t=${now}`;
            const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const cacheData = { data, timestamp: now };
            if (useCache) {
                this.cache.set(cacheKey, cacheData);
                this.localCache[cacheKey] = cacheData;
                this.saveLocalCache();
            }
            return data;
        } catch (error) {
            console.error(`Error fetching ${sheetName}:`, error);
            return { error: error.message };
        }
    }

    async addRow(sheetName, row) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    sheet: sheetName,
                    data: JSON.stringify(row)
                })
            });
            const result = await response.json();
            this.cache.delete(sheetName);
            delete this.localCache[sheetName];
            this.saveLocalCache();
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    // Upload file: accepts base64 data URL or file object
    async uploadFile(username, taskId, fileOrDataUrl) {
        try {
            let base64Data, fileName, fileType;
            if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:image')) {
                // data URL
                const parts = fileOrDataUrl.split(',');
                base64Data = parts[1];
                const mimeMatch = parts[0].match(/data:(image\/[^;]+)/);
                fileType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                fileName = `bill_${taskId}.jpg`;
            } else if (fileOrDataUrl instanceof File) {
                base64Data = await this.fileToBase64(fileOrDataUrl);
                fileName = fileOrDataUrl.name;
                fileType = fileOrDataUrl.type;
            } else {
                throw new Error('Unsupported file type');
            }

            const payload = {
                sheet: 'uploads',
                action: 'uploadFile',
                username: username,
                taskId: taskId,
                fileName: fileName,
                fileType: fileType,
                fileData: base64Data
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ data: JSON.stringify(payload) })
            });
            const result = await response.json();
            this.cache.delete('uploads');
            delete this.localCache['uploads'];
            this.saveLocalCache();
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = (error) => reject(error);
        });
    }

    async updatePassword(username, newPassword) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    sheet: "password_updates",
                    data: JSON.stringify([username, newPassword])
                })
            });
            const result = await response.json();
            this.cache.delete("user_credentials");
            delete this.localCache["user_credentials"];
            this.saveLocalCache();
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    clearCache() {
        this.cache.clear();
        this.localCache = {};
        localStorage.removeItem('tx_cache');
    }
}

const api = new GoogleSheetsAPI();

// ================================================================
// Global State
// ================================================================
let currentUser = null;
let currentPage = 'transactions';
let editingTxId = null;

// ================================================================
// Authentication
// ================================================================
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) { showError('Enter both fields'); return; }
    const btn = document.querySelector('#loginForm button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Signing...';
    btn.disabled = true;
    try {
        const users = await api.getSheet("user_credentials", false);
        if (!users || users.error || !Array.isArray(users)) { showError('Failed to fetch users'); return; }
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            currentUser = {
                username: user.username,
                name: user.full_name || user.username,
                role: user.role || 'user',
                userId: user.username
            };
            sessionStorage.setItem('cce_session', JSON.stringify({ user: currentUser, timestamp: Date.now() }));
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('dashboardContainer').classList.remove('hidden');
            document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.name}`;
            loadUserProfile(username);
            if (currentUser.role === 'admin') {
                document.getElementById('studentNav').classList.add('hidden');
                document.getElementById('adminNav').classList.remove('hidden');
                await loadAdminTxPage();
                showPage('adminTx');
            } else {
                document.getElementById('studentNav').classList.remove('hidden');
                document.getElementById('adminNav').classList.add('hidden');
                await loadUserTransactions();
                showPage('transactions');
            }
            hideError();
            history.pushState(null, '', window.location.href);
        } else {
            showError('Invalid username or password');
        }
    } catch (e) { showError('Network error: ' + e.message); } finally { btn.innerHTML = orig;
        btn.disabled = false; }
}

function logout() {
    sessionStorage.removeItem('cce_session');
    currentUser = null;
    api.clearCache();
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    hideError();
    showLogin();
    history.pushState(null, '', window.location.href);
}

// Session restore
(function restoreSession() {
    const saved = sessionStorage.getItem('cce_session');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.user && data.timestamp && (Date.now() - data.timestamp < 24 * 60 * 60 * 1000)) {
                currentUser = data.user;
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('dashboardContainer').classList.remove('hidden');
                document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.name}`;
                loadUserProfile(currentUser.username);
                if (currentUser.role === 'admin') {
                    document.getElementById('studentNav').classList.add('hidden');
                    document.getElementById('adminNav').classList.remove('hidden');
                    loadAdminTxPage().then(() => showPage('adminTx'));
                } else {
                    document.getElementById('studentNav').classList.remove('hidden');
                    document.getElementById('adminNav').classList.add('hidden');
                    loadUserTransactions().then(() => showPage('transactions'));
                }
            } else { sessionStorage.removeItem('cce_session'); }
        } catch (e) { sessionStorage.removeItem('cce_session'); }
    }
})();

// ================================================================
// UI Helpers
// ================================================================
function showError(msg) { const d = document.getElementById('loginError');
    d.textContent = msg;
    d.classList.remove('hidden'); }

function hideError() { document.getElementById('loginError').classList.add('hidden'); }

function showSignup() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('signupSection').classList.remove('hidden');
    hideError();
}

function showLogin() {
    document.getElementById('signupSection').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
    hideSignupError();
    hideSignupSuccess();
}

function showSignupError(m) { const d = document.getElementById('signupError');
    d.textContent = m;
    d.classList.remove('hidden'); }

function hideSignupError() { document.getElementById('signupError').classList.add('hidden'); }

function showSignupSuccess(m) { const d = document.getElementById('signupSuccess');
    d.textContent = m;
    d.classList.remove('hidden'); }

function hideSignupSuccess() { document.getElementById('signupSuccess').classList.add('hidden'); }

async function submitSignup() {
    const name = document.getElementById('signupName').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const gmail = document.getElementById('signupGmail').value.trim();
    const state = document.getElementById('signupState').value.trim();
    const district = document.getElementById('signupDistrict').value.trim();
    const place = document.getElementById('signupPlace').value.trim();
    const po = document.getElementById('signupPO').value.trim();
    const pin = document.getElementById('signupPinCode').value.trim();
    if (!name || !phone || !state || !district || !place || !po || !pin) { showSignupError('Fill all required'); return; }
    if (!/^\d{6}$/.test(pin)) { showSignupError('Invalid pin code'); return; }
    const btn = document.querySelector('#signupForm button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating...';
    btn.disabled = true;
    try {
        const result = await api.addRow('registration', [name, phone, gmail || '', state, district, place, po, pin,
            new Date().toISOString().split('T')[0]
        ]);
        if (result && (result.success || result.message?.includes('Success'))) {
            showSignupSuccess('Account created! Contact admin for credentials.');
            document.getElementById('signupForm').reset();
            hideSignupError();
        } else { throw new Error(result?.error || 'Unknown error'); }
    } catch (e) { showSignupError('Registration failed: ' + e.message); } finally { btn.innerHTML = orig;
        btn.disabled = false; }
}

function toggleProfileMenu() {
    const m = document.getElementById('profileMenu');
    m.classList.toggle('hidden');
}

function showProfileFallback(img) {
    const fb = document.getElementById('profileFallback');
    img.style.display = 'none';
    fb.classList.remove('hidden');
}

function loadUserProfile(username) {
    const pic = document.getElementById('profilePic');
    const fb = document.getElementById('profileFallback');
    pic.src = `https://quaf.tech/pic/${username}.png`;
    pic.onerror = function() {
        this.onerror = function() {
            this.onerror = function() { this.style.display = 'none';
                fb.classList.remove('hidden'); };
            this.src = `https://quaf.tech/pic/${username}.jpeg`;
        };
        this.src = `https://quaf.tech/pic/${username}.jpg`;
    };
    pic.style.display = 'block';
    fb.classList.add('hidden');
    if (currentUser) {
        document.getElementById('profileName').textContent = currentUser.name;
        document.getElementById('profileUsername').textContent = `@${username}`;
    }
}

document.addEventListener('click', function(e) {
    const container = e.target.closest('.profile-pic-container');
    const menu = document.getElementById('profileMenu');
    if (!container && menu && !menu.classList.contains('hidden')) menu.classList.add('hidden');
});

function showToast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} mr-1"></i>${msg}`;
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentElement) el.remove(); }, 4000);
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
}

// ================================================================
// Navigation
// ================================================================
async function showPage(page) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('border-blue-500', 'text-blue-600'));
    document.getElementById(page + 'Page').classList.remove('hidden');
    const btns = document.querySelectorAll('.nav-btn');
    btns.forEach(b => {
        const txt = b.textContent.toLowerCase();
        if (page === 'transactions' && txt.includes('transactions')) b.classList.add('border-blue-500',
            'text-blue-600');
        else if (page === 'adminTx' && txt.includes('transactions')) b.classList.add('border-blue-500',
            'text-blue-600');
        else if (page === 'adminUsers' && txt.includes('users')) b.classList.add('border-blue-500',
            'text-blue-600');
    });
    currentPage = page;
    if (page === 'transactions') await loadUserTransactions();
    else if (page === 'adminTx') await loadAdminTxPage();
    else if (page === 'adminUsers') await loadAllUsersAdmin();
}

// ================================================================
// Admin: Transactions
// ================================================================
async function loadAdminTxPage() {
    await Promise.all([loadAdminTxList(), loadAdminUsersWithTx()]);
}

async function loadAdminTxList() {
    const container = document.getElementById('adminTxList');
    try {
        const transactions = await getTransactionMaster();
        if (!transactions.length) {
            container.innerHTML =
                `<div class="text-center py-6 text-gray-500"><i class="fas fa-inbox text-3xl mb-2"></i><p>No transactions yet.</p></div>`;
            return;
        }
        transactions.sort((a, b) => {
            const da = a.transaction_date || '';
            const db = b.transaction_date || '';
            if (da !== db) return da < db ? 1 : -1;
            return (a.transaction_time || '') < (b.transaction_time || '') ? 1 : -1;
        });
        let html = `<div class="space-y-2">`;
        transactions.forEach(tx => {
            const mode = tx.mode || '';
            const badgeClass = mode === 'to get' ? 'badge-get' : 'badge-give';
            const dateStr = tx.transaction_date ? formatDate(tx.transaction_date) : 'N/A';
            const timeStr = tx.transaction_time || '';
            const hasBill = tx.bill_url && tx.bill_url.trim() !== '';
            html += `
                        <div class="tx-card">
                            <div class="tx-card-header" onclick="toggleTxCard(this)">
                                <div class="flex items-center gap-3 min-w-0 flex-1">
                                    <span class="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">${tx.transaction_id || 'N/A'}</span>
                                    <span class="tx-title truncate">${tx.title || 'Untitled'}</span>
                                    <span class="tx-badge ${badgeClass}">${mode || 'N/A'}</span>
                                </div>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    <span class="text-xs text-gray-500">${dateStr} ${timeStr}</span>
                                    <button onclick="event.stopPropagation();openEditTxModal('${tx.transaction_id}')" class="edit-tx-btn" title="Edit">
                                        <i class="fas fa-pen"></i>
                                    </button>
                                    <i class="fas fa-chevron-down text-gray-400 transition-transform duration-200"></i>
                                </div>
                            </div>
                            <div class="tx-card-body">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                    <div><span class="font-medium">ID:</span> ${tx.transaction_id}</div>
                                    <div><span class="font-medium">Title:</span> ${tx.title || '-'}</div>
                                    <div><span class="font-medium">Mode:</span> <span class="badge ${badgeClass}">${mode || '-'}</span></div>
                                    <div><span class="font-medium">Date:</span> ${dateStr} ${timeStr}</div>
                                    <div class="md:col-span-2">
                                        <span class="font-medium">Bill:</span>
                                        ${hasBill ? `<a href="${tx.bill_url}" target="_blank" class="bill-link"><i class="fas fa-image mr-1"></i>View Bill</a>` : '<span class="text-gray-400">No bill uploaded</span>'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
        });
        html += `</div>`;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-500 text-center">Error loading transactions</p>`;
    }
}

function toggleTxCard(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector('.fa-chevron-down');
    if (body) {
        body.classList.toggle('open');
        if (chevron) chevron.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

// ================================================================
// Admin: Users with transaction status
// ================================================================
async function loadAdminUsersWithTx() {
    const container = document.getElementById('adminUserCards');
    try {
        const [users, transactions] = await Promise.all([getAllUsers(), getTransactionMaster()]);
        const filtered = users.filter(u => u.role === 'user' || u.role === 'student');
        if (!filtered.length) {
            container.innerHTML =
                `<div class="text-center py-6 text-gray-500"><i class="fas fa-users text-3xl mb-2"></i><p>No users found.</p></div>`;
            return;
        }
        let html = `<div class="space-y-3">`;
        for (const user of filtered) {
            const userTx = await getUserTransactionSheet(user.username);
            const txMap = {};
            userTx.forEach(ut => { txMap[ut.transaction_id] = ut; });
            html += `
                        <div class="user-card">
                            <div class="user-card-header" onclick="toggleUserCard(this)">
                                <div class="flex items-center gap-3">
                                    <div class="avatar avatar-sm">${(user.full_name || user.username).substring(0,2).toUpperCase()}</div>
                                    <span class="user-name">${user.full_name || user.username}</span>
                                    <span class="text-xs text-gray-500">@${user.username}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-gray-500">${transactions.length} tx</span>
                                    <i class="fas fa-chevron-down text-gray-400 transition-transform duration-200"></i>
                                </div>
                            </div>
                            <div class="user-card-body">
                                ${transactions.length ? transactions.map(tx => {
                                    const status = txMap[tx.transaction_id];
                                    const statusLabel = status ? status.status || 'pending' : 'pending';
                                    const badgeClass = statusLabel === 'completed' ? 'badge-completed' : statusLabel === 'no' ? 'badge-no' : statusLabel === 'to get' ? 'badge-get' : statusLabel === 'to give' ? 'badge-give' : 'badge-pending';
                                    const rupees = status && status.rupees ? status.rupees : '-';
                                    return `
                                        <div class="tx-item-row" onclick="event.stopPropagation();openUserTxStatusModal('${user.username}','${user.full_name || user.username}','${tx.transaction_id}','${tx.title || ''}')">
                                            <div class="flex items-center gap-2 min-w-0 flex-1">
                                                <span class="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">${tx.transaction_id}</span>
                                                <span class="truncate text-sm">${tx.title || 'Untitled'}</span>
                                            </div>
                                            <div class="flex items-center gap-2 flex-shrink-0">
                                                <span class="badge ${badgeClass}">${statusLabel}</span>
                                                ${rupees !== '-' ? `<span class="text-sm font-medium">₹${rupees}</span>` : ''}
                                                <i class="fas fa-chevron-right text-gray-300 text-xs"></i>
                                            </div>
                                        </div>
                                    `;
                                }).join('') : '<div class="text-gray-400 text-sm py-2">No transactions available</div>'}
                            </div>
                        </div>
                    `;
        }
        html += `</div>`;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-500 text-center">Error loading users</p>`;
    }
}

function toggleUserCard(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector('.fa-chevron-down');
    if (body) {
        body.classList.toggle('open');
        if (chevron) chevron.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

// ================================================================
// Admin: Add / Edit Transaction Modal
// ================================================================
async function openAddTxModal() {
    editingTxId = null;
    document.getElementById('txModalTitle').textContent = 'Add Transaction';
    document.getElementById('txEditId').value = '';
    document.getElementById('txForm').reset();
    document.getElementById('txBillUrl').value = '';
    document.getElementById('txBillPreview').classList.add('hidden');
    document.getElementById('txFormError').classList.add('hidden');
    document.getElementById('txId').value = await generateTxId();
    const now = new Date();
    document.getElementById('txDate').value = now.toISOString().split('T')[0];
    document.getElementById('txTime').value = now.toTimeString().slice(0, 5);
    document.getElementById('txModal').classList.remove('hidden');
}

async function openEditTxModal(txId) {
    try {
        const transactions = await getTransactionMaster();
        const tx = transactions.find(t => t.transaction_id === txId);
        if (!tx) { showToast('Transaction not found', 'error'); return; }
        editingTxId = txId;
        document.getElementById('txModalTitle').textContent = 'Edit Transaction';
        document.getElementById('txEditId').value = txId;
        document.getElementById('txId').value = tx.transaction_id || '';
        document.getElementById('txTitle').value = tx.title || '';
        document.getElementById('txMode').value = tx.mode || '';
        document.getElementById('txDate').value = tx.transaction_date || '';
        document.getElementById('txTime').value = tx.transaction_time || '';
        document.getElementById('txBillUrl').value = tx.bill_url || '';
        if (tx.bill_url && tx.bill_url.trim() !== '') {
            document.getElementById('txBillPreview').classList.remove('hidden');
            document.getElementById('txBillPreviewImg').src = tx.bill_url;
            document.getElementById('txBillFileName').textContent = 'Current bill';
        } else {
            document.getElementById('txBillPreview').classList.add('hidden');
        }
        document.getElementById('txFormError').classList.add('hidden');
        document.getElementById('txModal').classList.remove('hidden');
    } catch (e) {
        showToast('Error loading transaction', 'error');
        console.error(e);
    }
}

function closeTxModal() {
    document.getElementById('txModal').classList.add('hidden');
    editingTxId = null;
}

document.getElementById('txBillFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image', 'error'); return; }
    const reader = new FileReader();
    reader.onload = function(ev) {
        document.getElementById('txBillPreview').classList.remove('hidden');
        document.getElementById('txBillPreviewImg').src = ev.target.result;
        document.getElementById('txBillFileName').textContent = file.name;
        document.getElementById('txBillUrl').value = ev.target.result;
    };
    reader.readAsDataURL(file);
});

async function generateTxId() {
    const txs = await getTransactionMaster();
    if (!txs.length) return 'TX001';
    const ids = txs.map(t => t.transaction_id).filter(id => id && id.startsWith('TX'));
    if (!ids.length) return 'TX001';
    const nums = ids.map(id => parseInt(id.substring(2))).filter(n => !isNaN(n));
    if (!nums.length) return 'TX001';
    const next = Math.max(...nums) + 1;
    return `TX${String(next).padStart(3, '0')}`;
}

document.getElementById('txForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const err = document.getElementById('txFormError');
    err.classList.add('hidden');
    const title = document.getElementById('txTitle').value.trim();
    const mode = document.getElementById('txMode').value;
    const txDate = document.getElementById('txDate').value;
    const txTime = document.getElementById('txTime').value;
    const billUrl = document.getElementById('txBillUrl').value.trim();
    const editId = document.getElementById('txEditId').value.trim();
    if (!title || !mode || !txDate || !txTime) {
        err.textContent = 'Please fill all required fields.';
        err.classList.remove('hidden');
        return;
    }
    const btn = document.getElementById('txSubmitBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
    btn.disabled = true;
    try {
        let finalBillUrl = billUrl;
        if (billUrl && billUrl.startsWith('data:image')) {
            const uploadResult = await api.uploadFile('admin', 'tx_bill_' + Date.now(), billUrl);
            if (uploadResult && uploadResult.success) {
                finalBillUrl = uploadResult.fileUrl;
            } else {
                throw new Error('Failed to upload bill image: ' + (uploadResult?.error || 'Unknown error'));
            }
        }
        const txId = editId || document.getElementById('txId').value;
        const rowData = [txId, title, mode, finalBillUrl, txDate, txTime];
        const result = await api.addRow('transaction_master', rowData);
        if (result && (result.success || result.message?.includes('Success'))) {
            showToast(editId ? 'Transaction updated!' : 'Transaction added!', 'success');
            closeTxModal();
            await loadAdminTxList();
            await loadAdminUsersWithTx();
        } else {
            throw new Error(result?.error || 'Failed to save');
        }
    } catch (e) {
        err.textContent = 'Error: ' + e.message;
        err.classList.remove('hidden');
        console.error(e);
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
});

// ================================================================
// Admin: User Transaction Status Modal
// ================================================================
let utsContext = { username: '', txId: '' };

async function openUserTxStatusModal(username, fullName, txId, txTitle) {
    utsContext.username = username;
    utsContext.txId = txId;
    document.getElementById('utsUsername').value = username;
    document.getElementById('utsTxId').value = txId;
    document.getElementById('utsUserDisplay').textContent = fullName || username;
    document.getElementById('utsTxDisplay').textContent = `${txId} - ${txTitle || 'Untitled'}`;
    document.getElementById('utsFormError').classList.add('hidden');
    document.getElementById('utsStatus').value = '';
    document.getElementById('utsRupees').value = '';
    try {
        const userTx = await getUserTransactionSheet(username);
        const existing = userTx.find(t => t.transaction_id === txId);
        if (existing) {
            document.getElementById('utsStatus').value = existing.status || '';
            document.getElementById('utsRupees').value = existing.rupees || '';
            document.getElementById('utsDate').value = existing.update_date || new Date().toISOString().split('T')[0];
            document.getElementById('utsTime').value = existing.update_time || new Date().toTimeString().slice(0, 5);
        } else {
            const now = new Date();
            document.getElementById('utsDate').value = now.toISOString().split('T')[0];
            document.getElementById('utsTime').value = now.toTimeString().slice(0, 5);
        }
    } catch (e) { console.error(e); }
    document.getElementById('userTxStatusModal').classList.remove('hidden');
}

function closeUserTxStatusModal() {
    document.getElementById('userTxStatusModal').classList.add('hidden');
}

document.getElementById('userTxStatusForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const err = document.getElementById('utsFormError');
    err.classList.add('hidden');
    const username = document.getElementById('utsUsername').value;
    const txId = document.getElementById('utsTxId').value;
    const status = document.getElementById('utsStatus').value;
    const rupees = document.getElementById('utsRupees').value.trim();
    const updateDate = document.getElementById('utsDate').value;
    const updateTime = document.getElementById('utsTime').value;
    if (!username || !txId || !status || !updateDate || !updateTime) {
        err.textContent = 'Please fill all required fields.';
        err.classList.remove('hidden');
        return;
    }
    if ((status === 'completed' || status === 'no') && (!rupees || isNaN(parseFloat(rupees)))) {
        err.textContent = 'Please enter a valid Rupees amount for this status.';
        err.classList.remove('hidden');
        return;
    }
    const btn = document.getElementById('utsSubmitBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';
    btn.disabled = true;
    try {
        const rowData = [txId, status, rupees || '', updateDate, updateTime];
        const result = await api.addRow(`${username}_transaction`, rowData);
        if (result && (result.success || result.message?.includes('Success'))) {
            showToast('Status updated for ' + username, 'success');
            closeUserTxStatusModal();
            await loadAdminUsersWithTx();
        } else {
            throw new Error(result?.error || 'Failed to update');
        }
    } catch (e) {
        err.textContent = 'Error: ' + e.message;
        err.classList.remove('hidden');
        console.error(e);
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
});

// ================================================================
// User: Load Transactions
// ================================================================
async function loadUserTransactions() {
    const container = document.getElementById('userTransactionCards');
    try {
        const [transactions, userTx] = await Promise.all([
            getTransactionMaster(),
            getUserTransactionSheet(currentUser.username)
        ]);
        if (!transactions.length) {
            container.innerHTML =
                `<div class="text-center py-8 text-gray-500"><i class="fas fa-inbox text-4xl mb-3"></i><p>No transactions available.</p></div>`;
            return;
        }
        const txMap = {};
        userTx.forEach(ut => { txMap[ut.transaction_id] = ut; });
        transactions.sort((a, b) => {
            const da = a.transaction_date || '';
            const db = b.transaction_date || '';
            if (da !== db) return da < db ? 1 : -1;
            return (a.transaction_time || '') < (b.transaction_time || '') ? 1 : -1;
        });
        let html = `<div class="space-y-3">`;
        transactions.forEach(tx => {
            const status = txMap[tx.transaction_id];
            const statusLabel = status ? status.status || 'pending' : 'pending';
            const badgeClass = statusLabel === 'completed' ? 'badge-completed' : statusLabel === 'no' ?
                'badge-no' : statusLabel === 'to get' ? 'badge-get' : statusLabel === 'to give' ?
                'badge-give' : 'badge-pending';
            const rupees = status && status.rupees ? status.rupees : '-';
            const mode = tx.mode || '';
            const modeBadge = mode === 'to get' ? 'badge-get' : 'badge-give';
            const dateStr = tx.transaction_date ? formatDate(tx.transaction_date) : 'N/A';
            const timeStr = tx.transaction_time || '';
            const hasBill = tx.bill_url && tx.bill_url.trim() !== '';
            const updateDate = status && status.update_date ? formatDate(status.update_date) : '-';
            const updateTime = status && status.update_time ? status.update_time : '-';
            html += `
                        <div class="tx-card">
                            <div class="tx-card-header" onclick="toggleTxCard(this)">
                                <div class="flex items-center gap-3 min-w-0 flex-1">
                                    <span class="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">${tx.transaction_id || 'N/A'}</span>
                                    <span class="tx-title truncate">${tx.title || 'Untitled'}</span>
                                    <span class="tx-badge ${modeBadge}">${mode || 'N/A'}</span>
                                </div>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    <span class="badge ${badgeClass}">${statusLabel}</span>
                                    ${rupees !== '-' ? `<span class="text-sm font-medium">₹${rupees}</span>` : ''}
                                    <i class="fas fa-chevron-down text-gray-400 transition-transform duration-200"></i>
                                </div>
                            </div>
                            <div class="tx-card-body">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                    <div><span class="font-medium">ID:</span> ${tx.transaction_id}</div>
                                    <div><span class="font-medium">Title:</span> ${tx.title || '-'}</div>
                                    <div><span class="font-medium">Mode:</span> <span class="badge ${modeBadge}">${mode || '-'}</span></div>
                                    <div><span class="font-medium">Transaction Date:</span> ${dateStr} ${timeStr}</div>
                                    <div><span class="font-medium">Your Status:</span> <span class="badge ${badgeClass}">${statusLabel}</span></div>
                                    <div><span class="font-medium">Rupees:</span> ${rupees !== '-' ? `₹${rupees}` : '-'}</div>
                                    <div><span class="font-medium">Last Updated:</span> ${updateDate} ${updateTime}</div>
                                    <div>
                                        <span class="font-medium">Bill:</span>
                                        ${hasBill ? `<a href="${tx.bill_url}" target="_blank" class="bill-link"><i class="fas fa-image mr-1"></i>View Bill</a>` : '<span class="text-gray-400">No bill</span>'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
        });
        html += `</div>`;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-500 text-center">Error loading transactions</p>`;
    }
}

// ================================================================
// Admin: All Users Page (standalone)
// ================================================================
async function loadAllUsersAdmin() {
    const container = document.getElementById('adminUsersList');
    try {
        const users = await getAllUsers();
        const filtered = users.filter(u => u.role === 'user' || u.role === 'student');
        if (!filtered.length) {
            container.innerHTML =
                `<div class="text-center py-8 text-gray-500"><i class="fas fa-users text-4xl mb-3"></i><p>No users found.</p></div>`;
            return;
        }
        let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
        for (const user of filtered) {
            const userTx = await getUserTransactionSheet(user.username);
            const txCount = userTx.length;
            const completed = userTx.filter(t => t.status === 'completed').length;
            html += `
                        <div class="card">
                            <div class="flex items-center gap-3 mb-2">
                                <div class="avatar">${(user.full_name || user.username).substring(0,2).toUpperCase()}</div>
                                <div>
                                    <div class="font-bold text-gray-800">${user.full_name || user.username}</div>
                                    <div class="text-sm text-gray-500">@${user.username}</div>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-2 text-center text-sm">
                                <div><span class="font-bold text-blue-600">${txCount}</span><br><span class="text-gray-500">Total</span></div>
                                <div><span class="font-bold text-green-600">${completed}</span><br><span class="text-gray-500">Completed</span></div>
                                <div><span class="font-bold text-gray-600">${txCount - completed}</span><br><span class="text-gray-500">Pending</span></div>
                            </div>
                        </div>
                    `;
        }
        html += `</div>`;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-500 text-center">Error loading users</p>`;
    }
}

// ================================================================
// Data Fetching Helpers
// ================================================================
async function getTransactionMaster() {
    const data = await api.getSheet('transaction_master');
    return (data && Array.isArray(data)) ? data : [];
}

async function getUserTransactionSheet(username) {
    const data = await api.getSheet(`${username}_transaction`);
    return (data && Array.isArray(data)) ? data : [];
}

async function getAllUsers() {
    const data = await api.getSheet('user_credentials');
    return (data && Array.isArray(data)) ? data : [];
}

// ================================================================
// Change Password (already defined inline, but keep for completeness)
// ================================================================
function openChangePasswordModal() {
    document.getElementById('profileMenu').classList.add('hidden');
    document.getElementById('changePasswordModal').classList.remove('hidden');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('cpError').classList.add('hidden');
    document.getElementById('cpSuccess').classList.add('hidden');
}

function closeChangePasswordModal() { document.getElementById('changePasswordModal').classList.add('hidden'); }

document.getElementById('changePasswordForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const cur = document.getElementById('currentPassword').value.trim();
    const nw = document.getElementById('newPassword').value.trim();
    const cf = document.getElementById('confirmPassword').value.trim();
    const err = document.getElementById('cpError');
    const suc = document.getElementById('cpSuccess');
    err.classList.add('hidden');
    suc.classList.add('hidden');
    if (!cur || !nw || !cf) { err.textContent = 'Fill all fields';
        err.classList.remove('hidden'); return; }
    if (nw.length < 6) { err.textContent = 'New password min 6 chars';
        err.classList.remove('hidden'); return; }
    if (nw !== cf) { err.textContent = 'Passwords do not match';
        err.classList.remove('hidden'); return; }
    if (nw === cur) { err.textContent = 'New password must be different';
        err.classList.remove('hidden'); return; }
    const btn = this.querySelector('button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...';
    btn.disabled = true;
    try {
        const users = await api.getSheet("user_credentials", false);
        const user = users.find(u => u.username === currentUser.username && u.password === cur);
        if (!user) { throw new Error('Current password is incorrect'); }
        const result = await api.updatePassword(currentUser.username, nw);
        if (result && result.success) {
            suc.textContent = 'Password changed! Logging out in 3s...';
            suc.classList.remove('hidden');
            setTimeout(() => { closeChangePasswordModal();
                logout(); }, 3000);
        } else { throw new Error(result?.error || 'Update failed'); }
    } catch (e) { err.textContent = e.message;
        err.classList.remove('hidden'); } finally { btn.innerHTML = orig;
        btn.disabled = false; }
});

// ================================================================
// Close modals on overlay click
// ================================================================
document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.add('hidden');
        }
    });
});

// ================================================================
// Keyboard shortcuts
// ================================================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }
});

// ================================================================
// Prevent context menu & dev tools
// ================================================================
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12') e.preventDefault();
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) e.preventDefault();
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) e.preventDefault();
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) e.preventDefault();
});

console.log('📊 Transaction System Loaded');
