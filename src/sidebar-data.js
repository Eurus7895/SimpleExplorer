// Static sidebar layout — pinned/quick-access/drives. The actual paths are
// populated relative to the user's home in app.js's nav handlers.

export const SIDEBAR_FULL = [
  { section: 'Pinned', items: [
    { name: 'Projects',  icon: 'pin' },
    { name: 'Downloads', icon: 'pin' },
  ]},
  { section: 'Quick access', items: [
    { name: 'Home',      icon: 'home', path: null },
    { name: 'Documents', icon: 'doc',  path: null },
    { name: 'Downloads', icon: 'down', path: null },
    { name: 'Pictures',  icon: 'pic',  path: null },
    { name: 'Desktop',   icon: 'desk', path: null },
  ]},
  { section: 'Drives', items: [
    { name: 'System (C:)', icon: 'drive', path: 'C:\\', meta: '146 GB free' },
    { name: 'Data (D:)',   icon: 'drive', path: 'D:\\', meta: '892 GB free' },
  ]},
];

export const RAIL_ITEMS = [
  { icon: 'home',  label: 'Home' },
  { icon: 'star',  label: 'Pinned' },
  { icon: 'clock', label: 'Recent' },
  { icon: 'down',  label: 'Downloads' },
  { icon: 'doc',   label: 'Docs' },
  { icon: 'drive', label: 'Drives' },
];
