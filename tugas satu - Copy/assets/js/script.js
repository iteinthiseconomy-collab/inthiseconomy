const form = document.getElementById('guestForm');
const formMessage = document.getElementById('formMessage');
const setupNotice = document.getElementById('setupNotice');
const appMessage = document.getElementById('appMessage');
const adminError = document.getElementById('adminError');
const listContainer = document.getElementById('listContainer');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const adminEntryForm = document.getElementById('adminEntryForm');
const adminEntryMessage = document.getElementById('adminEntryMessage');
const guestTicketPanel = document.getElementById('guestTicketPanel');
const guestTicketQr = document.getElementById('guestTicketQr');
const scannerVideo = document.getElementById('scannerVideo');
const scannerMessage = document.getElementById('scannerMessage');
const loginPanel = document.getElementById('loginPanel');
const adminDashboard = document.getElementById('adminDashboard');
const qrCanvas = document.getElementById('qrCanvas');
const qrMessage = document.getElementById('qrMessage');
const statuses = ['Hadir', 'Izin', 'Menunggu'];

let supabaseClient = null;
let guests = [];
let isAdmin = false;
let adminEmail = 'admin';
let cameraStream = null;
let scannerTimer = 0;
let scannerBusy = false;
let lastScannedValue = '';
let missedScanFrames = 0;
const scannerCanvas = document.createElement('canvas');
const scannerContext = scannerCanvas.getContext('2d', {
    willReadFrequently: true
});

function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function updateCurrentTime() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const formattedTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const timeElement = document.getElementById('currentTime');
    timeElement.dateTime = now.toISOString();
    timeElement.textContent = formattedTime;
}

function setAdminError(message) {
    adminError.textContent = message;
    adminError.hidden = !message;
}

function showAppMessage(message, isError = false) {
    appMessage.textContent = message;
    appMessage.classList.toggle('app-message-error', isError);
    appMessage.hidden = !message;
}

function configureSupabase() {
    const config = window.BUKU_TAMU_CONFIG || {};
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        setupNotice.textContent = 'Database belum dikonfigurasi. Lengkapi Project URL dan anon/public key di assets/js/config.js, lalu jalankan supabase-setup.sql. Lihat README.md untuk panduan.';
        setupNotice.hidden = false;
        return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        setupNotice.textContent = 'Library Supabase gagal dimuat. Periksa koneksi internet dan muat ulang halaman.';
        setupNotice.hidden = false;
        return;
    }

    try {
        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        setupNotice.hidden = true;
    } catch (error) {
        setupNotice.textContent = `Konfigurasi Supabase tidak valid: ${error.message}`;
        setupNotice.hidden = false;
    }
}

function getGuestUrl() {
    const url = new URL(window.location.href);
    url.hash = 'guest';
    return url.toString();
}

function getTicketUrl(token) {
    const url = new URL(window.location.href);
    url.hash = `ticket=${encodeURIComponent(token)}`;
    return url.toString();
}

function getEventDetails() {
    const config = window.BUKU_TAMU_CONFIG || {};
    return {
        name: String(config.eventName || 'Acara Kami').trim(),
        date: String(config.eventDate || '').trim(),
        location: String(config.eventLocation || '').trim()
    };
}

function createInvitationMessage(guestName, ticketUrl) {
    const event = getEventDetails();
    const lines = [
        `Halo ${guestName}, Anda diundang ke ${event.name}.`,
        event.date ? `Waktu: ${event.date}` : '',
        event.location ? `Lokasi: ${event.location}` : '',
        'Tiket QR digital Anda: ' + ticketUrl,
        'Tunjukkan QR pada tautan tersebut kepada petugas saat hadir. QR hanya berlaku satu kali.'
    ];
    return lines.filter(Boolean).join('\n');
}

function normalizeWhatsAppNumber(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    else if (digits.startsWith('8')) digits = `62${digits}`;
    return /^62\d{8,13}$/.test(digits) ? digits : '';
}

