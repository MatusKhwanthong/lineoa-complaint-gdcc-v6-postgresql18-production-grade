const state = {
  idToken: null,
  latitude: null,
  longitude: null,
  initialized: false,
  map: null,
  mapMarker: null,
  maxUploadFiles: 5,
  maxFileMb: 8,
  previewUrls: [],
  lineProfile: null,
};

const statusLabels = {
  new: 'รับเรื่องใหม่',
  received: 'รับเรื่องแล้ว',
  assigned: 'มอบหมายหน่วยงานแล้ว',
  in_progress: 'กำลังดำเนินการ',
  waiting_for_info: 'รอข้อมูลเพิ่มเติม',
  completed: 'ดำเนินการเสร็จสิ้น',
  rejected: 'ไม่รับดำเนินการ',
  cancelled: 'ยกเลิก',
};

const $ = (selector) => document.querySelector(selector);

function showAlert(message, type = 'error') {
  const alert = $('#alert');
  alert.textContent = message;
  alert.className = `alert ${type}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearAlert() {
  $('#alert').className = 'alert hidden';
  $('#alert').textContent = '';
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;

  if (!isFormData) headers.set('content-type', 'application/json');
  if (state.devUserId) {
    headers.set('x-dev-user-id', state.devUserId);
    headers.set('x-dev-display-name', 'Test User');
  } else if (state.idToken) {
    headers.set('authorization', `Bearer ${state.idToken}`);
  }

  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json')
    ? await response.json()
    : await response.blob();

  if (!response.ok) {
    const message =
      result && typeof result === 'object' && 'message' in result
        ? result.message
        : `เกิดข้อผิดพลาด ${response.status}`;
    throw new Error(message);
  }
  return result;
}

async function initializeLiff() {
  const greeting = $('#userGreeting');
  const setLineStatus = (message) => {
    if (greeting) greeting.textContent = message;
  };

  try {
    setLineStatus('กำลังโหลดการตั้งค่า LINE…');

    const configResponse = await fetch('/api/config', {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (!configResponse.ok) {
      throw new Error(`CONFIG_HTTP_${configResponse.status}`);
    }

    const config = await configResponse.json();
    state.maxUploadFiles = config.uploadLimits?.maxFiles || 5;
    state.maxFileMb = config.uploadLimits?.maxFileMb || 8;

    $('#privacyLink').href = config.privacyPolicyUrl || '/privacy.html';
    $('#imageHelp').textContent =
      `แนบ 1–${state.maxUploadFiles} ภาพ ภาพละไม่เกิน ${state.maxFileMb} MB ` +
      'ระบบจะลบข้อมูล EXIF และย่อขนาดก่อนจัดเก็บ';

    if (config.devBypassLineAuth) {
      state.devUserId = 'dev-user-001';
      setLineStatus('สวัสดี ผู้ใช้ทดสอบ (dev mode)');
      if (!$('#contactName').value) $('#contactName').value = 'ผู้ใช้ทดสอบ';
      state.initialized = true;
      return true;
    }

    if (!config.liffId) throw new Error('LIFF_ID_MISSING');
    if (!window.liff) throw new Error('LIFF_SDK_NOT_LOADED');

    setLineStatus('กำลังเริ่มต้น LINE LIFF…');
    await Promise.race([
      window.liff.init({ liffId: config.liffId }),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('LIFF_INIT_TIMEOUT')), 20000);
      }),
    ]);

    if (!window.liff.isLoggedIn()) {
      setLineStatus('กำลังเข้าสู่ระบบ LINE…');
      window.liff.login({
        redirectUri: `${window.location.origin}${window.location.pathname}`,
      });
      return false;
    }

    state.idToken = window.liff.getIDToken();
    if (!state.idToken) throw new Error('ID_TOKEN_MISSING_OPENID_SCOPE');

    setLineStatus('กำลังโหลดข้อมูลผู้ใช้ LINE…');
    const profile = await window.liff.getProfile();
    state.lineProfile = profile;

    setLineStatus(`สวัสดี ${profile.displayName || 'ผู้ใช้ LINE'}`);
    if (!$('#contactName').value) $('#contactName').value = profile.displayName || '';

    const profileImage = $('#lineProfileImage');
    const fallbackIcon = $('#lineFallbackIcon');

    async function showLineProfileImage(pictureUrl) {
      if (!profileImage || !pictureUrl) return false;

      const proxiedUrl = `/api/line/profile-image?url=${encodeURIComponent(pictureUrl)}`;
      const candidateUrls = [proxiedUrl, pictureUrl];

      for (const imageUrl of candidateUrls) {
        try {
          const preload = new Image();
          preload.decoding = 'async';
          preload.referrerPolicy = 'no-referrer';

          await new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('PROFILE_IMAGE_TIMEOUT')), 10000);
            preload.onload = () => {
              window.clearTimeout(timer);
              resolve();
            };
            preload.onerror = () => {
              window.clearTimeout(timer);
              reject(new Error('PROFILE_IMAGE_LOAD_FAILED'));
            };
            preload.src = imageUrl;
          });

          profileImage.alt = `รูปโปรไฟล์ของ ${profile.displayName || 'ผู้ใช้ LINE'}`;
          profileImage.referrerPolicy = 'no-referrer';
          profileImage.src = imageUrl;
          profileImage.classList.remove('hidden');
          fallbackIcon?.classList.add('hidden');
          return true;
        } catch (error) {
          console.warn('ลองโหลดรูปโปรไฟล์ LINE ไม่สำเร็จ', { imageUrl, error: error.message });
        }
      }

      return false;
    }

    profileImage?.removeAttribute('src');
    profileImage?.classList.add('hidden');
    fallbackIcon?.classList.remove('hidden');

    if (profile.pictureUrl) {
      const loaded = await showLineProfileImage(profile.pictureUrl);
      if (!loaded) console.warn('โหลดรูปโปรไฟล์ LINE ไม่สำเร็จทุกวิธี', profile.pictureUrl);
    }

    state.initialized = true;
    return true;
  } catch (error) {
    const code = error?.code || error?.message || 'UNKNOWN_LINE_ERROR';
    console.error('LINE LIFF connection failed', {
      code: error?.code,
      message: error?.message,
      currentUrl: window.location.href,
      isInClient: Boolean(window.liff?.isInClient?.()),
      isLoggedIn: Boolean(window.liff?.isLoggedIn?.()),
    });
    setLineStatus(`LINE ผิดพลาด: ${code}`);
    throw new Error(`เชื่อมต่อ LINE ไม่สำเร็จ (${code})`);
  }
}

async function loadCategories() {
  const result = await api('/api/categories');
  const select = $('#categoryId');
  select.replaceChildren(new Option('เลือกหมวดหมู่', ''));

  for (const category of result.data) {
    select.append(new Option(category.name_th, category.id));
  }
}

function formatThaiDate(value) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function openStreetMapUrl(latitude, longitude) {
  const lat = Number(latitude).toFixed(6);
  const lng = Number(longitude).toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
}

function ensureMap() {
  if (state.map) return state.map;

  if (typeof L === 'undefined') {
    throw new Error('ไม่สามารถโหลดระบบแผนที่ OpenStreetMap ได้');
  }

  const mapElement = $('#mapView');
  if (!mapElement) {
    throw new Error('ไม่พบพื้นที่แสดงแผนที่');
  }

  state.map = L.map(mapElement, {
    zoomControl: true,
    attributionControl: true,
    tap: true,
    touchZoom: true,
    dragging: true,
    doubleClickZoom: true,
    scrollWheelZoom: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(state.map);

  // แสดงสุราษฎร์ธานีทันที แม้ยังไม่ได้อนุญาตตำแหน่ง
  state.map.setView([9.1382, 99.3217], 13);

  const pinFromEvent = (event) => {
    if (!event?.latlng) return;
    setCoordinates(event.latlng.lat, event.latlng.lng);
  };

  state.map.on('click', pinFromEvent);

  // ปุ่มสำรองสำหรับมือถือ/LINE WebView ที่ event click อาจไม่ทำงานบางรุ่น
  mapElement.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerType !== 'touch') return;
      if (event.target?.closest?.('.leaflet-control, .leaflet-marker-icon')) return;

      const rect = mapElement.getBoundingClientRect();
      const point = L.point(event.clientX - rect.left, event.clientY - rect.top);
      const latLng = state.map.containerPointToLatLng(point);
      setCoordinates(latLng.lat, latLng.lng);
    },
    { passive: true },
  );

  window.setTimeout(() => state.map.invalidateSize(true), 100);
  return state.map;
}
function renderMap(latitude, longitude) {
  const panel = $('#mapPanel');
  const link = $('#openMap');
  const map = ensureMap();
  const latLng = [latitude, longitude];

  link.href = openStreetMapUrl(latitude, longitude);
  panel.classList.remove('hidden');

  if (!state.mapMarker) {
    state.mapMarker = L.marker(latLng, { draggable: true }).addTo(map);
    state.mapMarker.on('dragend', () => {
      const position = state.mapMarker.getLatLng();
      setCoordinates(position.lat, position.lng);
    });
  } else {
    state.mapMarker.setLatLng(latLng);
  }

  map.setView(latLng, 17);
  window.setTimeout(() => map.invalidateSize(), 0);
}

function setCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return false;
  }

  state.latitude = lat;
  state.longitude = lng;
  $('#latitude').value = lat.toFixed(6);
  $('#longitude').value = lng.toFixed(6);
  $('#locationStatus').textContent =
    `บันทึกพิกัดแล้ว (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  renderMap(lat, lng);
  return true;
}

function syncManualCoordinates() {
  const lat = $('#latitude').value.trim();
  const lng = $('#longitude').value.trim();
  if (lat && lng) setCoordinates(lat, lng);
}

function clearImagePreviews() {
  state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls = [];
  $('#imagePreview').replaceChildren();
}

function renderSelectedImages() {
  clearAlert();
  clearImagePreviews();

  const files = [...$('#images').files];
  if (files.length > state.maxUploadFiles) {
    $('#images').value = '';
    showAlert(`แนบรูปภาพได้ไม่เกิน ${state.maxUploadFiles} ภาพ`);
    return;
  }

  for (const file of files) {
    if (file.size > state.maxFileMb * 1024 * 1024) {
      $('#images').value = '';
      clearImagePreviews();
      showAlert(`ไฟล์ “${file.name}” ต้องไม่เกิน ${state.maxFileMb} MB`);
      return;
    }

    const url = URL.createObjectURL(file);
    state.previewUrls.push(url);

    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = url;
    image.alt = file.name;
    image.loading = 'lazy';

    const caption = document.createElement('figcaption');
    caption.textContent = file.name;

    figure.append(image, caption);
    $('#imagePreview').append(figure);
  }
}

async function loadProtectedGallery(container, attachments, urlBuilder, authToken) {
  if (!attachments?.length) return;

  container.innerHTML = '<p class="muted">กำลังโหลดรูปภาพ…</p>';
  const gallery = document.createElement('div');
  gallery.className = 'protected-gallery';

  try {
    for (const attachment of attachments) {
      const response = await fetch(urlBuilder(attachment), {
        headers: { authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('ไม่สามารถอ่านรูปภาพได้');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.target = '_blank';
      link.rel = 'noopener';

      const image = document.createElement('img');
      image.src = objectUrl;
      image.alt = attachment.originalName || 'รูปภาพประกอบ';
      image.loading = 'lazy';

      link.append(image);
      gallery.append(link);
    }

    container.replaceChildren(gallery);
  } catch (error) {
    container.innerHTML = `<p class="error-text">${error.message}</p>`;
  }
}

async function loadComplaints() {
  const list = $('#complaintList');
  list.innerHTML = '<p class="muted">กำลังโหลดข้อมูล…</p>';

  try {
    const result = await api('/api/complaints');

    if (!result.data.length) {
      list.innerHTML = '<p class="empty">ยังไม่มีเรื่องร้องเรียน</p>';
      return;
    }

    list.replaceChildren();

    for (const item of result.data) {
      const article = document.createElement('article');
      article.className = 'complaint-card';

      const heading = document.createElement('div');
      heading.className = 'card-heading';

      const reference = document.createElement('strong');
      reference.textContent = item.reference_no;

      const badge = document.createElement('span');
      badge.className = `badge status-${item.status}`;
      badge.textContent = statusLabels[item.status] || item.status;

      heading.append(reference, badge);

      const title = document.createElement('h3');
      title.textContent = item.title;

      const category = document.createElement('p');
      category.textContent = `หมวดหมู่: ${item.category_name}`;

      const location = document.createElement('p');
      location.textContent = `สถานที่: ${item.location_text}`;

      const actions = document.createElement('div');
      actions.className = 'card-actions';

      if (item.latitude !== null && item.longitude !== null) {
        const mapLink = document.createElement('a');
        mapLink.href = openStreetMapUrl(item.latitude, item.longitude);
        mapLink.target = '_blank';
        mapLink.rel = 'noopener';
        mapLink.className = 'secondary link-button';
        mapLink.textContent = 'เปิด OpenStreetMap';
        actions.append(mapLink);
      }

      const galleryContainer = document.createElement('div');
      galleryContainer.className = 'gallery-container hidden';

      if (item.attachments?.length) {
        const imageButton = document.createElement('button');
        imageButton.type = 'button';
        imageButton.className = 'secondary';
        imageButton.textContent = `ดูรูปภาพ (${item.attachments.length})`;
        imageButton.addEventListener('click', async () => {
          galleryContainer.classList.toggle('hidden');
          if (!galleryContainer.dataset.loaded) {
            galleryContainer.dataset.loaded = 'true';
            await loadProtectedGallery(
              galleryContainer,
              item.attachments,
              (attachment) =>
                `/api/complaints/${encodeURIComponent(item.reference_no)}/attachments/${attachment.id}`,
              state.idToken,
            );
          }
        });
        actions.append(imageButton);
      }

      const date = document.createElement('p');
      date.className = 'muted';
      date.textContent = `แจ้งเมื่อ ${formatThaiDate(item.created_at)}`;

      article.append(heading, title, category, location, actions, galleryContainer, date);
      list.append(article);
    }
  } catch (error) {
    list.innerHTML = `<p class="error-text">${error.message}</p>`;
  }
}

function activateTab(panelId) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === panelId);
  });
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.add('hidden'));
  $(`#${panelId}`).classList.remove('hidden');
  $(`#${panelId}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (panelId === 'historyPanel') loadComplaints();
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });
  document.querySelectorAll('[data-open-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.openTab));
  });
}

function getGeolocationErrorMessage(error, permissionState = 'unknown') {
  if (permissionState === 'denied' || error?.code === 1) {
    return (
      'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาเปิดสิทธิ์ตำแหน่งให้แอป LINE ' +
      'แล้วปิดหน้า LIFF และเปิดใหม่ หรือแตะตำแหน่งบนแผนที่แทน'
    );
  }

  switch (error?.code) {
    case 2:
      return 'อุปกรณ์ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS/Wi-Fi หรือแตะตำแหน่งบนแผนที่แทน';
    case 3:
      return 'ค้นหาตำแหน่งนานเกินไป กรุณาลองใหม่หรือแตะตำแหน่งบนแผนที่แทน';
    default:
      return `ไม่สามารถอ่านตำแหน่งปัจจุบันได้${error?.message ? ` (${error.message})` : ''}`;
  }
}

async function getLocationPermissionState() {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state || 'unknown';
  } catch {
    // LINE WebView/iOS บางรุ่นไม่รองรับ Permissions API
    return 'unknown';
  }
}

function requestCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function showManualLocationPicker() {
  try {
    const panel = $('#mapPanel');
    const map = ensureMap();

    panel.classList.remove('hidden');

    if (state.latitude === null || state.longitude === null) {
      map.setView([9.1382, 99.3217], 13);
    }

    window.setTimeout(() => {
      map.invalidateSize(true);
      map.getContainer().scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 100);

    $('#locationStatus').textContent =
      'แตะตำแหน่งบนแผนที่เพื่อปักหมุด จากนั้นลากหมุดเพื่อปรับตำแหน่ง';
  } catch (mapError) {
    console.error('Unable to show manual map picker:', mapError);
    showAlert(mapError.message || 'ไม่สามารถเปิดแผนที่ได้');
  }
}

function setupLocation() {
  const button = $('#getLocationButton');
  const manualButton = $('#pickLocationButton');
  const status = $('#locationStatus');

  manualButton?.addEventListener('click', () => {
    clearAlert();
    showManualLocationPicker();
  });

  button.addEventListener('click', async () => {
    clearAlert();

    if (!navigator.geolocation) {
      showAlert('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง กรุณาแตะตำแหน่งบนแผนที่แทน');
      showManualLocationPicker();
      return;
    }

    if (!window.isSecureContext) {
      showAlert('การใช้ตำแหน่งต้องเปิดเว็บผ่าน HTTPS เท่านั้น กรุณาแตะตำแหน่งบนแผนที่แทน');
      status.textContent = 'ไม่สามารถใช้ตำแหน่งบนการเชื่อมต่อที่ไม่ปลอดภัย';
      showManualLocationPicker();
      return;
    }

    const permissionState = await getLocationPermissionState();
    if (permissionState === 'denied') {
      showAlert(getGeolocationErrorMessage({ code: 1 }, permissionState));
      showManualLocationPicker();
      return;
    }

    button.disabled = true;
    button.textContent = '⌖ กำลังค้นหาตำแหน่ง…';
    status.textContent = 'กำลังขอสิทธิ์และค้นหาตำแหน่ง…';

    try {
      let position;
      try {
        position = await requestCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20_000,
          maximumAge: 0,
        });
      } catch (firstError) {
        if (firstError?.code !== 1) {
          position = await requestCurrentPosition({
            enableHighAccuracy: false,
            timeout: 15_000,
            maximumAge: 60_000,
          });
        } else {
          throw firstError;
        }
      }

      const saved = setCoordinates(
        position.coords.latitude,
        position.coords.longitude,
      );

      if (!saved) throw new Error('พิกัดที่ได้รับไม่ถูกต้อง');

      const accuracy = Number(position.coords.accuracy);
      if (Number.isFinite(accuracy)) {
        status.textContent += ` ความคลาดเคลื่อนประมาณ ${Math.round(accuracy)} เมตร`;
      }
    } catch (error) {
      const latestPermissionState = await getLocationPermissionState();
      status.textContent = 'ไม่สามารถอ่านตำแหน่งอัตโนมัติได้ กรุณาเลือกบนแผนที่';
      showAlert(getGeolocationErrorMessage(error, latestPermissionState));
      showManualLocationPicker();
      console.error('Geolocation failed:', {
        code: error?.code,
        message: error?.message,
        permissionState: latestPermissionState,
        isInLineClient: Boolean(window.liff?.isInClient?.()),
      });
    } finally {
      button.disabled = false;
      button.textContent = '⌖ ลองใช้ตำแหน่งปัจจุบันอีกครั้ง';
    }
  });

  $('#latitude').addEventListener('change', syncManualCoordinates);
  $('#longitude').addEventListener('change', syncManualCoordinates);
}

const complaintRequiredFields = [
  { selector: '#categoryId', message: 'กรุณาเลือกหมวดหมู่' },
  { selector: '#title', message: 'กรุณากรอกหัวข้อ' },
  {
    selector: '#images',
    message: 'กรุณาแนบรูปภาพอย่างน้อย 1 ภาพ',
    validate: (element) => Boolean(element.files?.length),
  },
  { selector: '#contactName', message: 'กรุณากรอกชื่อผู้ติดต่อ' },
  {
    selector: '#contactPhone',
    message: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง',
    validate: (element) => {
      const phone = element.value.replace(/\D/g, '');
      return phone.length >= 9 && phone.length <= 10;
    },
  },
  {
    selector: '#privacyConsent',
    message: 'กรุณายอมรับประกาศความเป็นส่วนตัว',
    validate: (element) => element.checked,
  },
];

function getFieldErrorContainer(element) {
  return (
    element.closest('.file-picker') ||
    element.closest('.consent') ||
    element.closest('label')
  );
}

function removeFieldError(element) {
  if (!element) return;
  element.classList.remove('field-invalid');
  element.removeAttribute('aria-invalid');
  element.removeAttribute('aria-describedby');

  const container = getFieldErrorContainer(element);
  container?.classList.remove('field-container-invalid');
  document.getElementById(`${element.id}-error`)?.remove();
}

function showFieldError(element, message) {
  if (!element) return;
  removeFieldError(element);

  element.classList.add('field-invalid');
  element.setAttribute('aria-invalid', 'true');

  const container = getFieldErrorContainer(element);
  container?.classList.add('field-container-invalid');

  const error = document.createElement('small');
  error.id = `${element.id}-error`;
  error.className = 'field-error';
  error.textContent = message;
  element.setAttribute('aria-describedby', error.id);

  if (element.type === 'file' || element.type === 'checkbox') {
    container?.insertAdjacentElement('afterend', error);
  } else {
    element.insertAdjacentElement('afterend', error);
  }
}

function isRequiredFieldValid(field, element) {
  return field.validate ? field.validate(element) : element.value.trim() !== '';
}

function validateComplaintForm() {
  let firstInvalid = null;
  let invalidCount = 0;

  for (const field of complaintRequiredFields) {
    const element = $(field.selector);
    if (!element) continue;

    removeFieldError(element);
    if (isRequiredFieldValid(field, element)) continue;

    invalidCount += 1;
    showFieldError(element, field.message);
    firstInvalid ||= element;
  }

  if (!firstInvalid) return true;

  showAlert(`กรุณากรอกข้อมูลให้ครบถ้วน ยังขาด ${invalidCount} รายการ`);
  const scrollTarget = getFieldErrorContainer(firstInvalid) || firstInvalid;
  scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => firstInvalid.focus({ preventScroll: true }), 350);
  return false;
}

function setupLiveFieldValidation() {
  for (const field of complaintRequiredFields) {
    const element = $(field.selector);
    if (!element) continue;

    const eventName =
      element.type === 'file' ||
      element.type === 'checkbox' ||
      element.tagName === 'SELECT'
        ? 'change'
        : 'input';

    element.addEventListener(eventName, () => {
      if (isRequiredFieldValid(field, element)) removeFieldError(element);
    });
  }
}

function clearAllFieldErrors() {
  for (const field of complaintRequiredFields) {
    removeFieldError($(field.selector));
  }
  removeFieldError($('#latitude'));
  removeFieldError($('#longitude'));
}

function setupForm() {
  const form = $('#complaintForm');
  const submitButton = $('#submitButton');

  $('#images').addEventListener('change', renderSelectedImages);
  setupLiveFieldValidation();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert();

    if (!validateComplaintForm()) return;

    const latitude = $('#latitude').value.trim();
    const longitude = $('#longitude').value.trim();
    removeFieldError($('#latitude'));
    removeFieldError($('#longitude'));

    // สถานที่และพิกัดไม่บังคับ แต่ถ้ากรอกพิกัด ต้องกรอกให้ครบทั้งคู่
    if (latitude || longitude) {
      if (!latitude || !longitude || !setCoordinates(latitude, longitude)) {
        const invalidCoordinate = !latitude ? $('#latitude') : $('#longitude');
        showFieldError(
          invalidCoordinate,
          'กรุณากรอก Latitude และ Longitude ให้ครบและถูกต้อง',
        );
        showAlert('ข้อมูลพิกัดไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
        invalidCoordinate.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => invalidCoordinate.focus({ preventScroll: true }), 350);
        return;
      }
    } else {
      state.latitude = null;
      state.longitude = null;
    }

    const selectedFiles = [...$('#images').files];

    submitButton.disabled = true;
    submitButton.textContent = 'กำลังอัปโหลดและส่งข้อมูล…';

    try {
      const payload = new FormData();
      payload.set('categoryId', $('#categoryId').value);
      payload.set('title', $('#title').value);
      payload.set('description', $('#description').value);
      payload.set('locationText', $('#locationText').value);
      payload.set('latitude', state.latitude === null ? '' : String(state.latitude));
      payload.set('longitude', state.longitude === null ? '' : String(state.longitude));
      payload.set('contactName', $('#contactName').value);
      payload.set('contactPhone', $('#contactPhone').value);
      payload.set('contactEmail', $('#contactEmail').value);
      payload.set('privacyConsent', String($('#privacyConsent').checked));

      for (const file of selectedFiles) {
        payload.append('images', file, file.name);
      }

      const result = await api('/api/complaints', {
        method: 'POST',
        body: payload,
      });

      form.classList.add('hidden');
      $('#successReference').textContent = result.data.referenceNo;
      $('#successCard').classList.remove('hidden');
    } catch (error) {
      showAlert(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'ส่งเรื่องร้องเรียน';
    }
  });

  $('#newComplaintButton').addEventListener('click', () => {
    form.reset();
    clearAllFieldErrors();
    clearAlert();
    state.latitude = null;
    state.longitude = null;
    clearImagePreviews();
    $('#locationStatus').textContent = 'ยังไม่ได้บันทึกพิกัด';
    $('#mapPanel').classList.add('hidden');
    if (state.mapMarker && state.map) {
      state.map.removeLayer(state.mapMarker);
      state.mapMarker = null;
    }
    $('#successCard').classList.add('hidden');
    form.classList.remove('hidden');
  });

  $('#refreshButton').addEventListener('click', loadComplaints);
}

async function main() {
  setupTabs();
  setupLocation();
  setupForm();

  try {
    ensureMap();
  } catch (error) {
    console.error('Map initialization failed:', error);
    showAlert(error.message || 'ไม่สามารถเปิดแผนที่ได้');
  }

  let lineReady = false;
  try {
    lineReady = await initializeLiff();
  } catch (error) {
    showAlert(error?.message || 'เชื่อมต่อ LINE ไม่สำเร็จ');
  }

  // หมวดหมู่เป็นข้อมูลสาธารณะ โหลดได้แม้ LINE มีปัญหา
  try {
    await loadCategories();
    if (lineReady) clearAlert();
  } catch (error) {
    console.error('Loading categories failed:', error);
    const apiMessage = `โหลดข้อมูลระบบไม่สำเร็จ (${error?.message || 'UNKNOWN_API_ERROR'})`;
    showAlert(lineReady ? apiMessage : `${$('#alert').textContent} | ${apiMessage}`);
  }
}

main();
