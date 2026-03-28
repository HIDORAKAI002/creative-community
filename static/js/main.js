let audioCtx = null;
let hapticsEnabled = localStorage.getItem('cc_haptics') !== 'false';

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playBlip(freq = 600, type = 'square', duration = 0.05, vol = 0.02) {
    if (!hapticsEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') return;

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) { }
}

document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('keydown', () => initAudio(), { once: true });

function setupHaptics() {
    const muteBtn = document.createElement('button');
    muteBtn.innerHTML = hapticsEnabled ? '🔊' : '🔇';
    muteBtn.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; background:rgba(0,0,0,0.8); border:2px solid var(--primary-cyan); color:var(--primary-cyan); width:45px; height:45px; border-radius:50%; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; box-shadow: 2px 2px 0px var(--accent-purple); transition: transform 0.1s;';

    muteBtn.addEventListener('click', () => {
        initAudio();
        hapticsEnabled = !hapticsEnabled;
        localStorage.setItem('cc_haptics', hapticsEnabled);
        muteBtn.innerHTML = hapticsEnabled ? '🔊' : '🔇';
        if (hapticsEnabled) playBlip(800, 'sine', 0.1, 0.05);
    });

    muteBtn.addEventListener('mousedown', () => muteBtn.style.transform = 'translate(2px, 2px)');
    muteBtn.addEventListener('mouseup', () => muteBtn.style.transform = 'translate(0, 0)');
    muteBtn.addEventListener('mouseleave', () => muteBtn.style.transform = 'translate(0, 0)');

    document.body.appendChild(muteBtn);

    document.querySelectorAll('.btn-primary, .btn-secondary, .btn-primary-outline, .nav-link, .neo-card').forEach(el => {
        el.addEventListener('mouseenter', () => playBlip(800, 'sine', 0.03, 0.015));
        el.addEventListener('mousedown', () => playBlip(400, 'square', 0.05, 0.03));
    });
}