function createTicketToken() {
    if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
        throw new Error('Browser ini tidak menyediakan generator tiket yang aman. Buka situs melalui HTTPS.');
    }
    if (typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function renderQrCode(canvas, value) {
    if (typeof window.qrcode !== 'function') {
        throw new Error('Library QR tidak tersedia. Periksa koneksi internet lalu muat ulang halaman.');
    }

    const qr = window.qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const image = new Image();
    const imageLoaded = new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, {
            once: true
        });
        image.addEventListener('error', () => reject(new Error('QR gagal dirender oleh browser.')), {
            once: true
        });
    });
    image.src = qr.createDataURL(5, 8);
    await imageLoaded;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser tidak dapat membuat QR pada canvas.');
    context.drawImage(image, 0, 0);
}

function showGuestTicket(token, phone, guestName) {
    const event = getEventDetails();
    const ticketUrl = getTicketUrl(token);
    const guestForm = document.getElementById('guestForm');
    guestForm.hidden = true;
    guestTicketPanel.hidden = false;
    document.getElementById('guestInvitationText').textContent = [
        `Undangan: ${event.name}`,
        event.date ? `Waktu: ${event.date}` : '',
        event.location ? `Lokasi: ${event.location}` : ''
    ].filter(Boolean).join(' · ');

    const whatsappNumber = normalizeWhatsAppNumber(phone);
    const whatsappLink = document.getElementById('guestWhatsAppLink');
    whatsappLink.href = whatsappNumber ?
        `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(createInvitationMessage(guestName, ticketUrl))}` :
        '#';
    whatsappLink.hidden = !whatsappNumber;

    void renderQrCode(guestTicketQr, ticketUrl).catch((error) => {
        document.getElementById('guestInvitationText').textContent += ` QR gagal dibuat: ${error.message}`;
    });
}

function setupQrCode() {
    const guestUrl = getGuestUrl();
    document.getElementById('guestLink').href = guestUrl;

    if (window.location.protocol !== 'https:' && window.location.protocol !== 'http:') {
        qrMessage.textContent = 'QR tersedia setelah situs dipublikasikan dengan alamat web (http/https).';
        return;
    }

    void renderQrCode(qrCanvas, guestUrl)
        .then(() => {
            qrCanvas.hidden = false;
            qrMessage.textContent = 'Pindai untuk membuka formulir tamu.';
        })
        .catch((error) => {
            qrMessage.textContent = error.message;
        });
}

