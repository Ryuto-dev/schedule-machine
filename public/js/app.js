/* ═══════════════════════════════════════════════════
   App Controller – Initialization & Routing
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupModalHandlers();
  setupSettingsModal();
  setupPlaceModal();
  setupEventModal();
  setupContextMenu();
  setupEditorActions();
  setupKeyboard();

  // Route
  const hash = window.location.hash;
  if (hash && hash.startsWith('#schedule/')) {
    const id = hash.replace('#schedule/', '');
    await openSchedule(id);
  } else {
    showScreen('schedule-list-screen');
    await loadScheduleList();
  }

  window.addEventListener('hashchange', async () => {
    const h = window.location.hash;
    if (h.startsWith('#schedule/')) {
      await openSchedule(h.replace('#schedule/', ''));
    } else {
      showScreen('schedule-list-screen');
      API.disconnectSSE();
      await loadScheduleList();
    }
  });
}

// ── Screen switching ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Schedule List ──
async function loadScheduleList() {
  try {
    const schedules = await API.listSchedules();
    const container = document.getElementById('schedule-list');
    const empty = document.getElementById('empty-state');

    container.innerHTML = '';

    if (schedules.length === 0) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    schedules.forEach(s => {
      const card = document.createElement('div');
      card.className = 'schedule-card';
      card.innerHTML = `
        <h3>${escHtml(s.name)}</h3>
        <div class="meta">
          <span><span class="material-icons-round" style="font-size:14px;vertical-align:middle">calendar_today</span> ${formatDate(s.created_at)}</span>
          <span><span class="material-icons-round" style="font-size:14px;vertical-align:middle">update</span> ${formatDate(s.updated_at)}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-icon btn-sm" data-action="duplicate" title="複製">
            <span class="material-icons-round">content_copy</span>
          </button>
          <button class="btn btn-icon btn-sm" data-action="delete" title="削除">
            <span class="material-icons-round">delete</span>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        window.location.hash = `#schedule/${s.id}`;
      });

      card.querySelector('[data-action="duplicate"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await API.duplicateSchedule(s.id);
          showToast('スケジュールを複製しました', 'success');
          await loadScheduleList();
        } catch (err) {
          showToast('複製に失敗しました', 'error');
        }
      });

      card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`「${s.name}」を削除しますか？`)) return;
        try {
          await API.deleteSchedule(s.id);
          showToast('スケジュールを削除しました', 'success');
          await loadScheduleList();
        } catch (err) {
          showToast('削除に失敗しました', 'error');
        }
      });

      container.appendChild(card);
    });
  } catch (err) {
    showToast('スケジュール一覧の取得に失敗しました', 'error');
  }
}

document.getElementById('btn-new-schedule').addEventListener('click', async () => {
  try {
    const schedule = await API.createSchedule('新しいスケジュール');
    window.location.hash = `#schedule/${schedule.id}`;
  } catch (err) {
    showToast('作成に失敗しました', 'error');
  }
});

// ── Open Schedule ──
async function openSchedule(id) {
  try {
    const schedule = await API.getSchedule(id);
    if (!schedule) {
      showToast('スケジュールが見つかりません', 'error');
      window.location.hash = '';
      return;
    }

    AppState.setSchedule(schedule);
    showScreen('editor-screen');

    document.getElementById('schedule-title').value = schedule.name;

    Timeline.init(document.getElementById('timeline-container'));
    Timeline.render();
    EventManager.init();

    // Connect SSE
    API.connectSSE(id, handleSSEMessage);
    setSyncStatus('synced');
  } catch (err) {
    showToast('スケジュールの読み込みに失敗しました', 'error');
    console.error(err);
  }
}

// ── SSE handler ──
function handleSSEMessage(msg) {
  if (msg.type === 'connected') return;

  switch (msg.type) {
    case 'event_added':
      AppState.addEventLocal(msg.data);
      Timeline.renderEvents();
      break;
    case 'event_updated':
      AppState.updateEventLocal(msg.data);
      Timeline.renderEvents();
      break;
    case 'event_deleted':
      AppState.removeEventLocal(msg.data.id);
      Timeline.renderEvents();
      break;
    case 'place_added':
      AppState.addPlaceLocal(msg.data);
      Timeline.render();
      EventManager.init();
      break;
    case 'place_updated':
      AppState.updatePlaceLocal(msg.data);
      Timeline.render();
      EventManager.init();
      break;
    case 'place_deleted':
      AppState.removePlaceLocal(msg.data.id);
      Timeline.render();
      EventManager.init();
      break;
    case 'places_reordered':
      if (AppState.currentSchedule) {
        AppState.currentSchedule.places = msg.data;
      }
      Timeline.render();
      EventManager.init();
      break;
    case 'schedule_updated':
      if (AppState.currentSchedule) {
        Object.assign(AppState.currentSchedule, msg.data);
        document.getElementById('schedule-title').value = msg.data.name;
        Timeline.render();
        EventManager.init();
      }
      break;
  }
  blinkSync();
}

function blinkSync() {
  const ind = document.getElementById('sync-indicator');
  ind.classList.add('syncing');
  setTimeout(() => ind.classList.remove('syncing'), 500);
}

// ── Editor actions ──
function setupEditorActions() {
  document.getElementById('btn-back').addEventListener('click', () => {
    window.location.hash = '';
  });

  // Title auto-save
  let titleTimer;
  document.getElementById('schedule-title').addEventListener('input', (e) => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(async () => {
      try {
        await API.updateSchedule(AppState.currentSchedule.id, { name: e.target.value });
        AppState.currentSchedule.name = e.target.value;
      } catch (err) { /* silent */ }
    }, 600);
  });

  document.getElementById('btn-add-event').addEventListener('click', () => {
    EventManager.openEventModal(null);
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    const s = AppState.currentSchedule;
    document.getElementById('settings-start-hour').value = s.start_hour;
    document.getElementById('settings-start-minute').value = s.start_minute;
    document.getElementById('settings-end-hour').value = s.end_hour;
    document.getElementById('settings-end-minute').value = s.end_minute;
    document.getElementById('modal-settings').classList.add('open');
  });

  document.getElementById('btn-manage-places').addEventListener('click', () => {
    renderPlaceList();
    document.getElementById('modal-places').classList.add('open');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    if (!AppState.currentSchedule) return;
    const data = JSON.stringify(AppState.currentSchedule, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (AppState.currentSchedule.name || 'schedule') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('エクスポートしました', 'success');
  });

  document.getElementById('btn-print').addEventListener('click', () => {
    window.print();
  });
}