async function fetchMinecraftStatus() {
    const statusText = document.getElementById('server-players');
    const statusDot = document.getElementById('server-dot');
    const statusPing = document.getElementById('server-ping');

    const serverIP = 'demo.mcnetwork.me';
    const apiUrl = `https://api.mcsrvstat.us/2/${serverIP}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.online) {
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusPing.classList.add('active');
        } else {
            statusDot.classList.remove('online');
            statusDot.classList.add('offline');
            statusPing.classList.remove('active');
        }
    } catch (error) {
        console.error('Error fetching server status:', error);
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
    }
}

function renderTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container || typeof weeklyActivity === 'undefined') return;

    let html = '';
    weeklyActivity.forEach((item, index) => {
        const alignment = index % 2 === 0 ? 'left' : 'right';

        const tagsHtml = item.tags.map(tag => `<span class="tag">${tag}</span>`).join('');

        html += `
            <div class="timeline-item ${alignment}">
                <div class="timeline-node"></div>
                <div class="timeline-content neo-card">
                    <span class="week-badge">Week ${item.week}</span>
                    <span class="date-range">${item.dateRange}</span>
                    <h3 class="timeline-title">${item.title}</h3>
                    <p class="timeline-desc">${item.description}</p>
                    <div class="tags-container">
                        ${tagsHtml}
                    </div>
                </div>
                ${item.image ? (Array.isArray(item.image) ? `
                <div class="timeline-image image-hover">
                    <img src="${item.image[0]}" alt="${item.title}" class="rotating-image" data-images="${item.image.join(',')}" data-current="0" style="transition: opacity 0.3s ease;" />
                </div>
                ` : `
                <div class="timeline-image image-hover">
                    <img src="${item.image}" alt="${item.title}" />
                </div>
                `) : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderGallery() {
    const gallery = document.getElementById('photo-gallery');
    if (!gallery || typeof galleryPhotos === 'undefined') return;

    let html = '';
    galleryPhotos.forEach((photo, i) => {
        html += `
            <div class="gallery-item neo-shadow image-hover" style="animation-delay: ${i * 0.1}s">
                <img src="${photo}" alt="Event Photo ${i + 1}" />
                <div class="gallery-overlay">
                    <span>View Image</span>
                </div>
            </div>
        `;
    });

    gallery.innerHTML = html;
}

function renderProjects() {
    const container = document.getElementById('projects-container');
    if (!container || typeof memberProjects === 'undefined') return;

    let html = '';
    memberProjects.forEach((proj, i) => {
        const tagsHtml = proj.tags.map(tag => `<span class="tag">${tag}</span>`).join('');

        html += `
            <div class="project-card neo-card" style="animation-delay: ${i * 0.15}s">
                <div class="project-img-container image-hover">
                    <img src="${proj.image}" alt="${proj.title}" class="project-img" />
                </div>
                <div class="project-info">
                    <h3 class="project-title">${proj.title}</h3>
                    <p class="project-creator">by ${proj.creator}</p>
                    <p class="project-desc">${proj.description}</p>
                    <div class="tags-container">
                        ${tagsHtml}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function setupScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.neo-card, .timeline-item, .section-title');
    animatedElements.forEach(el => {
        el.classList.add('fade-up-element');
        observer.observe(el);
    });
}

function setupRotatingImages() {
    const rotators = document.querySelectorAll('.rotating-image');
    rotators.forEach(img => {
        const images = img.getAttribute('data-images').split(',');
        if (images.length > 1) {
            setInterval(() => {
                let currentIndex = parseInt(img.getAttribute('data-current'));
                currentIndex = (currentIndex + 1) % images.length;
                img.style.opacity = 0;
                setTimeout(() => {
                    img.src = images[currentIndex];
                    img.setAttribute('data-current', currentIndex);
                    img.style.opacity = 1;
                }, 300);
            }, 2000);
        }
    });
}

function animateCounters() {
    const counters = document.querySelectorAll('.counter');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                counters.forEach(counter => {
                    const target = +counter.getAttribute('data-target');
                    const duration = 1500;
                    const start = performance.now();

                    function tick(now) {
                        const elapsed = now - start;
                        const progress = Math.min(elapsed / duration, 1);
                        const eased = 1 - Math.pow(1 - progress, 3);
                        counter.textContent = Math.floor(eased * target) + '+';
                        if (progress < 1) requestAnimationFrame(tick);
                    }
                    requestAnimationFrame(tick);
                });
                observer.disconnect();
            }
        });
    }, { threshold: 0.5 });

    const statsStrip = document.querySelector('.hero-stats');
    if (statsStrip) observer.observe(statsStrip);
}

function setupMobileNav() {
    const hamburger = document.getElementById('nav-hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('nav-open');
        hamburger.classList.toggle('is-active');
    });

    navLinks.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('nav-open');
            hamburger.classList.remove('is-active');
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const venueDisplay = document.getElementById('current-venue-display');
    if (venueDisplay) {
        fetch('/creative-community/api/venue')
            .then(res => res.json())
            .then(data => {
                venueDisplay.textContent = data.venue || 'Stay tuned for next session...';
            })
            .catch(() => {
                venueDisplay.textContent = 'Connection to database failed.';
            });
    }

    renderTimeline();
    renderGallery();
    renderProjects();
    animateCounters();
    setupMobileNav();

    setupRotatingImages();
    setupHaptics();

    fetchMinecraftStatus();
    setInterval(fetchMinecraftStatus, 30000);

    setTimeout(setupScrollAnimations, 100);

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    const lightbox = document.getElementById('lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');

    if (lightbox && lightboxImg && lightboxClose) {
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const imgElement = item.querySelector('img');
                if (imgElement) {
                    lightboxImg.src = imgElement.src;
                    lightbox.style.display = 'flex';
                }
            });
        });

        lightboxClose.addEventListener('click', () => {
            lightbox.style.display = 'none';
        });

        lightbox.addEventListener('click', (e) => {
            if (e.target !== lightboxImg) {
                lightbox.style.display = 'none';
            }
        });
    }

    const infoBtn = document.getElementById('server-info-btn');
    const infoPanel = document.getElementById('server-details-panel');
    if (infoBtn && infoPanel) {
        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (infoPanel.style.display === 'none') {
                infoPanel.style.display = 'block';
            } else {
                infoPanel.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!infoPanel.contains(e.target) && e.target !== infoBtn) {
                infoPanel.style.display = 'none';
            }
        });
    }

    const userStr = localStorage.getItem('cc_logged_in_user');
    if (userStr) {
        const user = JSON.parse(userStr);
        const isOgAdmin = user.clgEmail && user.clgEmail.toLowerCase().startsWith('24bq1a05j5@');
        if (isOgAdmin || user.isAdmin) {
            const adminDiv = document.getElementById('admin-hub-link');
            if (adminDiv) {
                adminDiv.innerHTML = `<a href="/creative-community/admin" class="btn-primary" style="padding: 10px 15px; font-size: 0.8rem; background: var(--alert-orange); color: #000; border-color: #fff; box-shadow: 4px 4px 0px #fff;">⚙️ SYSTEM DASHBOARD</a>`;
            }
        }
        setupAttendanceCheckin(user);
    }

    document.querySelectorAll('.footer p').forEach(p => {
        if (p.innerHTML.indexOf('@ VVITU') > -1) {
            p.innerHTML = p.innerHTML.replace('@', '<span id="admin-knock-target" style="cursor: pointer; user-select: none; display: inline-block; padding: 2px 5px; transition: color 0.1s;">@</span>');
            const knockTarget = document.getElementById('admin-knock-target');
            if (knockTarget) {
                let taps = 0;
                let knockTimer = null;
                knockTarget.addEventListener('click', (e) => {
                    taps++;
                    knockTarget.style.color = taps === 1 ? 'var(--primary-cyan)' : (taps === 2 ? 'var(--alert-orange)' : 'var(--accent-purple)');

                    clearTimeout(knockTimer);
                    if (taps >= 3) {
                        const userStr = localStorage.getItem('cc_logged_in_user');
                        if (userStr) {
                            const user = JSON.parse(userStr);
                            const isOgAdmin = user.clgEmail && user.clgEmail.toLowerCase().startsWith('24bq1a05j5@');
                            if (isOgAdmin || user.isAdmin) {
                                window.location.href = '/creative-community/admin';
                            } else {
                                alert("Access Denied: Insufficient Privileges.");
                            }
                        } else {
                            alert("Access Denied: Authentication Required.");
                        }
                        taps = 0;
                        setTimeout(() => { if (knockTarget) knockTarget.style.color = ''; }, 500);
                    } else {
                        knockTimer = setTimeout(() => {
                            taps = 0;
                            if (knockTarget) knockTarget.style.color = '';
                        }, 1000);
                    }
                });
            }
        }
    });
});

function setupAttendanceCheckin(user) {
    const checkinCard = document.createElement('div');
    checkinCard.id = 'attendance-checkin-card';
    checkinCard.style.cssText = 'position:fixed; bottom:80px; right:20px; z-index:9998; display:none; flex-direction:column; gap:10px;';
    document.body.appendChild(checkinCard);

    async function pollStatus() {
        try {
            const res = await fetch('/creative-community/api/attendance_status');
            const data = await res.json();
            if (data.active) {
                renderCheckinUI(data.time_left);
            } else {
                checkinCard.style.display = 'none';
            }
        } catch (e) { }
    }

    function renderCheckinUI(timeLeft) {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        checkinCard.style.display = 'flex';
        checkinCard.innerHTML = `
            <div class="neo-card" style="border-color: var(--primary-cyan); background: rgba(5,5,5,0.95); padding: 15px; width: 220px; box-shadow: 6px 6px 0px var(--accent-purple); animation: slideIn 0.3s ease-out;">
                <h4 style="font-family: var(--font-header); font-size: 0.65rem; color: var(--primary-cyan); margin-bottom: 5px; letter-spacing: 1px;">ATTENDANCE OPEN</h4>
                <p style="font-size: 0.9rem; color: var(--alert-orange); font-family: var(--font-header); margin-bottom: 10px;">${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}</p>
                <button id="do-checkin-btn" class="btn-primary" style="width: 100%; font-size: 0.75rem; padding: 10px;">CHECK-IN NOW</button>
            </div>
        `;

        const btn = document.getElementById('do-checkin-btn');
        if (btn) {
            btn.onclick = async () => {
                btn.disabled = true;
                btn.textContent = "SIGNALING...";
                try {
                    const res = await fetch('/creative-community/checkin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: user.clgEmail })
                    });
                    const result = await res.json();
                    if (result.success) {
                        btn.textContent = "VERIFIED [OK]";
                        btn.style.background = "#10b981";
                        btn.style.borderColor = "#fff";
                        setTimeout(() => checkinCard.style.display = 'none', 3000);
                    } else {
                        alert(result.error || "Check-in rejected.");
                        btn.disabled = false;
                        btn.textContent = "CHECK-IN NOW";
                    }
                } catch (e) {
                    alert("Quantum connection failed.");
                    btn.disabled = false;
                    btn.textContent = "CHECK-IN NOW";
                }
            };
        }
    }

    pollStatus();
    setInterval(pollStatus, 5000);
}

function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function getDeviceId() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("creative-community", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("creative-community", 4, 17);

    const hwData = [
        navigator.userAgent,
        navigator.language,
        navigator.hardwareConcurrency,
        navigator.maxTouchPoints || 0,
        screen.colorDepth,
        screen.width + "x" + screen.height,
        window.devicePixelRatio || 1,
        new Date().getTimezoneOffset()
    ].join('|');

    const fingerprintStr = canvas.toDataURL() + hwData;
    return 'sys-' + cyrb53(fingerprintStr).toString(16);
}

async function verifyServerBan() {
    try {
        const id = getDeviceId();
        const res = await fetch('/creative-community/api/security/check-ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: id })
        });
        const data = await res.json();
        if (data.banned) {
            triggerSecurityLockdown("SERVER ENFORCED BANNED DEVICE", true);
        } else if (data.known && !data.banned && localStorage.getItem('cc_security_ban') === 'true') {
            localStorage.removeItem('cc_security_ban');
            if (isLockedDown) window.location.reload();
        } else if (!data.known && localStorage.getItem('cc_security_ban') === 'true') {
            triggerSecurityLockdown("RESYNCING LOCAL MISSED BAN", false);
        }
    } catch (e) { }
}

if (localStorage.getItem('cc_security_ban') === 'true') {
    enforceBlacklist();
}

verifyServerBan();

document.addEventListener('contextmenu', e => {
    e.preventDefault();
    triggerSecurityLockdown("UNAUTHORIZED CONTEXT MENU ACCESS");
});

document.addEventListener('keydown', e => {
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.key === 'S' || e.key === 's'))) {
        e.preventDefault();
        triggerSecurityLockdown("UNAUTHORIZED INSPECTOR OVERRIDE");
    }
});

let isLockedDown = false;

function enforceBlacklist() {
    isLockedDown = true;
    document.body.innerHTML = `
        <div style="height: 100vh; width: 100vw; background: #050000; color: #ff003c; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: 'Press Start 2P', monospace; z-index: 999999; position: fixed; top: 0; left: 0; text-align: center;">
            <div style="font-size: 3rem; font-weight: bold; text-shadow: 0 0 20px #ff003c; margin-bottom: 20px;">PERMANENT BLACKLIST</div>
            <p style="font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; margin-bottom: 15px; text-transform: uppercase;">THIS DEVICE IS BANNED FROM THE CREATIVE COMMUNITY NETWORK</p>
            <p style="font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; color: #aaa; margin-bottom: 30px;">MALICIOUS INTENT LOGGED TRACE IP RECORDED TO VVITU FIREWALL RULES.</p>
            <div style="border: 2px dashed #ff003c; padding: 15px; background: rgba(255,0,60,0.1); font-family: 'Space Grotesk', sans-serif;">ERR_DEVICE_BLACKLISTED_FOREVER</div>
            <p style="margin-top: 40px; font-family: monospace; font-size: 0.8rem; color: #555;">DEVICE ID: ${getDeviceId()}</p>
        </div>
    `;

    if (typeof playBlip === 'function') {
        setInterval(() => playBlip(150, 'sawtooth', 0.1, 0.5), 150);
    }
}

function triggerSecurityLockdown(reason, isFromServer = false) {
    if (isLockedDown) return;

    localStorage.setItem('cc_security_ban', 'true');
    enforceBlacklist();
    localStorage.removeItem('cc_logged_in_user');

    if (!isFromServer) {
        fetch('/creative-community/api/security/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: getDeviceId(),
                device_name: navigator.userAgent
            })
        }).catch(() => { });
    }

    setInterval(() => {
        console.log("%c⚠️ SECURITY BREACH DETECTED ⚠️", "color: red; font-size: 40px; font-weight: bold; text-shadow: 2px 2px 0 #000;");
        console.log("Your access attempt has been logged. Your device is now permanently banned.");
    }, 50);

    setInterval(() => { debugger; }, 50);
}