function setMode() {
    const adminMode = window.location.hash === '#admin';
    const isTicketPage = window.location.hash.startsWith('#ticket=');
    if (!adminMode) stopCameraScanner();
    document.getElementById('guestView').hidden = adminMode;
    document.getElementById('adminView').hidden = !adminMode;
    document.getElementById('guestModeLink').classList.toggle('mode-link-active', !adminMode);
    document.getElementById('adminModeLink').classList.toggle('mode-link-active', adminMode);
    document.getElementById('welcomeEyebrow').textContent = adminMode ?
        'PENGELOLAAN KUNJUNGAN' :
        isTicketPage ? 'TIKET UNDANGAN DIGITAL' : 'BUKU TAMU DIGITAL';
    document.getElementById('welcomeTitle').innerHTML = adminMode ?
        'Panel admin<span class="accent-dot">.</span>' :
        isTicketPage ?
        'Undangan Anda<span class="accent-dot">.</span>' :
        'Selamat datang<span class="accent-dot">.</span>';
    document.getElementById('welcomeCopy').textContent = adminMode ?
        'Kelola catatan tamu dan bagikan QR formulir kepada pengunjung.' :
        isTicketPage ?
        'Tunjukkan QR tiket berikut kepada petugas saat tiba di acara.' :
        'Silakan isi formulir kunjungan. Data akan tersimpan secara online dan dapat dikelola oleh admin.';
    document.getElementById('guestForm').hidden = isTicketPage;
    guestTicketPanel.hidden = !isTicketPage;
    showAppMessage('');

    if (isTicketPage) {
        const token = new URLSearchParams(window.location.hash.slice(1)).get('ticket');
        if (token && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
            showGuestTicket(token, '', 'Tamu');
        } else {
            document.getElementById('guestInvitationText').textContent = 'Tautan tiket tidak valid.';
        }
    }

    if (adminMode) {
        setupQrCode();
        updateAdminView();
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function renderStats() {
    const presentCount = guests.filter((guest) => Boolean(guest.checkedInAt)).length;
    document.getElementById('totalGuests').textContent = guests.length;
    document.getElementById('presentGuests').textContent = presentCount;
    document.getElementById('otherGuests').textContent = guests.length - presentCount;
    document.getElementById('listCount').textContent = guests.length;
}

function makeStatusSelect(guest) {
    const select = createElement('select', 'guest-status-select');
    select.setAttribute('aria-label', `Ubah status kehadiran ${guest.nama}`);
    statuses.forEach((status) => {
        const option = createElement('option', '', status);
        option.value = status;
        option.selected = guest.status === status;
        select.append(option);
    });
    select.addEventListener('change', () => updateGuestStatus(guest.id, select.value));
    return select;
}

function renderGuests() {
    if (!listContainer) return;
    const query = searchInput.value.trim().toLocaleLowerCase('id-ID');
    const selectedStatus = statusFilter.value;
    const filteredGuests = guests.filter((guest) => {
        const matchesSearch = [guest.nama, guest.instansi, guest.alamat, guest.pesan]
            .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query));
        return matchesSearch && (selectedStatus === 'Semua' || guest.status === selectedStatus);
    });

    listContainer.replaceChildren();
    renderStats();

    if (filteredGuests.length === 0) {
        const emptyState = createElement('div', 'empty-state');
        const noData = guests.length === 0;
        const emptyIcon = createElement('span', 'empty-icon', noData ? '＋' : '⌕');
        emptyIcon.setAttribute('aria-hidden', 'true');
        emptyState.append(
            emptyIcon,
            createElement('strong', '', noData ? 'Belum ada kunjungan' : 'Tamu tidak ditemukan'),
            createElement('p', '', noData ?
                'Data tamu yang terkirim akan muncul di sini.' :
                'Coba ubah kata kunci pencarian atau filter status.')
        );
        listContainer.append(emptyState);
        return;
    }

    filteredGuests.forEach((guest) => {
        const card = createElement('article', 'guest-card');
        const initials = String(guest.nama || '?')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join('')
            .toLocaleUpperCase('id-ID');
        const avatar = createElement('div', 'guest-avatar', initials || '?');
        avatar.setAttribute('aria-hidden', 'true');

        const details = createElement('div', 'guest-details');
        const nameRow = createElement('div', 'guest-name-row');
        nameRow.append(createElement('h3', 'guest-name', guest.nama), makeStatusSelect(guest));
        if (guest.checkedInAt) {
            nameRow.append(createElement('span', 'checked-in-badge', 'Hadir terverifikasi'));
        }
        details.append(nameRow, createElement('p', 'guest-organization', guest.instansi));

        const meta = [];
        if (guest.alamat) meta.push(`⌖ ${guest.alamat}`);
        if (guest.noPonsel) meta.push(`☎ ${guest.noPonsel}`);
        if (meta.length) details.append(createElement('p', 'guest-meta', meta.join('  ·  ')));
        if (guest.pesan) details.append(createElement('p', 'guest-message', `“${guest.pesan}”`));

        const actions = createElement('div', 'guest-actions');
        const whatsappNumber = normalizeWhatsAppNumber(guest.noPonsel);
        const inviteLink = createElement('a', 'button button-outline whatsapp-button', 'Kirim undangan WhatsApp');
        inviteLink.href = whatsappNumber ?
            `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(createInvitationMessage(guest.nama, getTicketUrl(guest.ticketToken)))}` :
            '#';
        inviteLink.target = '_blank';
        inviteLink.rel = 'noopener noreferrer';
        inviteLink.setAttribute('aria-label', `Kirim undangan WhatsApp kepada ${guest.nama}`);
        if (!whatsappNumber) {
            inviteLink.classList.add('button-disabled');
            inviteLink.setAttribute('aria-disabled', 'true');
            inviteLink.addEventListener('click', (event) => event.preventDefault());
        }
        actions.append(inviteLink);

        const qrButton = createElement('button', 'button button-outline', 'Tampilkan QR');
        qrButton.type = 'button';
        const qrPanel = createElement('div', 'inline-ticket-qr');
        qrPanel.hidden = true;
        const ticketCanvas = createElement('canvas', 'ticket-qr');
        ticketCanvas.setAttribute('aria-label', `QR tiket ${guest.nama}`);
        qrPanel.append(ticketCanvas);
        qrButton.addEventListener('click', async () => {
            qrPanel.hidden = !qrPanel.hidden;
            qrButton.textContent = qrPanel.hidden ? 'Tampilkan QR' : 'Sembunyikan QR';
            if (!qrPanel.hidden && !ticketCanvas.dataset.rendered) {
                try {
                    await renderQrCode(ticketCanvas, getTicketUrl(guest.ticketToken));
                    ticketCanvas.dataset.rendered = 'true';
                } catch (error) {
                    setAdminError(error.message);
                    qrPanel.hidden = true;
                }
            }
        });
        actions.append(qrButton);
        details.append(actions, qrPanel);

        const cardFooter = createElement('div', 'guest-card-footer');
        cardFooter.append(createElement('time', 'guest-time', formatDate(guest.waktu)));
        const deleteButton = createElement('button', 'delete-button', 'Hapus');
        deleteButton.type = 'button';
        deleteButton.setAttribute('aria-label', `Hapus data ${guest.nama}`);
        deleteButton.addEventListener('click', () => deleteGuest(guest.id));
        cardFooter.append(deleteButton);

        card.append(avatar, details, cardFooter);
        listContainer.append(card);
    });
}

