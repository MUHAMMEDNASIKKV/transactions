// =============================
// 🌐 GLOBAL VARIABLES
// =============================
let currentUser = null;
let currentPage = 'adminTransactions';
let currentEditTransaction = null;
let currentEditUserTransaction = null;

// =============================
// 📊 GOOGLE SHEETS API
// =============================
class GoogleSheetsAPI {
    constructor() {
        this.apiUrl = "https://script.google.com/macros/s/AKfycbwByREwBLJdWx2Mxe6s97fNSNCxnHgLleyqdQ5o5-b5L5HeEeoSa1RM2ocof2Z-HYpyzw/exec";
        this.cache = new Map();
        this.localCache = this.initLocalCache();
        this.cacheTimeout = 30 * 1000;
    }

    initLocalCache() {
        try {
            const cached = localStorage.getItem('transaction_cache');
            return cached ? JSON.parse(cached) : {};
        } catch { return {}; }
    }

    saveLocalCache() {
        try {
            localStorage.setItem('transaction_cache', JSON.stringify(this.localCache));
        } catch (e) { console.warn('Cache save failed:', e); }
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

    async getBatchSheets(sheetNames) {
        const promises = sheetNames.map(name => this.getSheet(name));
        const results = await Promise.all(promises);
        const batchResult = {};
        sheetNames.forEach((name, index) => { batchResult[name] = results[index]; });
        return batchResult;
    }

    clearCache() {
        this.cache.clear();
        this.localCache = {};
        localStorage.removeItem('transaction_cache');
    }

    async addRow(sheetName, row) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ sheet: sheetName, data: JSON.stringify(row) })
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

    async uploadFile(username, transactionId, file) {
        try {
            const base64Data = await this.fileToBase64(file);
            const payload = {
                sheet: 'uploads',
                action: 'uploadFile',
                username: username,
                transactionId: transactionId,
                fileName: file.name,
                fileType: file.type,
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
            reader.onload = () => { resolve(reader.result.split(',')[1]); };
            reader.onerror = (error) => reject(error);
        });
    }

    async updateTransaction(transactionId, title, mode, amount, billUrl, date) {
        try {
            const payload = {
                action: 'updateTransaction',
                transactionId: transactionId,
                title: title,
                mode: mode,
                amount: amount,
                billUrl: billUrl,
                date: date
            };
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ data: JSON.stringify(payload) })
            });
            const result = await response.json();
            this.cache.delete('transaction_master');
            delete this.localCache['transaction_master'];
            this.saveLocalCache();
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async updateUserTransaction(username, transactionId, status, amount, date) {
        try {
            const payload = {
                action: 'updateUserTransaction',
                username: username,
                transactionId: transactionId,
                status: status,
                amount: amount,
                date: date
            };
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ data: JSON.stringify(payload) })
            });
            const result = await response.json();
            const cacheKey = `${username}_transactions`;
            this.cache.delete(cacheKey);
            delete this.localCache[cacheKey];
            this.saveLocalCache();
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async getUserTransactions(username) {
        try {
            const cacheKey = `${username}_transactions`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) return cached.data;
            }
            const response = await fetch(`${this.apiUrl}?sheet=${username}_transactions&t=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const cacheData = { data, timestamp: Date.now() };
            this.cache.set(cacheKey, cacheData);
            this.localCache[cacheKey] = cacheData;
            this.saveLocalCache();
            return data;
        } catch (error) {
            console.error(`Error fetching user transactions:`, error);
            return { error: error.message };
        }
    }

    async addUser(username, fullName, password, role = 'user') {
        try {
            const payload = {
                action: 'addUser',
                username: username,
                fullName: fullName,
                password: password,
                role: role
            };
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ data: JSON.stringify(payload) })
            });
            const result = await response.json();
            this.cache.delete('user_credentials');
            delete this.localCache['user_credentials'];
            this.saveLocalCache();
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async syncTransactionToAllUsers(transactionId, title, mode, amount, billUrl, date) {
        try {
            const payload = {
                action: 'syncTransactionToAllUsers',
                transactionId: transactionId,
                title: title,
                mode: mode,
                amount: amount,
                billUrl: billUrl,
                date: date
            };
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ data: JSON.stringify(payload) })
            });
            const result = await response.json();
            // Clear all user transaction caches
            const users = await this.getSheet('user_credentials');
            if (users && Array.isArray(users)) {
                users.forEach(u => {
                    const key = `${u.username}_transactions`;
                    this.cache.delete(key);
                    delete this.localCache[key];
                });
                this.saveLocalCache();
            }
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }
}

const api = new GoogleSheetsAPI();

// =============================
// 🔑 AUTHENTICATION
// =============================
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    const loginBtn = document.querySelector('#loginForm button[type="submit"]');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Signing In...';
    loginBtn.disabled = true;

    try {
        const users = await api.getSheet("user_credentials", false);
        if (!users || users.error || !Array.isArray(users)) {
            showError('Failed to fetch user data');
            return;
        }
        const user = users.find(u => u.username === username && u.password === password);

        if (user) {
            currentUser = {
                username: user.username,
                name: user.full_name || user.username,
                role: user.role || 'user',
                userId: user.username
            };

            sessionStorage.setItem('transaction_session', JSON.stringify({
                user: currentUser,
                timestamp: Date.now()
            }));

            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('dashboardContainer').classList.remove('hidden');
            document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.name}`;
            loadUserProfile(username);

            if (currentUser.role === 'admin') {
                document.getElementById('userNav').classList.add('hidden');
                document.getElementById('adminNav').classList.remove('hidden');
                await loadAdminData();
                showPage('adminTransactions');
            } else {
                document.getElementById('adminNav').classList.add('hidden');
                document.getElementById('userNav').classList.remove('hidden');
                await loadUserTransactions();
                showPage('userTransactions');
            }
            setTimeout(() => preloadCriticalData(), 100);
            hideError();
            history.pushState(null, '', window.location.href);
        } else {
            showError('Invalid username or password');
        }
    } catch (error) {
        showError('Network error: ' + error.message);
    } finally {
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

function logout() {
    sessionStorage.removeItem('transaction_session');
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

// =============================
// 📍 NAVIGATION
// =============================
async function showPage(page) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

    const pageEl = document.getElementById(page + 'Page');
    if (pageEl) pageEl.classList.remove('hidden');

    const tabBtn = document.querySelector(`.nav-tab[data-page="${page}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    currentPage = page;

    if (page === 'adminTransactions') await loadAdminTransactions();
    else if (page === 'adminUsers') await loadAdminUsers();
    else if (page === 'userTransactions') await loadUserTransactions();
}

// =============================
// 👨‍💼 ADMIN FUNCTIONS
// =============================
async function loadAdminData() {
    try {
        await loadAdminTransactions();
    } catch (error) {
        console.error('Error loading admin data:', error);
    }
}

async function loadAdminTransactions() {
    const container = document.getElementById('adminTransactionsList');
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-primary"></i><p class="mt-2 text-muted">Loading transactions...</p></div>';

    try {
        const transactions = await api.getSheet('transaction_master');
        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <h3>No transactions found</h3>
                    <p>Click "Add Transaction" to create one.</p>
                </div>
            `;
            return;
        }

        const sorted = transactions.sort((a, b) => {
            const dateA = new Date(a.date || a.transaction_date || 0);
            const dateB = new Date(b.date || b.transaction_date || 0);
            return dateB - dateA;
        });

        const html = sorted.map(t => {
            const mode = t.mode || 'to get';
            const modeClass = mode === 'to get' ? 'get' : 'give';
            const icon = mode === 'to get' ? 'fa-arrow-down' : 'fa-arrow-up';
            const amount = t.amount || 0;
            const dateStr = t.date || t.transaction_date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) : 'N/A';
            const tid = t.transaction_id || t.id;

            return `
                <div class="tx-card" onclick="toggleTxDetails('${tid}')">
                    <div class="tx-header">
                        <div class="tx-left">
                            <div class="tx-icon ${modeClass}"><i class="fas ${icon}"></i></div>
                            <div class="tx-info">
                                <div class="tx-title">${t.title || 'Untitled'}</div>
                                <div class="tx-meta">${formattedDate} • ₹${amount}</div>
                            </div>
                        </div>
                        <div class="tx-right">
                            <span class="badge badge-${modeClass}">${mode}</span>
                            <i class="fas fa-chevron-down tx-expand" id="tx-arrow-${tid}"></i>
                        </div>
                    </div>
                    <div class="tx-details" id="tx-details-${tid}">
                        <div class="tx-details-grid">
                            <div class="tx-detail-item">
                                <div class="label">Transaction ID</div>
                                <div class="value">${tid}</div>
                            </div>
                            <div class="tx-detail-item">
                                <div class="label">Mode</div>
                                <div class="value"><span class="badge badge-${modeClass}">${mode}</span></div>
                            </div>
                            <div class="tx-detail-item">
                                <div class="label">Amount</div>
                                <div class="value">₹${amount}</div>
                            </div>
                            <div class="tx-detail-item">
                                <div class="label">Date</div>
                                <div class="value">${formattedDate}</div>
                            </div>
                            <div class="tx-detail-item" style="grid-column:1/-1;">
                                <div class="label">Bill</div>
                                <div class="value">${t.bill_url ? `<a href="${t.bill_url}" target="_blank" class="text-primary hover:underline"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 'No bill uploaded'}</div>
                            </div>
                        </div>
                        <div class="mt-3 flex gap-2">
                            <button onclick="event.stopPropagation(); openEditTransactionModal('${tid}')" class="btn-warning" style="padding:0.4rem 1rem;font-size:0.8rem;">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading admin transactions:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>Error loading transactions.</p></div>';
    }
}

