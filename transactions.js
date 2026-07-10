// 🌐 Global Variables
let currentUser = null;
let currentPage = 'adminTransactions';
let currentEditTransaction = null;
let currentAdminUpdate = null;

// Cache for better performance
let dataCache = {
    users: null,
    transactions: null,
    lastUpdated: null
};

// =============================
// 📊 Google Sheets Integration
// =============================
class GoogleSheetsAPI {
    constructor() {
        this.apiUrl = "https://script.google.com/macros/s/AKfycbxRc412OwfdTLCG0j7vyMqi-G7_j4EiXERjUbjnPOk5-dM-KkFK_RgzSDnfWWa7EVbfAA/exec"; // Replace with your script ID
        this.cache = new Map();
        this.localCache = this.initLocalCache();
        this.cacheTimeout = 30 * 1000;
    }

    initLocalCache() {
        try {
            const cached = localStorage.getItem('transaction_cache');
            return cached ? JSON.parse(cached) : {};
        } catch {
            return {};
        }
    }

    saveLocalCache() {
        try {
            localStorage.setItem('transaction_cache', JSON.stringify(this.localCache));
        } catch (e) {
            console.warn('Failed to save cache:', e);
        }
    }

    async getSheet(sheetName, useCache = true) {
        const cacheKey = sheetName;
        const now = Date.now();

        if (useCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (now - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
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

            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

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
        sheetNames.forEach((name, index) => {
            batchResult[name] = results[index];
        });
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
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
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
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
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
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
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
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
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
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
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
}

const api = new GoogleSheetsAPI();

// =============================
// 🔑 Authentication
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
// 📍 Navigation
// =============================
async function showPage(page) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('border-blue-500', 'text-blue-600', 'border-green-500', 'text-green-600');
        btn.classList.add('border-transparent');
    });

    document.getElementById(page + 'Page').classList.remove('hidden');

    const clickedBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => {
        const btnText = btn.textContent.toLowerCase();
        return btnText.includes(page.replace('admin', '').replace('user', '').toLowerCase());
    });

    if (clickedBtn) {
        if (currentUser && currentUser.role === 'admin') {
            clickedBtn.classList.add('border-blue-500', 'text-blue-600');
        } else {
            clickedBtn.classList.add('border-green-500', 'text-green-600');
        }
    }

    currentPage = page;

    if (page === 'adminTransactions') {
        await loadAdminTransactions();
    } else if (page === 'adminUsers') {
        await loadAdminUsers();
    } else if (page === 'userTransactions') {
        await loadUserTransactions();
    }
}