function updateAdminView() {
    loginPanel.hidden = isAdmin;
    adminDashboard.hidden = !isAdmin;
    if (isAdmin) {
        document.getElementById('adminIdentity').textContent = `Masuk sebagai ${adminEmail}`;
    }
}

async function loadGuests() {
    if (!supabaseClient || !isAdmin) return;
    setAdminError('');
    try {
        const {
            data,
            error
        } = await supabaseClient
            .from('guest_book')
            .select('id, nama, instansi, alamat, no_ponsel, status, pesan, waktu, ticket_token, checked_in_at')
            .order('waktu', {
                ascending: false
            });
        if (error) {
            setAdminError(`Data tamu gagal dimuat: ${error.message}`);
            return;
        }

        guests = data.map((guest) => ({
            id: guest.id,
            nama: guest.nama,
            instansi: guest.instansi,
            alamat: guest.alamat,
            noPonsel: guest.no_ponsel,
            status: guest.status,
            pesan: guest.pesan,
            waktu: guest.waktu,
            ticketToken: guest.ticket_token,
            checkedInAt: guest.checked_in_at
        }));
        renderGuests();
    } catch (error) {
        setAdminError(`Data tamu gagal dimuat. Periksa koneksi internet: ${error.message}`);
    }
}

async function checkAdmin(user) {
    if (!user || !supabaseClient) {
        isAdmin = false;
        updateAdminView();
        return;
    }

    try {
        const {
            data,
            error
        } = await supabaseClient
            .from('admin_users')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();
        if (error) {
            isAdmin = false;
            updateAdminView();
            loginMessage.textContent = `Hak akses admin gagal diperiksa: ${error.message}`;
            return;
        }
        if (!data) {
            isAdmin = false;
            updateAdminView();
            loginMessage.textContent = 'Akun ini belum terdaftar sebagai admin. Minta pengelola menambahkan UUID akun di tabel admin_users.';
            return;
        }

        isAdmin = true;
        adminEmail = user.email || 'admin';
        loginMessage.textContent = '';
        updateAdminView();
        await loadGuests();
    } catch (error) {
        isAdmin = false;
        updateAdminView();
        loginMessage.textContent = `Hak akses admin gagal diperiksa. Periksa koneksi internet: ${error.message}`;
    }
}

async function updateGuestStatus(guestId, status) {
    try {
        const {
            error
        } = await supabaseClient
            .from('guest_book')
            .update({
                status
            })
            .eq('id', guestId);
        if (error) {
            setAdminError(`Status tamu gagal diperbarui: ${error.message}`);
            await loadGuests();
            return;
        }
        await loadGuests();
    } catch (error) {
        setAdminError(`Status tamu gagal diperbarui. Periksa koneksi internet: ${error.message}`);
        await loadGuests();
    }
}

