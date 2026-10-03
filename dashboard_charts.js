/* =======================================================
   dashboard_charts.js — Chart.js helpers (ทุกโมดูล)
   ต้องโหลด Chart.js ก่อนไฟล์นี้
   ======================================================= */

const chartInstances = {};

/* ---------- สีมาตรฐาน ---------- */
const CHART_COLORS = {
    blue:   '#2588e8',
    green:  '#24b47e',
    gold:   '#f3a51d',
    violet: '#8b5eea',
    rose:   '#f43f5e',
    cyan:   '#06b6d4',
    gray:   '#94a3b8',
    slate:  '#64748b'
};

/* ---------- ชุดสีสำเร็จรูป ---------- */
const CHART_PALETTES = {
    primary: ['#2588e8', '#24b47e', '#f3a51d', '#8b5eea', '#f43f5e', '#06b6d4'],
    warm:    ['#f97316', '#f59e0b', '#eab308', '#ef4444', '#dc2626', '#b91c1c'],
    cool:    ['#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#6366f1', '#8b5cf6'],
    pastel:  ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee']
};

/* ---------- Helper: สร้าง array สี ---------- */
function buildColorArray(labels, palette) {
    const p = palette || CHART_PALETTES.primary;
    return labels.map((_, i) => p[i % p.length]);
}

/* ---------- Helper: ทำลาย chart เก่า ---------- */
function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
}

/* ---------- Chart: Bar (แนวตั้ง) ---------- */
function renderBarChart(canvasId, labels, data, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    destroyChart(canvasId);
    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: color,
                borderRadius: 6,
                maxBarThickness: 46
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(30,50,80,.92)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: { label: (c) => `${label}: ${c.parsed.y.toLocaleString()}` }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0, color: '#8492a6' }, grid: { color: '#eef2f7' } },
                x: { ticks: { color: '#607188' }, grid: { display: false } }
            }
        }
    });
}

/* ---------- Chart: Horizontal Bar (แนวนอน) ---------- */
function renderHorizontalBarChart(canvasId, labels, data, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    destroyChart(canvasId);
    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: color,
                borderRadius: 6,
                maxBarThickness: 26
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(30,50,80,.92)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: { label: (c) => `${label}: ${c.parsed.x.toLocaleString()}` }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0, color: '#8492a6' }, grid: { color: '#eef2f7' } },
                y: { ticks: { color: '#607188', font: { size: 12 } }, grid: { display: false } }
            }
        }
    });
}

/* ---------- Chart: Pie / Doughnut ---------- */
function renderPieChart(canvasId, labels, data, label, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    destroyChart(canvasId);
    const colors = options.colors || buildColorArray(labels);
    chartInstances[canvasId] = new Chart(canvas, {
        type: options.doughnut === false ? 'pie' : 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
                tooltip: {
                    backgroundColor: 'rgba(30,50,80,.92)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: { label: (c) => `${c.label}: ${c.parsed.toLocaleString()}` }
                }
            },
            cutout: options.doughnut === false ? 0 : '62%'
        }
    });
}

/* ---------- Chart: Line ---------- */
function renderLineChart(canvasId, labels, data, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    destroyChart(canvasId);
    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: color || CHART_COLORS.blue,
                backgroundColor: (color || CHART_COLORS.blue) + '22',
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointBackgroundColor: color || CHART_COLORS.blue,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(30,50,80,.92)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: { label: (c) => `${label}: ${c.parsed.y.toLocaleString()}` }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { color: '#8492a6' }, grid: { color: '#eef2f7' } },
                x: { ticks: { color: '#607188' }, grid: { display: false } }
            }
        }
    });
}