// ── Settings Modal ──
function setupSettingsModal() {
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const sh = parseInt(document.getElementById('settings-start-hour').value);
    const sm = parseInt(document.getElementById('settings-start-minute').value);
    const eh = parseInt(document.getElementById('settings-end-hour').value);
    const em = parseInt(document.getElementById('settings-end-minute').value);

    if (sh * 60 + sm >= eh * 60 + em) {
      showToast('終了時刻は開始時刻より後にしてください', 'error');
      return;
    }

    try {
      setSyncStatus('syncing');
      const updated = await API.updateSchedule(AppState.currentSchedule.id, {
        start_hour: sh, start_minute: sm,
        end_hour: eh, end_minute: em
      });
      AppState.setSchedule(updated);
      Timeline.render();
      EventManager.init();
      closeAllModals();
      setSyncStatus('synced');
      showToast('時間範囲を更新しました', 'success');
    } catch (err) {
      showToast('更新に失敗しました', 'error');
      setSyncStatus('error');
    }
  });
}

// ── Place Management ──
function setupPlaceModal() {
  document.getElementById('btn-add-place').addEventListener('click', async () => {
    try {
      const colors = ['#4A90D9','#E8913A','#50B83C','#8B5CF6','#EC4899','#06B6D4','#F59E0B','#EF4444'];
      const color = colors[AppState.getPlacesOrdered().length % colors.length];
      setSyncStatus('syncing');
      const place = await API.addPlace(
        AppState.currentSchedule.id,
        `場所 ${AppState.getPlacesOrdered().length + 1}`,
        color
      );
      AppState.addPlaceLocal(place);
      renderPlaceList();
      Timeline.render();
      EventManager.init();
      setSyncStatus('synced');
    } catch (err) {
      showToast('場所の追加に失敗しました', 'error');
      setSyncStatus('error');
    }
  });
}

function renderPlaceList() {
  const container = document.getElementById('place-list');
  container.innerHTML = '';

  AppState.getPlacesOrdered().forEach(place => {
    const item = document.createElement('div');
    item.className = 'place-item';
    item.dataset.placeId = place.id;
    item.innerHTML = `
      <span class="drag-handle material-icons-round">drag_indicator</span>
      <div class="place-color-swatch" style="background:${place.color}">
        <input type="color" value="${place.color}">
      </div>
      <input type="text" value="${escHtml(place.name)}" placeholder="場所名">
      <button class="btn btn-icon btn-sm" data-action="delete" title="削除">
        <span class="material-icons-round">close</span>
      </button>
    `;

    // Color change
    item.querySelector('input[type="color"]').addEventListener('change', async (e) => {
      try {
        const updated = await API.updatePlace(place.id, { color: e.target.value });
        AppState.updatePlaceLocal(updated);
        item.querySelector('.place-color-swatch').style.background = e.target.value;
        Timeline.render();
        EventManager.init();
      } catch (err) { showToast('色の更新に失敗しました', 'error'); }
    });

    // Name change
    let nameTimer;
    item.querySelector('input[type="text"]').addEventListener('input', (e) => {
      clearTimeout(nameTimer);
      nameTimer = setTimeout(async () => {
        try {
          const updated = await API.updatePlace(place.id, { name: e.target.value });
          AppState.updatePlaceLocal(updated);
          Timeline.render();
          EventManager.init();
        } catch (err) { showToast('名前の更新に失敗しました', 'error'); }
      }, 500);
    });

    // Delete
    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (AppState.getPlacesOrdered().length <= 1) {
        showToast('最低1つの場所が必要です', 'error');
        return;
      }
      if (!confirm(`「${place.name}」を削除しますか？`)) return;
      try {
        setSyncStatus('syncing');
        await API.deletePlace(place.id);
        AppState.removePlaceLocal(place.id);
        renderPlaceList();
        Timeline.render();
        EventManager.init();
        setSyncStatus('synced');
      } catch (err) {
        showToast('削除に失敗しました', 'error');
        setSyncStatus('error');
      }
    });

    // Drag reorder
    item.querySelector('.drag-handle').addEventListener('mousedown', (e) => {
      startPlaceDrag(e, item);
    });

    container.appendChild(item);
  });
}