async function deleteGuest(guestId) {
    const guest = guests.find((entry) => entry.id === guestId);
    if (!guest || !window.confirm(`Hapus catatan kunjungan ${guest.nama}?`)) return;

    try {
        const {
            error
        } = await supabaseClient.from('guest_book').delete().eq('id', guestId);
        if (error) {
            setAdminError(`Data tamu gagal dihapus: ${error.message}`);
            return;
        }
        await loadGuests();
    } catch (error) {
        setAdminError(`Data tamu gagal dihapus. Periksa koneksi internet: ${error.message}`);
    }
}

function extractTicketToken(scannedValue) {
    const value = String(scannedValue || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        return value;
    }

    try {
        const url = new URL(value);
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        const token = new URLSearchParams(hash).get('ticket');
        return token && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ?
            token :
            '';
    } catch (error) {
        return '';
    }
}

async function validateScannedTicket(scannedValue) {
    const token = extractTicketToken(scannedValue);
    if (!token) {
        scannerMessage.textContent = 'QR tidak dikenali. Pindai QR tiket dari undangan Buku Tamu Digital.';
        return;
    }
    if (!supabaseClient || !isAdmin) {
        scannerMessage.textContent = 'Silakan masuk sebagai admin sebelum memvalidasi tiket.';
        return;
    }

    scannerBusy = true;
    scannerMessage.textContent = 'Memeriksa tiket...';
    try {
        const {
            data,
            error
        } = await supabaseClient.rpc('validate_guest_ticket', {
            p_ticket_token: token
        });
        if (error) throw error;

        if (data.status === 'checked_in') {
            scannerMessage.textContent = `Berhasil: ${data.guest_name} tercatat hadir pada ${formatDate(data.checked_in_at)}.`;
            await loadGuests();
        } else if (data.status === 'already_used') {
            scannerMessage.textContent = 'Tiket ini sudah pernah digunakan. Kehadiran tidak ditambahkan lagi.';
        } else {
            scannerMessage.textContent = 'Tiket tidak valid atau tidak terdaftar.';
        }
    } catch (error) {
        scannerMessage.textContent = `Validasi gagal: ${error.message}`;
    } finally {
        scannerBusy = false;
    }
}

function scanCameraFrame() {
    if (!cameraStream) return;
    if (scannerVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && scannerVideo.videoWidth > 0) {
        const scale = Math.min(1, 800 / scannerVideo.videoWidth);
        scannerCanvas.width = Math.round(scannerVideo.videoWidth * scale);
        scannerCanvas.height = Math.round(scannerVideo.videoHeight * scale);
        scannerContext.drawImage(scannerVideo, 0, 0, scannerCanvas.width, scannerCanvas.height);
        const imageData = scannerContext.getImageData(0, 0, scannerCanvas.width, scannerCanvas.height);
        const result = window.jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });

        if (!result) {
            missedScanFrames += 1;
            if (missedScanFrames >= 8) {
                lastScannedValue = '';
                missedScanFrames = 0;
            }
        } else {
            missedScanFrames = 0;
            if (!scannerBusy && result.data !== lastScannedValue) {
                lastScannedValue = result.data;
                void validateScannedTicket(result.data);
            }
        }
    }
    scannerTimer = window.setTimeout(scanCameraFrame, 220);
}

function stopCameraScanner() {
    if (scannerTimer) {
        window.clearTimeout(scannerTimer);
        scannerTimer = 0;
    }
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
    }
    scannerVideo.srcObject = null;
    scannerVideo.hidden = true;
    document.getElementById('startScannerButton').hidden = false;
    document.getElementById('stopScannerButton').hidden = true;
}

