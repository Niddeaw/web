// ==========================================
// homevisit_map.js
// แผนที่, เส้นทาง, พิกัด, Geocode, Google Maps
// ==========================================

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    if (map) { map.invalidateSize(); return; }

    map = L.map('map').setView([SCHOOL_LAT, SCHOOL_LNG], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const schoolIcon = L.divIcon({
        html: `<div style="width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:26px solid #dc2626;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));position:relative;"><div style="position:absolute;bottom:-24px;left:-6px;width:12px;height:12px;background:#fff;border-radius:50%;"></div></div>`,
        iconSize: [28, 28], iconAnchor: [14, 26], className: ''
    });

    const homeIcon = L.divIcon({
        html: `<div style="width:22px;height:22px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.6);"></div>`,
        iconSize: [22, 22], iconAnchor: [11, 11], className: ''
    });

    schoolMarkerObj = L.marker([SCHOOL_LAT, SCHOOL_LNG], { icon: schoolIcon, draggable: false })
        .addTo(map)
        .bindTooltip(`🏫 ${SCHOOL_NAME}`, { permanent: false, direction: 'top' });

    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');
    const hasCoords = latInput?.value && lngInput?.value;
    const homeLat = hasCoords ? parseFloat(latInput.value) : SCHOOL_LAT;
    const homeLng = hasCoords ? parseFloat(lngInput.value) : SCHOOL_LNG;

    marker = L.marker([homeLat, homeLng], { icon: homeIcon, draggable: true })
        .addTo(map)
        .bindTooltip('🏠 บ้านนักเรียน', { permanent: false, direction: 'top' });

    marker.on('dragend', function () {
        const pos = marker.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(7);
        document.getElementById('lng').value = pos.lng.toFixed(7);
        calculateRoute(SCHOOL_LAT, SCHOOL_LNG, pos.lat, pos.lng);
    });

    $('#lat, #lng').off('input').on('input', function () {
        const lat = parseFloat($('#lat').val());
        const lng = parseFloat($('#lng').val());
        if (!isNaN(lat) && !isNaN(lng) && marker) {
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], map.getZoom());
            calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
        }
    });

    if (hasCoords && !isNaN(homeLat) && !isNaN(homeLng)) {
        calculateRoute(SCHOOL_LAT, SCHOOL_LNG, homeLat, homeLng);
    } else {
        updateRouteInfoPanel(null);
    }
}

async function calculateRoute(fromLat, fromLng, toLat, toLng) {
    const panel = document.getElementById('route-info-panel');
    if (panel) {
        panel.innerHTML = `<div class="flex items-center gap-2 text-orange-500 text-sm font-bold py-2 animate-pulse"><i class="fas fa-spinner fa-spin"></i> กำลังคำนวณเส้นทาง...</div>`;
    }
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes?.length) {
            updateRouteInfoPanel(null);
            return;
        }

        const route = data.routes[0];
        const distanceKm = (route.distance / 1000).toFixed(2);
        const durationMin = Math.round(route.duration / 60);

        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.geoJSON(route.geometry, {
            style: { color: '#3b82f6', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }
        }).addTo(map);

        const bounds = L.latLngBounds([fromLat, fromLng], [toLat, toLng]);
        map.fitBounds(bounds, { padding: [50, 50] });

        document.getElementById('travel_distance').value = distanceKm;
        document.getElementById('travel_hour').value = Math.floor(durationMin / 60);
        document.getElementById('travel_minute').value = durationMin % 60;

        updateRouteInfoPanel({ distanceKm, durationMin, toLat, toLng });
    } catch (e) {
        console.error('Route calculation error:', e);
        updateRouteInfoPanel(null);
    }
}

