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

// Rail items for Direction B. Each one either:
//  - Navigates directly (single-target, like Home) when `target` resolves;
//  - Or opens a 200 px detail panel listing `entries` (Recent / Drives /
//    Docs / Downloads). The panel content for Recent and Drives is built
//    dynamically (recents from localStorage, drives from fs.listDrives).
// Pinned dropped per the design iteration in chat.
export const RAIL_ITEMS = [
  { id: 'home',      icon: 'home',  label: 'Home',      target: 'home' },
  { id: 'recent',    icon: 'clock', label: 'Recent',    panel: 'recent' },
  { id: 'downloads', icon: 'down',  label: 'Downloads', panel: 'downloads' },
  { id: 'docs',      icon: 'doc',   label: 'Docs',      panel: 'docs' },
  { id: 'drives',    icon: 'drive', label: 'Drives',    panel: 'drives' },
];