async function startCameraScanner() {
    scannerMessage.textContent = '';
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        scannerMessage.textContent = 'Kamera memerlukan HTTPS atau localhost dan dukungan kamera pada browser.';
        return;
    }
    if (typeof window.jsQR !== 'function') {
        scannerMessage.textContent = 'Library pemindai QR gagal dimuat. Periksa internet dan muat ulang halaman.';
        return;
    }

    const startButton = document.getElementById('startScannerButton');
    startButton.disabled = true;
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment'
            },
            audio: false
        });
        scannerVideo.srcObject = cameraStream;
        scannerVideo.hidden = false;
        await scannerVideo.play();
        startButton.hidden = true;
        document.getElementById('stopScannerButton').hidden = false;
        scannerMessage.textContent = 'Kamera aktif. Arahkan QR tiket ke kamera laptop.';
        lastScannedValue = '';
        missedScanFrames = 0;
        scanCameraFrame();
    } catch (error) {
        stopCameraScanner();
        scannerMessage.textContent = `Kamera tidak dapat dibuka: ${error.message}. Pastikan izin kamera diberikan dan tidak sedang digunakan aplikasi lain.`;
    } finally {
        startButton.disabled = false;
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formMessage.textContent = '';
    if (!form.reportValidity()) return;
    if (!supabaseClient) {
        formMessage.textContent = 'Database belum siap. Silakan hubungi admin.';
        return;
    }

    const formData = new FormData(form);
    const guest = {
        nama: String(formData.get('nama')).trim(),
        instansi: String(formData.get('instansi')).trim(),
        alamat: String(formData.get('alamat')).trim(),
        no_ponsel: String(formData.get('noPonsel')).trim(),
        status: 'Hadir',
        pesan: String(formData.get('pesan')).trim()
    };
    if (!guest.nama || !guest.instansi) {
        formMessage.textContent = 'Nama lengkap dan asal / instansi wajib diisi.';
        return;
    }
    if (!normalizeWhatsAppNumber(guest.no_ponsel)) {
        formMessage.textContent = 'Masukkan nomor WhatsApp yang valid, termasuk kode negara atau format Indonesia seperti 081234567890.';
        return;
    }

    const submitButton = document.getElementById('submitGuestButton');
    submitButton.disabled = true;
    try {
        guest.ticket_token = createTicketToken();
        const {
            error
        } = await supabaseClient.from('guest_book').insert(guest);
        if (error) throw error;
        form.reset();
        formMessage.textContent = 'Data berhasil disimpan. Buka WhatsApp untuk mengirim undangan beserta tautan QR tiket.';
        showGuestTicket(guest.ticket_token, guest.no_ponsel, guest.nama);
    } catch (error) {
        formMessage.textContent = `Kunjungan gagal dikirim: ${error.message}`;
    } finally {
        submitButton.disabled = false;
    }
});

adminEntryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    adminEntryMessage.textContent = '';
    if (!adminEntryForm.reportValidity()) return;
    if (!supabaseClient || !isAdmin) {
        adminEntryMessage.textContent = 'Hanya admin yang sudah masuk yang dapat menambahkan data.';
        return;
    }

    const formData = new FormData(adminEntryForm);
    const entry = {
        nama: String(formData.get('nama')).trim(),
        instansi: String(formData.get('instansi')).trim(),
        alamat: String(formData.get('alamat')).trim(),
        no_ponsel: String(formData.get('noPonsel')).trim(),
        status: String(formData.get('status')),
        pesan: String(formData.get('pesan')).trim()
    };
    if (!entry.nama || !entry.instansi) {
        adminEntryMessage.textContent = 'Nama lengkap dan asal / instansi wajib diisi.';
        return;
    }
    if (!normalizeWhatsAppNumber(entry.no_ponsel)) {
        adminEntryMessage.textContent = 'Masukkan nomor WhatsApp yang valid, termasuk kode negara atau format Indonesia seperti 081234567890.';
        return;
    }

    const button = document.getElementById('adminEntryButton');
    button.disabled = true;
    try {
        entry.ticket_token = createTicketToken();
        const {
            error
        } = await supabaseClient.from('guest_book').insert(entry);
        if (error) throw error;
        adminEntryForm.reset();
        adminEntryMessage.textContent = 'Data tamu berhasil ditambahkan.';
        await loadGuests();
    } catch (error) {
        adminEntryMessage.textContent = `Data tamu gagal ditambahkan: ${error.message}`;
    } finally {
        button.disabled = false;
    }
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginMessage.textContent = '';
    if (!supabaseClient) {
        loginMessage.textContent = 'Database belum dikonfigurasi. Lihat README.md.';
        return;
    }
    if (!loginForm.reportValidity()) return;

    const formData = new FormData(loginForm);
    const loginButton = document.getElementById('loginButton');
    loginButton.disabled = true;
    try {
        const {
            error
        } = await supabaseClient.auth.signInWithPassword({
            email: String(formData.get('email')).trim(),
            password: String(formData.get('password'))
        });
        if (error) loginMessage.textContent = `Gagal masuk: ${error.message}`;
    } catch (error) {
        loginMessage.textContent = `Gagal masuk. Periksa koneksi internet: ${error.message}`;
    } finally {
        loginButton.disabled = false;
    }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
        const {
            error
        } = await supabaseClient.auth.signOut();
        if (error) {
            setAdminError(`Gagal keluar: ${error.message}`);
            return;
        }
        isAdmin = false;
        guests = [];
        renderGuests();
        updateAdminView();
    } catch (error) {
        setAdminError(`Gagal keluar: ${error.message}`);
    }
});

