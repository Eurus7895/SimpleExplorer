// Static sidebar layout — pinned/quick-access/drives. The actual paths are
// populated relative to the user's home in app.js's nav handlers.

// `key` resolves to a path at runtime via app.js → quickAccessPath / railTarget.
// Drives populate dynamically from fs.listDrives() — no static entries here.
export const SIDEBAR_FULL = [
  { section: 'Pinned', items: [
    { name: 'Projects',  icon: 'pin', key: 'home' },
    { name: 'Downloads', icon: 'pin', key: 'downloads' },
  ]},
  { section: 'Quick access', items: [
    { name: 'Home',      icon: 'home', key: 'home' },
    { name: 'Documents', icon: 'doc',  key: 'documents' },
    { name: 'Downloads', icon: 'down', key: 'downloads' },
    { name: 'Pictures',  icon: 'pic',  key: 'pictures' },
    { name: 'Desktop',   icon: 'desk', key: 'desktop' },
  ]},
];

export const RAIL_ITEMS = [
  { icon: 'home',  label: 'Home',      key: 'home' },
  { icon: 'star',  label: 'Pinned',    key: 'pinned' },
  { icon: 'clock', label: 'Recent',    key: 'recent' },
  { icon: 'down',  label: 'Downloads', key: 'downloads' },
  { icon: 'doc',   label: 'Docs',      key: 'documents' },
  { icon: 'drive', label: 'Drives',    key: 'drives' },
];
