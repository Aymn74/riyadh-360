// util.js — small shared helpers.
// Text from OpenStreetMap or the visitor goes into markup only through esc(), so names are always shown as text.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