document.getElementById('refreshButton').addEventListener('click', loadGuests);
document.getElementById('startScannerButton').addEventListener('click', startCameraScanner);
document.getElementById('stopScannerButton').addEventListener('click', stopCameraScanner);
searchInput.addEventListener('input', renderGuests);
statusFilter.addEventListener('change', renderGuests);

document.getElementById('exportButton').addEventListener('click', () => {
    if (guests.length === 0) {
        showAppMessage('Belum ada data untuk diunduh.');
        return;
    }

    const columns = ['Nama', 'Asal / Instansi', 'Alamat', 'No. Ponsel', 'Status', 'Pesan / Keperluan', 'Waktu Input', 'Waktu Validasi Hadir'];
    const rows = guests.map((guest) => [
        guest.nama,
        guest.instansi,
        guest.alamat,
        guest.noPonsel,
        guest.status,
        guest.pesan,
        formatDate(guest.waktu),
        guest.checkedInAt ? formatDate(guest.checkedInAt) : ''
    ]);
    const csv = `sep=;\r\n${[columns, ...rows]
        .map((row) => row.map((value) => {
            const text = String(value || '');
            const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
            return `"${safeText.replace(/"/g, '""')}"`;
        }).join(';'))
        .join('\r\n')}`;
    const file = new Blob(['\uFEFF', csv], {
        type: 'text/csv;charset=utf-8'
    });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `buku-tamu-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showAppMessage('Data buku tamu berhasil diunduh.');
});

document.getElementById('clearButton').addEventListener('click', async () => {
    if (guests.length === 0 || !window.confirm(`Hapus semua ${guests.length} catatan kunjungan? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
        const {
            error
        } = await supabaseClient
            .from('guest_book')
            .delete()
            .in('id', guests.map((guest) => guest.id));
        if (error) {
            setAdminError(`Semua data gagal dihapus: ${error.message}`);
            return;
        }
        await loadGuests();
    } catch (error) {
        setAdminError(`Semua data gagal dihapus. Periksa koneksi internet: ${error.message}`);
    }
});

document.getElementById('copyLinkButton').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(getGuestUrl());
        showAppMessage('Tautan formulir berhasil disalin.');
    } catch (error) {
        showAppMessage(`Tautan tidak dapat disalin otomatis: ${error.message}`, true);
    }
});

async function startApp() {
    configureSupabase();
    setMode();
    if (!supabaseClient) return;

    try {
        const {
            data,
            error
        } = await supabaseClient.auth.getSession();
        if (error) {
            showAppMessage(`Sesi admin gagal diperiksa: ${error.message}`, true);
            return;
        }
        await checkAdmin(data.session ? data.session.user : null);

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            window.setTimeout(() => {
                void checkAdmin(session ? session.user : null);
            }, 0);
        });
    } catch (error) {
        showAppMessage(`Sesi admin gagal diperiksa. Periksa koneksi internet: ${error.message}`, true);
    }
}

window.addEventListener('hashchange', setMode);
window.addEventListener('beforeunload', stopCameraScanner);
updateCurrentTime();
window.setInterval(updateCurrentTime, 1000);
startApp();