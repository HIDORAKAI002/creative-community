document.addEventListener('DOMContentLoaded', () => {
    const loggedInUserStr = localStorage.getItem('cc_logged_in_user');
    if (!loggedInUserStr) {
        window.location.href = '/creative-community/login';
        return;
    }
    const loggedInUser = JSON.parse(loggedInUserStr);
    const isOgAdmin = loggedInUser.clgEmail && loggedInUser.clgEmail.toLowerCase().startsWith('24bq1a05j5@');

    if (!isOgAdmin && !loggedInUser.isAdmin) {
        alert("ACCESS DENIED: Requires Administrative Clearance.");
        window.location.href = '/creative-community/';
        return;
    }

    if (isOgAdmin) {
        const adminToggle = document.getElementById('admin-toggle-group');
        if (adminToggle) adminToggle.style.display = 'flex';
    }

    let members = [];

    async function loadMembers() {
        try {
            const res = await fetch('/creative-community/api/members');
            members = await res.json();
            renderMembers();
        } catch (e) {
            console.error("Failed to sync members:", e);
        }
    }

    const form = document.getElementById('member-form');
    const container = document.getElementById('members-container');
    const cancelBtn = document.getElementById('cancel-btn');
    const formTitle = document.getElementById('form-title');
    const exportBtn = document.getElementById('export-btn');

    async function saveMemberToBackend(memberData) {
        const url = memberData.id.startsWith('m-17') || !memberData.id.includes('-') ? '/creative-community/api/members/update' : '/creative-community/api/members/register';
        const isUpdate = !!document.getElementById('edit-id').value;
        const endpoint = isUpdate ? '/creative-community/api/members/update' : '/creative-community/api/members/register';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(memberData)
            });
            const result = await res.json();
            if (result.success) {
                await loadMembers();
                resetForm();
            } else {
                alert(result.error || "Save Failed");
            }
        } catch (e) {
            alert("Connection Error: Sync failed.");
        }
    }

    function renderMembers() {
        container.innerHTML = '';
        members.forEach(m => {
            const adminBadge = m.isAdmin ? `<span style="background: var(--alert-orange); padding: 2px 6px; font-size: 0.6rem; color: #000; margin-left: 5px; vertical-align: middle;">[ADMIN]</span>` : '';
            const ogBadge = (m.clgEmail && m.clgEmail.toLowerCase().startsWith('24bq1a05j5@')) ? `<span style="background: var(--primary-cyan); padding: 2px 6px; font-size: 0.6rem; color: #000; margin-left: 5px; vertical-align: middle;">[OWNER]</span>` : '';

            container.innerHTML += `
                <div class="neo-card member-card">
                    <h3 style="color: var(--primary-cyan); font-family: var(--font-header); font-size: 0.9rem; margin-bottom: 5px;">${m.name}${ogBadge || adminBadge}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Roll: ${m.rollNo}</p>
                    <p style="font-size: 0.8rem; margin-top: 5px;">Phone: ${m.phone}</p>
                    ${m.altPhone ? `<p style="font-size: 0.8rem;">Alt Phone: ${m.altPhone}</p>` : ''}
                    <p style="font-size: 0.8rem;">Clg Email: ${m.clgEmail}</p>
                    ${m.persEmail ? `<p style="font-size: 0.8rem;">Pers Email: ${m.persEmail}</p>` : ''}
                    
                    <div class="member-actions">
                        <button class="btn-secondary" onclick="editMember('${m.id}')">Edit</button>
                        <button class="btn-primary-outline" style="border-color: var(--alert-orange); color: var(--alert-orange);" onclick="deleteMember('${m.id}')">Remove</button>
                    </div>
                </div>
            `;
        });
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const id = document.getElementById('edit-id').value;
        const clgEmail = document.getElementById('m-clg-email').value;

        if (!clgEmail.endsWith('@vvit.net') && !clgEmail.endsWith('@vvitu.net') && !clgEmail.endsWith('@vvitu.ac.in')) {
            alert('Registration mail must end with @vvit.net, @vvitu.net or @vvitu.ac.in');
            return;
        }

        const targetIsOgAdmin = clgEmail.toLowerCase().startsWith('24bq1a05j5@');
        let assignAdmin = false;
        if (isOgAdmin) {
            assignAdmin = document.getElementById('m-admin').checked;
        } else {
            const existingMember = members.find(m => m.id === id);
            if (existingMember && existingMember.isAdmin) {
                assignAdmin = true;
            }
        }

        const memberData = {
            id: id,
            name: document.getElementById('m-name').value,
            rollNo: document.getElementById('m-roll').value,
            clgEmail: clgEmail,
            password: document.getElementById('m-password').value,
            persEmail: document.getElementById('m-pers-email').value,
            phone: document.getElementById('m-phone').value,
            altPhone: document.getElementById('m-alt-phone').value,
            isVerified: document.getElementById('m-verified').checked,
            isAdmin: targetIsOgAdmin ? true : assignAdmin // OG logic overrides
        };

        saveMemberToBackend(memberData);
    });

    window.editMember = (id) => {
        const m = members.find(m => m.id === id);
        if (!m) return;

        document.getElementById('edit-id').value = m.id;
        document.getElementById('m-name').value = m.name;
        document.getElementById('m-roll').value = m.rollNo;
        document.getElementById('m-clg-email').value = m.clgEmail;
        document.getElementById('m-password').value = m.password || '';
        document.getElementById('m-pers-email').value = m.persEmail;
        document.getElementById('m-phone').value = m.phone;
        document.getElementById('m-alt-phone').value = m.altPhone || '';
        document.getElementById('m-verified').checked = m.isVerified || false;

        if (isOgAdmin) {
            const targetIsOgAdmin = m.clgEmail.toLowerCase().startsWith('24bq1a05j5@');
            const adminCheckbox = document.getElementById('m-admin');
            if (adminCheckbox) {
                adminCheckbox.checked = m.isAdmin || targetIsOgAdmin;
                adminCheckbox.disabled = targetIsOgAdmin; // Cannot remove admin from OG
            }
        } else {
            const adminCheckbox = document.getElementById('m-admin');
            if (adminCheckbox) adminCheckbox.checked = m.isAdmin || false;
        }

        formTitle.textContent = "Edit Member";
        cancelBtn.style.display = "block";
    };

    window.deleteMember = async (id) => {
        const m = members.find(m => m.id === id);
        if (m && m.clgEmail.toLowerCase().startsWith('24bq1a05j5@')) {
            alert("SECURITY BLOCK: You cannot remove the original Owner account.");
            return;
        }

        if (confirm("Are you sure you want to remove this member?")) {
            try {
                const res = await fetch('/creative-community/api/members/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const result = await res.json();
                if (result.success) {
                    await loadMembers();
                    resetForm();
                } else {
                    alert(result.error);
                }
            } catch (e) {
                alert("Delete failed.");
            }
        }
    };

    cancelBtn.addEventListener('click', resetForm);

    function resetForm() {
        form.reset();
        document.getElementById('edit-id').value = '';
        formTitle.textContent = "Add New Member";
        cancelBtn.style.display = "none";
    }

    exportBtn.addEventListener('click', () => {
        const dataStr = "const initialMembers = " + JSON.stringify(members, null, 4) + ";";
        const blob = new Blob([dataStr], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'members.js';
        a.click();

        URL.revokeObjectURL(url);
        alert("Downloaded members.js! You can replace the data/members.js file in your codebase with this updated file to persist the data to git.");
    });

    const venueInput = document.getElementById('admin-venue-input');
    const saveVenueBtn = document.getElementById('save-venue-btn');
    const venueMsg = document.getElementById('venue-msg');

    if (venueInput && saveVenueBtn) {
        fetch('/creative-community/api/venue')
            .then(res => res.json())
            .then(data => venueInput.value = data.venue || '');

        saveVenueBtn.addEventListener('click', async () => {
            const venue = venueInput.value.trim();
            try {
                const res = await fetch('/creative-community/api/venue/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ venue })
                });
                if ((await res.json()).success) {
                    venueMsg.style.display = 'block';
                    setTimeout(() => venueMsg.style.display = 'none', 3000);
                }
            } catch (e) {
                alert("Failed to update database.");
            }
        });
    }

    const openGateBtn = document.getElementById('open-gate-btn');
    const timerDisplay = document.getElementById('attendance-timer');
    const reportBody = document.getElementById('attendance-report-body');

    async function loadAttendanceReport() {
        try {
            const response = await fetch('/creative-community/admin/attendance_report');
            const data = await response.json();

            reportBody.innerHTML = '';
            data.report.forEach(row => {
                reportBody.innerHTML += `
                    <tr style="border-bottom: 1px solid var(--border-subtle);">
                        <td style="padding: 10px; font-weight: 600;">${row.email}</td>
                        <td style="padding: 10px; color: var(--text-muted);">${row.join_date}</td>
                        <td style="padding: 10px;">${row.attended}/${row.total_possible}</td>
                        <td style="padding: 10px; color: var(--primary-cyan); font-weight: bold;">${row.percentage}%</td>
                        <td style="padding: 10px;">
                            <textarea id="rem-${row.email}" style="width: 100%; background: #000; color: #fff; border: 1px solid var(--border-subtle); padding: 5px; font-family: var(--font-body); font-size: 0.8rem;">${row.remarks || ''}</textarea>
                        </td>
                        <td style="padding: 10px;">
                            <button class="btn-primary" style="font-size: 0.6rem; padding: 4px 8px;" onclick="saveRemarks('${row.email}')">SAVE</button>
                        </td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error(err);
        }
    }

    openGateBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/creative-community/open_attendance', { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                checkAttendanceStatus();
            }
        } catch (err) {
            alert("Error opening attendance gate.");
        }
    });

    window.saveRemarks = async (email) => {
        const remarks = document.getElementById(`rem-${email}`).value;
        try {
            const response = await fetch('/creative-community/admin/update_remarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, remarks })
            });
            const data = await response.json();
            if (data.success) {
                alert("Remarks saved for " + email);
                loadAttendanceReport();
            }
        } catch (err) {
            alert("Error saving remarks.");
        }
    };

    async function checkAttendanceStatus() {
        const response = await fetch('/creative-community/attendance_status');
        const data = await response.json();

        if (data.active) {
            openGateBtn.disabled = true;
            openGateBtn.textContent = "ATTENDANCE IN PROGRESS...";
            timerDisplay.style.display = 'block';

            const minutes = Math.floor(data.time_left / 60);
            const seconds = data.time_left % 60;
            timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            openGateBtn.disabled = false;
            openGateBtn.textContent = "OPEN ATTENDANCE GATE (5 MINS)";
            timerDisplay.style.display = 'none';
        }
    }

    loadMembers();
    loadAttendanceReport();
    checkAttendanceStatus();
    setInterval(checkAttendanceStatus, 1000);
    setInterval(loadAttendanceReport, 10000); // Refresh report every 10s

    const blockedDevicesBody = document.getElementById('blocked-devices-body');

    async function loadBlockedDevices() {
        if (!blockedDevicesBody) return;
        try {
            const res = await fetch('/creative-community/admin/api/blocked-devices');
            const devices = await res.json();

            if (devices.length === 0) {
                blockedDevicesBody.innerHTML = `<tr><td colspan='6' style='padding: 20px; text-align: center; color: var(--text-muted);'>No security logs found. System secure.</td></tr>`;
                return;
            }

            blockedDevicesBody.innerHTML = '';
            devices.forEach(d => {
                const date = new Date(d.blocked_at * 1000).toLocaleString();
                const statusStr = d.active ? `<span style="color: #ff003c; font-weight: bold;">[BANNED]</span>` : `<span style="color: #10b981;">[CLEARED]</span>`;
                const actionBtn = d.active
                    ? `<button class="btn-primary" style="font-size: 0.6rem; padding: 4px 8px; background: transparent; border-color: #10b981; color: #10b981;" onclick="unblockDevice('${d.id}')">UNBLOCK</button>`
                    : `-`;

                blockedDevicesBody.innerHTML += `
                    <tr style="border-bottom: 1px solid var(--border-subtle);">
                        <td style="padding: 10px; font-family: monospace;">${d.id}</td>
                        <td style="padding: 10px; color: var(--alert-orange); font-family: monospace;">${d.ip_address || '---'}</td>
                        <td style="padding: 10px; color: var(--text-muted); font-size: 0.75rem;">${d.device_name}</td>
                        <td style="padding: 10px;">${date}</td>
                        <td style="padding: 10px;">${statusStr}</td>
                        <td style="padding: 10px;">${actionBtn}</td>
                    </tr>
                `;
            });
        } catch (e) {
            console.error("Failed to load security logs", e);
        }
    }

    window.unblockDevice = async (id) => {
        if (!confirm("Are you sure you want to restore access to this device?")) return;
        try {
            const res = await fetch('/creative-community/admin/api/unblock-device', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: id })
            });
            const result = await res.json();
            if (result.success) {
                loadBlockedDevices();
            } else {
                alert("Failed to unblock device.");
            }
        } catch (e) {
            alert("Connection error.");
        }
    }

    loadBlockedDevices();
    setInterval(loadBlockedDevices, 15000);
});
