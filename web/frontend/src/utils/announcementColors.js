// Announcement category → colour, mirrored from the mobile app's
// bulletin_board_page.dart (categoryColor) so the same announcement reads the
// same on a hallway screen, on a phone and on the public landing page. Any
// category outside this set falls back to slate.
export const ANNOUNCEMENT_CATEGORY_COLORS = {
  'Events': '#F59E0B',          // amber
  'System Updates': '#1E5BFF',  // brand blue
  'Achievements': '#10B981',    // emerald
  'Reminders': '#EF4444',       // coral
}

export const OTHER_CATEGORY_COLOR = '#64748B' // slate

export const announcementColor = (category) =>
  ANNOUNCEMENT_CATEGORY_COLORS[category] || OTHER_CATEGORY_COLOR