// =============================
// 👨‍💼 Admin Functions
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
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i><p class="mt-2 text-gray-500">Loading transactions...</p></div>';

    try {
        const transactions = await api.getSheet('transaction_master');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-exchange-alt text-4xl mb-3"></i><p>No transactions found. Click "Add Transaction" to create one.</p></div>';
            return;
        }

        const sortedTransactions = transactions.sort((a, b) => {
            const dateA = new Date(a.date || a.transaction_date || 0);
            const dateB = new Date(b.date || b.transaction_date || 0);
            return dateB - dateA;
        });

        const html = sortedTransactions.map(transaction => {
            const tid = transaction.transaction_id || transaction.id;
            const mode = transaction.mode || 'to get';
            const modeClass = mode === 'to get' ? 'mode-get' : 'mode-give';
            const modeIcon = mode === 'to get' ? 'fa-arrow-down' : 'fa-arrow-up';
            const amount = transaction.amount || 0;
            
            const dateStr = transaction.date || transaction.transaction_date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';

            const billLink = transaction.bill_url ? 
                `<a href="${transaction.bill_url}" target="_blank" class="bill-link"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 
                '<span class="text-gray-400 text-sm">No bill uploaded</span>';

            return `
                <div class="transaction-card">
                    <div class="transaction-header" onclick="toggleTransactionDetails('${tid}')">
                        <div class="flex items-center min-w-0 flex-1">
                            <div class="transaction-icon">
                                <i class="fas ${modeIcon}"></i>
                            </div>
                            <div class="transaction-info min-w-0 flex-1">
                                <h3>${transaction.title || 'Untitled'}</h3>
                                <p>${formattedDate}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2 flex-shrink-0">
                            <span class="mode-badge ${modeClass}">${mode}</span>
                            ${amount > 0 ? `<span class="transaction-amount ${mode === 'to get' ? 'get' : 'give'}">₹${amount}</span>` : ''}
                            <i class="fas fa-chevron-down expand-arrow" id="arrow-${tid}"></i>
                        </div>
                    </div>
                    
                    <div class="details-container" id="details-${tid}">
                        <div class="detail-item">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <div class="detail-label">Transaction ID</div>
                                    <div class="detail-value">${tid}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Mode</div>
                                    <div class="detail-value"><span class="mode-badge ${modeClass}">${mode}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Amount</div>
                                    <div class="detail-value transaction-amount ${mode === 'to get' ? 'get' : 'give'}">₹${amount}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Date & Time</div>
                                    <div class="detail-value">${formattedDate}</div>
                                </div>
                                <div class="md:col-span-2">
                                    <div class="detail-label">Bill</div>
                                    <div class="detail-value">${billLink}</div>
                                </div>
                            </div>
                            <div class="mt-3 flex gap-2">
                                <button onclick="event.stopPropagation(); openEditTransactionModal('${tid}')" class="edit-btn">
                                    <i class="fas fa-edit mr-1"></i>Edit
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading admin transactions:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>Error loading transactions. Please try again.</p></div>';
    }
}