function updateRouteInfoPanel(info) {
    const panel = document.getElementById('route-info-panel');
    if (!panel) return;
    const latVal = document.getElementById('lat')?.value || '';
    const lngVal = document.getElementById('lng')?.value || '';

    if (!info) {
        panel.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">📍 พิกัดโรงเรียน</p><p class="font-mono text-xs font-bold text-slate-600">${SCHOOL_LAT}, ${SCHOOL_LNG}</p></div><div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">🏠 พิกัดบ้านนักเรียน</p><p class="font-mono text-xs font-bold text-slate-400">${latVal ? latVal + ', ' + lngVal : 'ยังไม่ได้ปักหมุด'}</p></div></div>`;
        return;
    }

    const hrs = Math.floor(info.durationMin / 60);
    const mins = info.durationMin % 60;
    const timeStr = hrs > 0 ? `${hrs} ชั่วโมง ${mins} นาที` : `${mins} นาที`;

    panel.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-3 text-xs">
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-0.5"><span class="inline-block w-3 h-3 bg-red-600 rounded-sm" style="clip-path:polygon(50% 0%,100% 100%,0% 100%)"></span> โรงเรียน</p><p class="font-bold text-slate-700">${SCHOOL_NAME}</p></div>
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">พิกัดโรงเรียน</p><p class="font-mono font-bold text-slate-600">${SCHOOL_LAT}, ${SCHOOL_LNG}</p></div>
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-0.5"><span class="inline-block w-3 h-3 bg-blue-600 rounded-full"></span> บ้านนักเรียน</p><p class="font-bold text-slate-700">-</p></div>
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">พิกัดบ้านนักเรียน</p><p class="font-mono font-bold text-slate-600">${parseFloat(info.toLat).toFixed(5)}, ${parseFloat(info.toLng).toFixed(5)}</p></div>
        </div>
        <div class="flex items-center gap-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl px-4 py-3">
            <i class="fas fa-route text-orange-500 text-2xl flex-shrink-0"></i>
            <div class="flex-1"><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider">ระยะถนนจริง</p><p class="text-2xl font-black text-orange-700 leading-tight">${info.distanceKm} <span class="text-base font-bold text-orange-600">กิโลเมตร</span> <span class="text-sm font-bold text-slate-500 ml-2">(ระยะทางถนนจริง — ประมาณ ${info.durationMin} นาที)</span></p></div>
            <div class="flex gap-3 text-center flex-shrink-0"><div class="bg-white border border-orange-200 rounded-xl px-3 py-2 shadow-sm"><i class="fas fa-car text-orange-500 text-sm"></i><p class="text-xs font-black text-orange-700 mt-0.5">${info.distanceKm} กม.</p></div><div class="bg-white border border-orange-200 rounded-xl px-3 py-2 shadow-sm"><i class="fas fa-clock text-orange-500 text-sm"></i><p class="text-xs font-black text-orange-700 mt-0.5">ประมาณ ${timeStr}</p></div></div>
        </div>`;
}

window.updateMarkerFromInputs = function () {
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);
    if (isNaN(lat) || isNaN(lng)) return;
    if (map && marker) {
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], map.getZoom());
    }
};

window.geocodeAddress = function () {
    const house = document.getElementById('addr_house').value;
    const subdistrict = document.getElementById('addr_subdistrict').value;
    const district = document.getElementById('addr_district').value;
    const province = document.getElementById('addr_province').value;
    const address = `${house}, ${subdistrict}, ${district}, ${province}, Thailand`;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        .then(res => res.json())
        .then(data => {
            if (data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                document.getElementById('lat').value = lat.toFixed(7);
                document.getElementById('lng').value = lng.toFixed(7);
                if (map && marker) {
                    marker.setLatLng([lat, lng]);
                    map.setView([lat, lng], 16);
                    calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
                }
            } else {
                Swal.fire('ไม่พบ', 'ไม่พบพิกัดจากที่อยู่นี้', 'warning');
            }
        });
};

function parseGoogleMapsUrl(url) {
    let match = url.match(/@([-\d.]+),([-\d.]+),\d+z/i);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    match = url.match(/!3d([-\d.]+)!4d([-\d.]+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    match = url.match(/[?&]q=(loc:)?([-\d.]+),([-\d.]+)/);
    if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[3]) };
    return null;
}

window.parseAndPinCoords = function () {
    const raw = document.getElementById('coord-input').value.trim();
    if (!raw) return Swal.fire('กรุณาวางพิกัด', 'คัดลอกพิกัดจาก Google Maps แล้ววางในช่อง', 'warning');
    const parts = raw.split(/[\s,]+/).filter(p => p);
    if (parts.length < 2) return Swal.fire('รูปแบบไม่ถูกต้อง', 'ตัวอย่างรูปแบบที่ถูกต้อง: 13.7389, 100.2595', 'warning');
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return Swal.fire('รูปแบบไม่ถูกต้อง', 'พบตัวเลขพิกัดไม่สมบูรณ์', 'warning');
    document.getElementById('lat').value = lat.toFixed(7);
    document.getElementById('lng').value = lng.toFixed(7);
    if (map && marker) {
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], 13);
        calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
    }
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `ปักหมุดแล้ว: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, showConfirmButton: false, timer: 2500 });
};

window.openInGoogleMaps = function () {
    const house = document.getElementById('addr_house').value;
    const subdistrict = document.getElementById('addr_subdistrict').value;
    const district = document.getElementById('addr_district').value;
    const province = document.getElementById('addr_province').value;
    const address = `${house}, ${subdistrict}, ${district}, ${province}, Thailand`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
};

window.openRouteInGoogleMaps = function () {
    const lat = parseFloat(document.getElementById('lat')?.value);
    const lng = parseFloat(document.getElementById('lng')?.value);
    if (isNaN(lat) || isNaN(lng) || !lat || !lng) {
        Swal.fire({ icon: 'warning', title: 'ยังไม่มีพิกัดบ้าน', text: 'กรุณาปักหมุดบ้านนักเรียน หรือกรอกละติจูด/ลองจิจูด ก่อน', confirmButtonText: 'ตกลง' });
        return;
    }
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${SCHOOL_LAT},${SCHOOL_LNG}&destination=${lat},${lng}&travelmode=driving`, '_blank');
};