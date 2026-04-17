/* ═══════════════════════════════════════════════════
   Application State Management
   ═══════════════════════════════════════════════════ */

const AppState = {
  currentSchedule: null,
  undoStack: [],
  redoStack: [],
  maxUndoSize: 50,
  autoSaveTimer: null,
  dirty: false,

  setSchedule(schedule) {
    this.currentSchedule = schedule;
    this.dirty = false;
  },

  getPlacesOrdered() {
    if (!this.currentSchedule) return [];
    return [...this.currentSchedule.places].sort((a, b) => a.sort_order - b.sort_order);
  },

  getEvents() {
    if (!this.currentSchedule) return [];
    return this.currentSchedule.events || [];
  },

  findEvent(id) {
    return this.getEvents().find(e => e.id === id);
  },

  findPlace(id) {
    if (!this.currentSchedule) return null;
    return this.currentSchedule.places.find(p => p.id === id);
  },

  // Update local state after server confirmation
  updateEventLocal(updated) {
    if (!this.currentSchedule) return;
    const idx = this.currentSchedule.events.findIndex(e => e.id === updated.id);
    if (idx >= 0) {
      this.currentSchedule.events[idx] = updated;
    }
  },

  addEventLocal(event) {
    if (!this.currentSchedule) return;
    this.currentSchedule.events.push(event);
  },

  removeEventLocal(id) {
    if (!this.currentSchedule) return;
    this.currentSchedule.events = this.currentSchedule.events.filter(e => e.id !== id);
  },

  updatePlaceLocal(updated) {
    if (!this.currentSchedule) return;
    const idx = this.currentSchedule.places.findIndex(p => p.id === updated.id);
    if (idx >= 0) {
      this.currentSchedule.places[idx] = updated;
    }
  },

  addPlaceLocal(place) {
    if (!this.currentSchedule) return;
    this.currentSchedule.places.push(place);
  },

  removePlaceLocal(id) {
    if (!this.currentSchedule) return;
    this.currentSchedule.places = this.currentSchedule.places.filter(p => p.id !== id);
    // Also clean up events
    for (const evt of this.currentSchedule.events) {
      evt.place_ids = evt.place_ids.filter(pid => pid !== id);
    }
  },

  // Undo/redo
  pushUndo(snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndoSize) this.undoStack.shift();
    this.redoStack = [];
  },

  // Time helpers
  getStartMinutes() {
    const s = this.currentSchedule;
    return s ? s.start_hour * 60 + s.start_minute : 360;
  },

  getEndMinutes() {
    const s = this.currentSchedule;
    return s ? s.end_hour * 60 + s.end_minute : 1320;
  },

  getTotalSlots() {
    return (this.getEndMinutes() - this.getStartMinutes()) / 5;
  },

  minutesToSlot(minutes) {
    return Math.round((minutes - this.getStartMinutes()) / 5);
  },

  slotToMinutes(slot) {
    return this.getStartMinutes() + slot * 5;
  },

  formatTime(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  minutesToTimeStr(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return this.formatTime(h, m);
  }
};