function toggleTransactionDetails(id) {
    const container = document.getElementById(`details-${id}`);
    const arrow = document.getElementById(`arrow-${id}`);

    if (container && arrow) {
        if (!container.classList.contains('expanded')) {
            document.querySelectorAll('.details-container.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('.expand-arrow.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            container.classList.add('expanded');
            arrow.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
            arrow.classList.remove('expanded');
        }
    }
}

// =============================
// 👨‍💼 Admin Users Management
// =============================
async function loadAdminUsers() {
    const container = document.getElementById('adminUsersList');
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i><p class="mt-2 text-gray-500">Loading users...</p></div>';

    try {
        const users = await api.getSheet('user_credentials');

        if (!users || users.error || !Array.isArray(users) || users.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-users text-4xl mb-3"></i><p>No users found.</p></div>';
            return;
        }

        const allTransactions = await api.getSheet('transaction_master');
        const transactionMap = {};
        if (allTransactions && Array.isArray(allTransactions)) {
            allTransactions.forEach(t => {
                transactionMap[t.transaction_id || t.id] = t;
            });
        }

        const userPromises = users.map(async (user) => {
            const userTransactions = await api.getUserTransactions(user.username);
            return {
                ...user,
                transactions: userTransactions && Array.isArray(userTransactions) ? userTransactions : []
            };
        });

        const usersWithTransactions = await Promise.all(userPromises);

        const html = usersWithTransactions.map(user => {
            const initials = user.full_name ? 
                user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 
                user.username.substring(0, 2).toUpperCase();

            const transactionItems = user.transactions.map(t => {
                const transaction = transactionMap[t.transaction_id];
                const title = transaction ? transaction.title : 'Unknown';
                const status = t.status || 'pending';
                const statusClass = status === 'completed' ? 'completed' : 
                                   status === 'no' ? 'no' :
                                   status === 'to get' ? 'get' : 
                                   status === 'to give' ? 'give' : 'pending';
                const amount = t.amount || 0;
                const amountClass = status === 'to get' ? 'get' : 
                                   status === 'completed' ? 'completed' : 
                                   status === 'no' ? 'no' : 'give';

                return `
                    <div class="user-transaction-item">
                        <div class="flex justify-between items-center">
                            <div class="flex-1">
                                <div class="font-medium">${title}</div>
                                <div class="text-sm text-gray-500">${t.date || 'N/A'}</div>
                            </div>
                            <div class="text-right flex items-center gap-2">
                                <span class="transaction-status-badge ${statusClass}">${status}</span>
                                ${amount > 0 ? `<span class="transaction-amount ${amountClass}">₹${amount}</span>` : ''}
                                <button onclick="event.stopPropagation(); openAdminUpdateUserModal('${user.username}', '${t.transaction_id}', '${title}', '${status}', ${amount}, '${t.date || ''}')" 
                                        class="admin-action-btn text-xs">
                                    <i class="fas fa-pen mr-1"></i>Update
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="user-card" id="user-card-${user.username}" onclick="toggleUserExpand('${user.username}')">
                    <div class="user-card-inner">
                        <div class="user-avatar">${initials}</div>
                        <div class="user-name">${user.full_name || user.username}</div>
                        <div class="user-username">@${user.username}</div>
                        <div class="text-xs text-gray-600 mt-2">
                            ${user.transactions.length} transactions
                        </div>
                        <div class="mt-2">
                            <i class="fas fa-chevron-down expand-toggle-icon" id="expand-icon-${user.username}"></i>
                        </div>
                    </div>
                    <div class="user-expand-content" id="expand-content-${user.username}">
                        ${transactionItems || '<div class="text-center text-gray-500 py-4">No transactions for this user</div>'}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading admin users:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>Error loading users. Please try again.</p></div>';
    }
}

function toggleUserExpand(username) {
    const content = document.getElementById(`expand-content-${username}`);
    const card = document.getElementById(`user-card-${username}`);
    const icon = document.getElementById(`expand-icon-${username}`);

    if (!content) return;

    if (content.classList.contains('open')) {
        content.classList.remove('open');
        card.classList.remove('expanded');
        if (icon) icon.classList.remove('rotated');
        return;
    }

    document.querySelectorAll('.user-expand-content.open').forEach(el => {
        el.classList.remove('open');
        const parentCard = el.closest('.user-card');
        if (parentCard) parentCard.classList.remove('expanded');
        const iconId = el.id.replace('expand-content-', 'expand-icon-');
        const otherIcon = document.getElementById(iconId);
        if (otherIcon) otherIcon.classList.remove('rotated');
    });

    content.classList.add('open');
    card.classList.add('expanded');
    if (icon) icon.classList.add('rotated');
}

// =============================
// 👨‍💼 Admin Update User Transaction
// =============================
function openAdminUpdateUserModal(username, transactionId, title, currentStatus, currentAmount, currentDate) {
    const modal = document.getElementById('adminUpdateUserModal');
    const form = document.getElementById('adminUpdateUserForm');
    form.reset();
    document.getElementById('adminUpdateError').classList.add('hidden');
    document.getElementById('adminUpdateSuccess').classList.add('hidden');

    currentAdminUpdate = {
        username: username,
        transactionId: transactionId
    };

    document.getElementById('adminUpdateUsername').value = username;
    document.getElementById('adminUpdateTransactionTitle').value = title;
    document.getElementById('adminUpdateTransactionId').value = transactionId;
    document.getElementById('adminUpdateStatus').value = currentStatus || '';
    document.getElementById('adminUpdateAmount').value = currentAmount || '';

    if (currentDate) {
        const date = new Date(currentDate);
        const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        document.getElementById('adminUpdateDate').value = localDateTime.toISOString().slice(0, 16);
    } else {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        document.getElementById('adminUpdateDate').value = localDateTime.toISOString().slice(0, 16);
    }

    modal.classList.remove('hidden');
}

function closeAdminUpdateUserModal() {
    document.getElementById('adminUpdateUserModal').classList.add('hidden');
    currentAdminUpdate = null;
}

async function submitAdminUpdateUser(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...';
        submitBtn.disabled = true;

        const username = document.getElementById('adminUpdateUsername').value;
        const transactionId = document.getElementById('adminUpdateTransactionId').value;
        const status = document.getElementById('adminUpdateStatus').value;
        const amount = parseInt(document.getElementById('adminUpdateAmount').value);
        const date = document.getElementById('adminUpdateDate').value;

        if (!status || isNaN(amount) || amount < 0 || !date) {
            showAdminUpdateError('Please fill in all required fields with valid values');
            return;
        }

        const result = await api.updateUserTransaction(username, transactionId, status, amount, date);

        if (result && result.success) {
            showAdminUpdateSuccess('Transaction status updated successfully!');
            setTimeout(() => {
                closeAdminUpdateUserModal();
                loadAdminUsers();
                loadAdminTransactions();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to update transaction');
        }

    } catch (error) {
        console.error('Error updating user transaction:', error);
        showAdminUpdateError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showAdminUpdateError(message) {
    const errorDiv = document.getElementById('adminUpdateError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('adminUpdateSuccess').classList.add('hidden');
}

function showAdminUpdateSuccess(message) {
    const successDiv = document.getElementById('adminUpdateSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('adminUpdateError').classList.add('hidden');
}

// =============================
// ➕ Add Transaction Functions
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
            .map(id => {
                const num = parseInt(id.substring(3));
                return isNaN(num) ? 0 : num;
            });

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
        const amount = parseInt(document.getElementById('transactionAmount').value);
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

        const rowData = [
            transactionId,
            title,
            mode,
            amount,
            billUrl,
            date
        ];

        const result = await api.addRow('transaction_master', rowData);

        if (result && (result.success || result.message?.includes('Success'))) {
            showAddTransactionSuccess('Transaction added successfully!');
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

function showAddTransactionError(message) {
    const errorDiv = document.getElementById('addTransactionError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('addTransactionSuccess').classList.add('hidden');
}

function showAddTransactionSuccess(message) {
    const successDiv = document.getElementById('addTransactionSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('addTransactionError').classList.add('hidden');
}

// =============================
// ✏️ Edit Transaction Functions (Admin Only)
// =============================
async function openEditTransactionModal(transactionId) {
    const modal = document.getElementById('editTransactionModal');
    const form = document.getElementById('editTransactionForm');
    form.reset();
    document.getElementById('editTransactionError').classList.add('hidden');
    document.getElementById('editTransactionSuccess').classList.add('hidden');

    try {
        const transactions = await api.getSheet('transaction_master');
        const transaction = transactions.find(t => (t.transaction_id || t.id) === transactionId);

        if (!transaction) {
            alert('Transaction not found!');
            return;
        }

        currentEditTransaction = transaction;

        document.getElementById('editTransactionId').value = transaction.transaction_id || transaction.id;
        document.getElementById('editTransactionTitle').value = transaction.title || '';
        document.getElementById('editTransactionMode').value = transaction.mode || 'to get';
        document.getElementById('editTransactionAmount').value = transaction.amount || 0;

        const dateStr = transaction.date || transaction.transaction_date || '';
        if (dateStr) {
            const date = new Date(dateStr);
            const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            document.getElementById('editTransactionDate').value = localDateTime.toISOString().slice(0, 16);
        }

        const currentBillDiv = document.getElementById('editCurrentBill');
        if (transaction.bill_url) {
            currentBillDiv.innerHTML = `
                <p class="text-sm text-gray-600">
                    <i class="fas fa-file-image mr-1 text-blue-500"></i>
                    Current bill: <a href="${transaction.bill_url}" target="_blank" class="bill-link">View Bill</a>
                </p>
            `;
        } else {
            currentBillDiv.innerHTML = '<p class="text-sm text-gray-400">No bill currently uploaded</p>';
        }

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('Error opening edit transaction:', error);
        alert('Error loading transaction details. Please try again.');
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
        const amount = parseInt(document.getElementById('editTransactionAmount').value);
        const date = document.getElementById('editTransactionDate').value;
        const fileInput = document.getElementById('editBillUpload');

        if (!title || !mode || isNaN(amount) || amount < 0 || !date) {
            showEditTransactionError('Please fill in all required fields with valid values');
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

function showEditTransactionError(message) {
    const errorDiv = document.getElementById('editTransactionError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('editTransactionSuccess').classList.add('hidden');
}

function showEditTransactionSuccess(message) {
    const successDiv = document.getElementById('editTransactionSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('editTransactionError').classList.add('hidden');
}

// =============================
// 👤 User Functions (View Only)
// =============================
async function loadUserTransactions() {
    const container = document.getElementById('userTransactionsList');
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-green-500"></i><p class="mt-2 text-gray-500">Loading transactions...</p></div>';

    try {
        const transactions = await api.getSheet('transaction_master');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-exchange-alt text-4xl mb-3"></i><p>No transactions available.</p></div>';
            return;
        }

        const userTransactions = await api.getUserTransactions(currentUser.username);
        const userTransactionMap = {};
        if (userTransactions && Array.isArray(userTransactions)) {
            userTransactions.forEach(t => {
                userTransactionMap[t.transaction_id] = t;
            });
        }

        const sortedTransactions = transactions.sort((a, b) => {
            const dateA = new Date(a.date || a.transaction_date || 0);
            const dateB = new Date(b.date || b.transaction_date || 0);
            return dateB - dateA;
        });

        const html = sortedTransactions.map(transaction => {
            const tid = transaction.transaction_id || transaction.id;
            const userTxn = userTransactionMap[tid];
            const status = userTxn?.status || 'pending';
            const amount = userTxn?.amount || transaction.amount || 0;
            
            const mode = transaction.mode || 'to get';
            const modeClass = mode === 'to get' ? 'mode-get' : 'mode-give';
            const modeIcon = mode === 'to get' ? 'fa-arrow-down' : 'fa-arrow-up';
            
            const statusClass = status === 'completed' ? 'completed' : 
                               status === 'no' ? 'no' :
                               status === 'to get' ? 'get' : 
                               status === 'to give' ? 'give' : 'pending';
            
            const dateStr = transaction.date || transaction.transaction_date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';

            const billLink = transaction.bill_url ? 
                `<a href="${transaction.bill_url}" target="_blank" class="bill-link"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 
                '<span class="text-gray-400 text-sm">No bill uploaded</span>';

            const userUpdateDate = userTxn?.date || 'N/A';
            const formattedUserDate = userUpdateDate !== 'N/A' ? new Date(userUpdateDate).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';

            return `
                <div class="transaction-card" onclick="toggleUserTransactionDetails('${tid}')">
                    <div class="transaction-header">
                        <div class="flex items-center min-w-0 flex-1">
                            <div class="transaction-icon">
                                <i class="fas ${modeIcon}"></i>
                            </div>
                            <div class="transaction-info min-w-0 flex-1">
                                <h3>${transaction.title || 'Untitled'}</h3>
                                <p>${formattedDate}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2 flex-shrink-0">
                            <span class="transaction-status-badge ${statusClass}">${status}</span>
                            ${amount > 0 ? `<span class="transaction-amount ${status === 'to get' || status === 'completed' ? 'get' : status === 'no' ? 'no' : 'give'}">₹${amount}</span>` : ''}
                            <i class="fas fa-chevron-down expand-arrow" id="user-arrow-${tid}"></i>
                        </div>
                    </div>
                    
                    <div class="details-container" id="user-details-${tid}">
                        <div class="detail-item">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <div class="detail-label">Transaction ID</div>
                                    <div class="detail-value">${tid}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Mode</div>
                                    <div class="detail-value"><span class="mode-badge ${modeClass}">${mode}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Amount</div>
                                    <div class="detail-value transaction-amount ${status === 'to get' || status === 'completed' ? 'get' : status === 'no' ? 'no' : 'give'}">₹${amount}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Date & Time</div>
                                    <div class="detail-value">${formattedDate}</div>
                                </div>
                                <div class="md:col-span-2">
                                    <div class="detail-label">Bill</div>
                                    <div class="detail-value">${billLink}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Status</div>
                                    <div class="detail-value"><span class="transaction-status-badge ${statusClass}">${status}</span></div>
                                </div>
                                ${status !== 'pending' ? `
                                    <div>
                                        <div class="detail-label">Last Updated</div>
                                        <div class="detail-value">${formattedUserDate}</div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading user transactions:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>Error loading transactions. Please try again.</p></div>';
    }
}

function toggleUserTransactionDetails(id) {
    const container = document.getElementById(`user-details-${id}`);
    const arrow = document.getElementById(`user-arrow-${id}`);

    if (container && arrow) {
        if (!container.classList.contains('expanded')) {
            document.querySelectorAll('.details-container.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('.expand-arrow.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            container.classList.add('expanded');
            arrow.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
            arrow.classList.remove('expanded');
        }
    }
}

// =============================
// 🔐 Change Password Functions
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
        showChangePasswordError('New password must be at least 6 characters long');
        return;
    }

    if (newPassword !== confirmPassword) {
        showChangePasswordError('New passwords do not match');
        return;
    }

    if (newPassword === currentPassword) {
        showChangePasswordError('New password must be different from current password');
        return;
    }

    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Changing Password...';
    submitBtn.disabled = true;

    try {
        const users = await api.getSheet("user_credentials", false);

        if (!users || users.error || !Array.isArray(users)) {
            throw new Error('Failed to fetch user data');
        }

        const user = users.find(u => {
            if (!u.username || !u.password) return false;
            return String(u.username).toLowerCase().trim() === String(currentUser.username).toLowerCase().trim() &&
                   String(u.password).trim() === String(currentPassword).trim();
        });

        if (!user) {
            throw new Error('Current password is incorrect');
        }

        const updateResult = await api.updatePassword(currentUser.username, newPassword);

        if (updateResult && updateResult.success) {
            showChangePasswordSuccess('Password changed successfully! You will be logged out in 3 seconds.');
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

function showChangePasswordError(message) {
    const errorDiv = document.getElementById('changePasswordError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function showChangePasswordSuccess(message) {
    const successDiv = document.getElementById('changePasswordSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
}

// =============================
// 🎯 Event Listeners
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
    document.getElementById('adminUpdateUserForm').addEventListener('submit', submitAdminUpdateUser);
    document.getElementById('changePasswordForm').addEventListener('submit', changePassword);

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.add('hidden');
                if (this.id === 'addTransactionModal') closeAddTransactionModal();
                if (this.id === 'editTransactionModal') closeEditTransactionModal();
                if (this.id === 'adminUpdateUserModal') closeAdminUpdateUserModal();
                if (this.id === 'changePasswordModal') closeChangePasswordModal();
            }
        });
    });
});

// Restore session on load (fallback)
(function() {
    const saved = sessionStorage.getItem('transaction_session');
    if (saved && !currentUser) {
        try {
            const data = JSON.parse(saved);
            if (data.user && data.timestamp && (Date.now() - data.timestamp < 24 * 60 * 60 * 1000)) {
                currentUser = data.user;
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('dashboardContainer').classList.remove('hidden');
                document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.name}`;
                loadUserProfile(currentUser.username);
                if (currentUser.role === 'admin') {
                    document.getElementById('userNav').classList.add('hidden');
                    document.getElementById('adminNav').classList.remove('hidden');
                    loadAdminData().then(() => showPage('adminTransactions'));
                } else {
                    document.getElementById('adminNav').classList.add('hidden');
                    document.getElementById('userNav').classList.remove('hidden');
                    loadUserTransactions().then(() => showPage('userTransactions'));
                }
                setTimeout(() => preloadCriticalData(), 100);
            }
        } catch (e) {}
    }
})();

console.log('%c📊 Transaction Manager Loaded Successfully! 📊', 'color: #059669; font-size: 16px; font-weight: bold;');