// Simple place drag reorder
let placeDragState = null;

function startPlaceDrag(e, item) {
  e.preventDefault();
  const container = document.getElementById('place-list');
  const items = Array.from(container.children);
  const startIdx = items.indexOf(item);

  placeDragState = { item, startIdx, startY: e.clientY };
  item.style.opacity = '0.5';

  const onMove = (e) => {
    const y = e.clientY;
    const containerRect = container.getBoundingClientRect();
    const itemHeight = item.getBoundingClientRect().height + 8;
    const relY = y - containerRect.top;
    let newIdx = Math.max(0, Math.min(items.length - 1, Math.floor(relY / itemHeight)));

    if (newIdx !== startIdx) {
      const ref = newIdx > startIdx ? items[newIdx].nextSibling : items[newIdx];
      container.insertBefore(item, ref);
      items.splice(startIdx, 1);
      items.splice(newIdx, 0, item);
      placeDragState.startIdx = newIdx;
    }
  };

  const onUp = async () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    item.style.opacity = '';

    // Get new order
    const newItems = Array.from(container.children);
    const placeIds = newItems.map(el => el.dataset.placeId);

    try {
      const updated = await API.reorderPlaces(AppState.currentSchedule.id, placeIds);
      AppState.currentSchedule.places = updated;
      Timeline.render();
      EventManager.init();
    } catch (err) {
      showToast('並び替えに失敗しました', 'error');
    }
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Event Modal wiring ──
function setupEventModal() {
  document.getElementById('btn-save-event').addEventListener('click', () => EventManager.saveEvent());
  document.getElementById('btn-delete-event').addEventListener('click', () => EventManager.deleteEvent());

  // Type toggle
  document.getElementById('event-type-range').addEventListener('click', () => {
    document.getElementById('event-type-range').classList.add('active');
    document.getElementById('event-type-task').classList.remove('active');
    document.getElementById('event-end-row').style.display = '';
  });
  document.getElementById('event-type-task').addEventListener('click', () => {
    document.getElementById('event-type-task').classList.add('active');
    document.getElementById('event-type-range').classList.remove('active');
    document.getElementById('event-end-row').style.display = 'none';
  });

  // Color sync
  document.getElementById('event-color').addEventListener('input', (e) => {
    document.querySelectorAll('.preset-color').forEach(s => {
      s.classList.toggle('selected', s.style.backgroundColor === e.target.value);
    });
  });
}

// ── Context Menu ──
function setupContextMenu() {
  const menu = document.getElementById('context-menu');

  document.getElementById('timeline-container').addEventListener('contextmenu', (e) => {
    const block = e.target.closest('.event-block');
    if (!block) return;
    e.preventDefault();

    const eventId = block.dataset.eventId;
    menu.dataset.eventId = eventId;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('open');
  });

  document.addEventListener('click', () => {
    menu.classList.remove('open');
  });

  menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
    EventManager.openEventModal(menu.dataset.eventId);
  });

  menu.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
    EventManager.duplicateEvent(menu.dataset.eventId);
  });

  menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    const id = menu.dataset.eventId;
    if (!confirm('この予定を削除しますか？')) return;
    try {
      setSyncStatus('syncing');
      await API.deleteEvent(id);
      AppState.removeEventLocal(id);
      Timeline.renderEvents();
      setSyncStatus('synced');
      showToast('予定を削除しました', 'success');
    } catch (err) {
      showToast('削除に失敗しました', 'error');
      setSyncStatus('error');
    }
  });
}

// ── Modal helpers ──
function setupModalHandlers() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAllModals();
    });
    overlay.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => closeAllModals());
    });
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

// ── Keyboard shortcuts ──
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      // Undo (TODO: implement state snapshots)
    }
  });
}

// ── Utilities ──
function setSyncStatus(status) {
  const ind = document.getElementById('sync-indicator');
  ind.className = 'sync-indicator';
  if (status === 'syncing') {
    ind.classList.add('syncing');
    ind.title = '同期中...';
    ind.innerHTML = '<span class="material-icons-round">sync</span>';
  } else if (status === 'error') {
    ind.classList.add('error');
    ind.title = '同期エラー';
    ind.innerHTML = '<span class="material-icons-round">cloud_off</span>';
  } else {
    ind.title = '同期済み';
    ind.innerHTML = '<span class="material-icons-round">cloud_done</span>';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  toast.innerHTML = `<span class="material-icons-round">${icons[type] || 'info'}</span> ${escHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = '300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'Z');
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}