function toggleTxDetails(id) {
    const details = document.getElementById(`tx-details-${id}`);
    const arrow = document.getElementById(`tx-arrow-${id}`);
    if (details) {
        details.classList.toggle('open');
        if (arrow) arrow.classList.toggle('open');
    }
}

async function loadAdminUsers() {
    const container = document.getElementById('adminUsersList');
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-primary"></i><p class="mt-2 text-muted">Loading users...</p></div>';

    try {
        const users = await api.getSheet('user_credentials');
        if (!users || users.error || !Array.isArray(users) || users.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <i class="fas fa-users"></i>
                    <h3>No users found</h3>
                    <p>Click "Add User" to create one.</p>
                </div>
            `;
            return;
        }

        const allTransactions = await api.getSheet('transaction_master');
        const txMap = {};
        if (allTransactions && Array.isArray(allTransactions)) {
            allTransactions.forEach(t => { txMap[t.transaction_id || t.id] = t; });
        }

        const userPromises = users.map(async (user) => {
            const userTx = await api.getUserTransactions(user.username);
            return { ...user, transactions: userTx && Array.isArray(userTx) ? userTx : [] };
        });

        const usersWithTx = await Promise.all(userPromises);

        const html = usersWithTx.map(user => {
            const initials = user.full_name ? 
                user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 
                user.username.substring(0, 2).toUpperCase();

            const txItems = user.transactions.map(t => {
                const master = txMap[t.transaction_id];
                const title = master ? master.title : 'Unknown';
                const mode = master ? master.mode : 'to get';
                const status = t.status || 'pending';
                const statusClass = status === 'completed' ? 'completed' : status === 'no' ? 'no' : status === 'to get' ? 'get' : 'give';
                const amount = t.amount || 0;

                return `
                    <div class="user-tx-item">
                        <div class="tx-info">
                            <div class="font-medium text-sm">${title}</div>
                            <div class="text-xs text-muted">${t.date || 'N/A'}</div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="badge badge-${statusClass}">${status}</span>
                            ${amount > 0 ? `<span class="font-bold text-sm">₹${amount}</span>` : ''}
                            <button onclick="event.stopPropagation(); openEditUserTransactionModal('${user.username}','${t.transaction_id}')" 
                                    class="btn-warning" style="padding:0.2rem 0.5rem;font-size:0.65rem;">
                                <i class="fas fa-edit"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="user-card" onclick="toggleUserExpand('${user.username}')">
                    <div class="user-header">
                        <div class="user-avatar-lg">${initials}</div>
                        <div style="flex:1;min-width:0;">
                            <div class="user-name">${user.full_name || user.username}</div>
                            <div class="user-username">@${user.username} • ${user.transactions.length} tx</div>
                        </div>
                        <i class="fas fa-chevron-down user-expand-icon" id="user-expand-${user.username}"></i>
                    </div>
                    <div class="user-body" id="user-body-${user.username}">
                        ${txItems || '<div class="text-center text-muted py-2">No transactions</div>'}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading admin users:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500" style="grid-column:1/-1;"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>Error loading users.</p></div>';
    }
}

function toggleUserExpand(username) {
    const body = document.getElementById(`user-body-${username}`);
    const icon = document.getElementById(`user-expand-${username}`);
    if (body) {
        body.classList.toggle('open');
        if (icon) icon.classList.toggle('open');
    }
}

// =============================
// ➕ ADD TRANSACTION
// =============================
async function openAddTransactionModal() {
    const modal = document.getElementById('addTransactionModal');
    const form = document.getElementById('addTransactionForm');
    form.reset();
    document.getElementById('addTransactionError').classList.add('hidden');
    document.getElementById('addTransactionSuccess').classList.add('hidden');

    const nextId = await getNextTransactionId();
    document.getElementById('autoTransactionId').value = nextId;

    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.getElementById('transactionDate').value = localDateTime.toISOString().slice(0, 16);

    modal.classList.remove('hidden');
}

function closeAddTransactionModal() {
    document.getElementById('addTransactionModal').classList.add('hidden');
}

async function getNextTransactionId() {
    try {
        const transactions = await api.getSheet('transaction_master');
        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            return 'TRN001';
        }
        const ids = transactions
            .map(t => t.transaction_id || t.id)
            .filter(id => id && id.startsWith('TRN'))
            .map(id => { const num = parseInt(id.substring(3)); return isNaN(num) ? 0 : num; });
        if (ids.length === 0) return 'TRN001';
        const nextNum = Math.max(...ids) + 1;
        return `TRN${String(nextNum).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating transaction ID:', error);
        return 'TRN001';
    }
}

async function submitAddTransaction(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
        submitBtn.disabled = true;

        const transactionId = document.getElementById('autoTransactionId').value;
        const title = document.getElementById('transactionTitle').value.trim();
        const mode = document.getElementById('transactionMode').value;
        const amount = parseFloat(document.getElementById('transactionAmount').value);
        const date = document.getElementById('transactionDate').value;
        const fileInput = document.getElementById('billUpload');

        if (!title || !mode || isNaN(amount) || amount < 0 || !date) {
            showAddTransactionError('Please fill in all required fields with valid values');
            return;
        }

        let billUrl = '';
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showAddTransactionError('File size must be less than 5MB');
                return;
            }
            const uploadResult = await api.uploadFile('admin', transactionId, file);
            if (uploadResult && uploadResult.success) {
                billUrl = uploadResult.fileUrl || '';
            } else {
                showAddTransactionError('Failed to upload bill: ' + (uploadResult?.error || 'Unknown error'));
                return;
            }
        }

        // Add to transaction_master
        const rowData = [transactionId, title, mode, amount, billUrl, date];
        const result = await api.addRow('transaction_master', rowData);

        if (result && (result.success || result.message?.includes('Success'))) {
            // Sync to all users
            const syncResult = await api.syncTransactionToAllUsers(transactionId, title, mode, amount, billUrl, date);
            
            showAddTransactionSuccess('Transaction added and synced to all users!');
            setTimeout(() => {
                closeAddTransactionModal();
                loadAdminTransactions();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to add transaction');
        }
    } catch (error) {
        console.error('Error adding transaction:', error);
        showAddTransactionError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showAddTransactionError(msg) {
    const el = document.getElementById('addTransactionError');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('addTransactionSuccess').classList.add('hidden');
}

function showAddTransactionSuccess(msg) {
    const el = document.getElementById('addTransactionSuccess');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('addTransactionError').classList.add('hidden');
}

// =============================
// ✏️ EDIT TRANSACTION (Admin)
// =============================
async function openEditTransactionModal(transactionId) {
    const modal = document.getElementById('editTransactionModal');
    document.getElementById('editTransactionError').classList.add('hidden');
    document.getElementById('editTransactionSuccess').classList.add('hidden');

    try {
        const transactions = await api.getSheet('transaction_master');
        const t = transactions.find(tx => (tx.transaction_id || tx.id) === transactionId);
        if (!t) { showToast('Transaction not found!', 'error'); return; }

        currentEditTransaction = t;
        document.getElementById('editTransactionId').value = t.transaction_id || t.id;
        document.getElementById('editTransactionTitle').value = t.title || '';
        document.getElementById('editTransactionMode').value = t.mode || 'to get';
        document.getElementById('editTransactionAmount').value = t.amount || 0;

        const dateStr = t.date || t.transaction_date || '';
        if (dateStr) {
            const d = new Date(dateStr);
            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
            document.getElementById('editTransactionDate').value = local.toISOString().slice(0, 16);
        }

        const billDiv = document.getElementById('editCurrentBill');
        if (t.bill_url) {
            billDiv.innerHTML = `<i class="fas fa-file-image text-primary mr-1"></i>Current: <a href="${t.bill_url}" target="_blank" class="text-primary hover:underline">View Bill</a>`;
        } else {
            billDiv.innerHTML = 'No bill uploaded';
        }

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('Error opening edit:', error);
        showToast('Error loading transaction details', 'error');
    }
}

function closeEditTransactionModal() {
    document.getElementById('editTransactionModal').classList.add('hidden');
    currentEditTransaction = null;
}

async function submitEditTransaction(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...';
        submitBtn.disabled = true;

        const transactionId = document.getElementById('editTransactionId').value;
        const title = document.getElementById('editTransactionTitle').value.trim();
        const mode = document.getElementById('editTransactionMode').value;
        const amount = parseFloat(document.getElementById('editTransactionAmount').value);
        const date = document.getElementById('editTransactionDate').value;
        const fileInput = document.getElementById('editBillUpload');

        if (!title || !mode || isNaN(amount) || amount < 0 || !date) {
            showEditTransactionError('Please fill in all required fields');
            return;
        }

        let billUrl = currentEditTransaction?.bill_url || '';
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showEditTransactionError('File size must be less than 5MB');
                return;
            }
            const uploadResult = await api.uploadFile('admin', transactionId, file);
            if (uploadResult && uploadResult.success) {
                billUrl = uploadResult.fileUrl || '';
            } else {
                showEditTransactionError('Failed to upload bill: ' + (uploadResult?.error || 'Unknown error'));
                return;
            }
        }

        const result = await api.updateTransaction(transactionId, title, mode, amount, billUrl, date);
        if (result && result.success) {
            showEditTransactionSuccess('Transaction updated successfully!');
            setTimeout(() => {
                closeEditTransactionModal();
                loadAdminTransactions();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to update transaction');
        }
    } catch (error) {
        console.error('Error updating transaction:', error);
        showEditTransactionError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showEditTransactionError(msg) {
    const el = document.getElementById('editTransactionError');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('editTransactionSuccess').classList.add('hidden');
}

function showEditTransactionSuccess(msg) {
    const el = document.getElementById('editTransactionSuccess');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('editTransactionError').classList.add('hidden');
}

// =============================
// ✏️ EDIT USER TRANSACTION (Admin)
// =============================
async function openEditUserTransactionModal(username, transactionId) {
    const modal = document.getElementById('editUserTransactionModal');
    document.getElementById('editUserTxnError').classList.add('hidden');
    document.getElementById('editUserTxnSuccess').classList.add('hidden');

    try {
        const userTx = await api.getUserTransactions(username);
        const t = userTx.find(tx => tx.transaction_id === transactionId);
        if (!t) { showToast('User transaction not found!', 'error'); return; }

        const master = await api.getSheet('transaction_master');
        const masterTx = master.find(m => (m.transaction_id || m.id) === transactionId);

        currentEditUserTransaction = { username, transactionId, data: t };

        document.getElementById('editUserTxnUsername').value = username;
        document.getElementById('editUserTxnTitle').value = masterTx ? masterTx.title : 'Unknown';
        document.getElementById('editUserTxnId').value = transactionId;
        document.getElementById('editUserTxnMode').value = masterTx ? masterTx.mode : 'to get';
        document.getElementById('editUserTxnStatus').value = t.status || 'pending';
        document.getElementById('editUserTxnAmount').value = t.amount || 0;

        const dateStr = t.date || '';
        if (dateStr) {
            const d = new Date(dateStr);
            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
            document.getElementById('editUserTxnDate').value = local.toISOString().slice(0, 16);
        }

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('Error opening edit user transaction:', error);
        showToast('Error loading user transaction', 'error');
    }
}

function closeEditUserTransactionModal() {
    document.getElementById('editUserTransactionModal').classList.add('hidden');
    currentEditUserTransaction = null;
}

async function submitEditUserTransaction(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...';
        submitBtn.disabled = true;

        const username = document.getElementById('editUserTxnUsername').value;
        const transactionId = document.getElementById('editUserTxnId').value;
        const status = document.getElementById('editUserTxnStatus').value;
        const amount = parseFloat(document.getElementById('editUserTxnAmount').value);
        const date = document.getElementById('editUserTxnDate').value;

        if (!status || isNaN(amount) || amount < 0 || !date) {
            showEditUserTxnError('Please fill in all required fields');
            return;
        }

        const result = await api.updateUserTransaction(username, transactionId, status, amount, date);
        if (result && result.success) {
            showEditUserTxnSuccess('User transaction updated successfully!');
            setTimeout(() => {
                closeEditUserTransactionModal();
                loadAdminUsers();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to update user transaction');
        }
    } catch (error) {
        console.error('Error updating user transaction:', error);
        showEditUserTxnError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showEditUserTxnError(msg) {
    const el = document.getElementById('editUserTxnError');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('editUserTxnSuccess').classList.add('hidden');
}

function showEditUserTxnSuccess(msg) {
    const el = document.getElementById('editUserTxnSuccess');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('editUserTxnError').classList.add('hidden');
}

// =============================
// ➕ ADD USER (Admin)
// =============================
function openAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserError').classList.add('hidden');
    document.getElementById('addUserSuccess').classList.add('hidden');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}

async function submitAddUser(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
        submitBtn.disabled = true;

        const username = document.getElementById('addUserUsername').value.trim();
        const fullName = document.getElementById('addUserFullName').value.trim();
        const password = document.getElementById('addUserPassword').value.trim();
        const role = document.getElementById('addUserRole').value;

        if (!username || !fullName || !password) {
            showAddUserError('Please fill in all required fields');
            return;
        }

        if (password.length < 4) {
            showAddUserError('Password must be at least 4 characters');
            return;
        }

        const result = await api.addUser(username, fullName, password, role);
        if (result && result.success) {
            showAddUserSuccess('User added successfully!');
            setTimeout(() => {
                closeAddUserModal();
                loadAdminUsers();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to add user');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        showAddUserError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showAddUserError(msg) {
    const el = document.getElementById('addUserError');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('addUserSuccess').classList.add('hidden');
}

function showAddUserSuccess(msg) {
    const el = document.getElementById('addUserSuccess');
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('addUserError').classList.add('hidden');
}

// =============================
// 👤 USER FUNCTIONS
// =============================
async function loadUserTransactions() {
    const container = document.getElementById('userTransactionsList');
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-primary"></i><p class="mt-2 text-muted">Loading transactions...</p></div>';

    try {
        const transactions = await api.getSheet('transaction_master');
        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <h3>No transactions available</h3>
                    <p>Check back later for new transactions.</p>
                </div>
            `;
            return;
        }

        const userTx = await api.getUserTransactions(currentUser.username);
        const userTxMap = {};
        if (userTx && Array.isArray(userTx)) {
            userTx.forEach(t => { userTxMap[t.transaction_id] = t; });
        }

        const sorted = transactions.sort((a, b) => {
            const dateA = new Date(a.date || a.transaction_date || 0);
            const dateB = new Date(b.date || b.transaction_date || 0);
            return dateB - dateA;
        });

        const html = sorted.map(t => {
            const tid = t.transaction_id || t.id;
            const userT = userTxMap[tid];
            const status = userT?.status || 'pending';
            const amount = userT?.amount || 0;
            const mode = t.mode || 'to get';
            const modeClass = mode === 'to get' ? 'get' : 'give';
            const icon = mode === 'to get' ? 'fa-arrow-down' : 'fa-arrow-up';
            const statusClass = status === 'completed' ? 'completed' : status === 'no' ? 'no' : status === 'to get' ? 'get' : 'give';
            const dateStr = t.date || t.transaction_date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) : 'N/A';

            return `
                <div class="tx-card" onclick="toggleTxDetails('${tid}')">
                    <div class="tx-header">
                        <div class="tx-left">
                            <div class="tx-icon ${modeClass}"><i class="fas ${icon}"></i></div>
                            <div class="tx-info">
                                <div class="tx-title">${t.title || 'Untitled'}</div>
                                <div class="tx-meta">${formattedDate} • ₹${amount}</div>
                            </div>
                        </div>
                        <div class="tx-right">
                            <span class="badge badge-${statusClass}">${status}</span>
                            <i class="fas fa-chevron-down tx-expand" id="tx-arrow-${tid}"></i>
                        </div>
                    </div>
                    <div class="tx-details" id="tx-details-${tid}">
                        <div class="tx-details-grid">
                            <div class="tx-detail-item">
                                <div class="label">Transaction ID</div>
                                <div class="value">${tid}</div>
                            </div>
                            <div class="tx-detail-item">
                                <div class="label">Mode</div>
                                <div class="value"><span class="badge badge-${modeClass}">${mode}</span></div>
                            </div>
                            <div class="tx-detail-item">
                                <div class="label">Status</div>
                                <div class="value"><span class="badge badge-${statusClass}">${status}</span></div>
                            </div>
                            <div class="tx-detail-item">
                                <div class="label">Amount</div>
                                <div class="value">₹${amount}</div>
                            </div>
                            <div class="tx-detail-item" style="grid-column:1/-1;">
                                <div class="label">Bill</div>
                                <div class="value">${t.bill_url ? `<a href="${t.bill_url}" target="_blank" class="text-primary hover:underline"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 'No bill uploaded'}</div>
                            </div>
                            ${userT?.date ? `<div class="tx-detail-item" style="grid-column:1/-1;">
                                <div class="label">Last Updated</div>
                                <div class="value">${new Date(userT.date).toLocaleString()}</div>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading user transactions:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>Error loading transactions.</p></div>';
    }
}

// =============================
// 🔐 CHANGE PASSWORD
// =============================
function openChangePasswordModal() {
    document.getElementById('profileMenu').classList.add('hidden');
    document.getElementById('changePasswordModal').classList.remove('hidden');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').classList.add('hidden');
    document.getElementById('changePasswordSuccess').classList.add('hidden');
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('hidden');
}

async function changePassword(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();

    const errorDiv = document.getElementById('changePasswordError');
    const successDiv = document.getElementById('changePasswordSuccess');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    if (!currentPassword || !newPassword || !confirmPassword) {
        showChangePasswordError('Please fill in all fields');
        return;
    }
    if (newPassword.length < 6) {
        showChangePasswordError('New password must be at least 6 characters');
        return;
    }
    if (newPassword !== confirmPassword) {
        showChangePasswordError('Passwords do not match');
        return;
    }
    if (newPassword === currentPassword) {
        showChangePasswordError('New password must be different');
        return;
    }

    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Changing...';
    submitBtn.disabled = true;

    try {
        const users = await api.getSheet("user_credentials", false);
        if (!users || users.error || !Array.isArray(users)) {
            throw new Error('Failed to fetch user data');
        }

        const user = users.find(u => 
            String(u.username).toLowerCase().trim() === String(currentUser.username).toLowerCase().trim() &&
            String(u.password).trim() === String(currentPassword).trim()
        );

        if (!user) throw new Error('Current password is incorrect');

        const updateResult = await api.updatePassword(currentUser.username, newPassword);
        if (updateResult && updateResult.success) {
            showChangePasswordSuccess('Password changed! Logging out in 3 seconds...');
            document.getElementById('changePasswordForm').reset();
            setTimeout(() => {
                closeChangePasswordModal();
                logout();
            }, 3000);
        } else {
            throw new Error(updateResult?.error || 'Failed to update password');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        showChangePasswordError(error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showChangePasswordError(msg) {
    const el = document.getElementById('changePasswordError');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function showChangePasswordSuccess(msg) {
    const el = document.getElementById('changePasswordSuccess');
    el.textContent = msg;
    el.classList.remove('hidden');
}

// =============================
// 🎯 EVENT LISTENERS
// =============================
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('signupForm').addEventListener('submit', function(e) {
        e.preventDefault();
        submitSignup();
    });

    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        login();
    });

    document.getElementById('addTransactionForm').addEventListener('submit', submitAddTransaction);
    document.getElementById('editTransactionForm').addEventListener('submit', submitEditTransaction);
    document.getElementById('editUserTransactionForm').addEventListener('submit', submitEditUserTransaction);
    document.getElementById('addUserForm').addEventListener('submit', submitAddUser);
    document.getElementById('changePasswordForm').addEventListener('submit', changePassword);

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.add('hidden');
            }
        });
    });
});

// =============================
// 🚀 BOOTSTRAP
// =============================
console.log('%c📊 Transaction Manager Loaded!', 'color:#4F46E5;font-size:16px;font-weight:bold;');
