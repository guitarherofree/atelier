// The menu bar.
import { Menu, app, shell } from 'electron';

export const SECTIONS = [
  ['discover', 'Discover', '1'],
  ['opportunities', 'Opportunities', '2'],
  ['applications', 'Applications', '3'],
  ['calendar', 'Calendar', '4'],
  ['map', 'Map', '5'],
  ['portfolio', 'Portfolio', '6'],
  ['writing', 'Proposals & Text', '7'],
  ['profile', 'Artist Profile', '8'],
  ['sources', 'Sources', '9'],
];

export function buildAppMenu({ send, actions }) {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => actions.checkForUpdates() },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('navigate', 'settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Add Opportunity from URL…', accelerator: 'CmdOrCtrl+N', click: () => send('addUrl') },
        { label: 'Add Opportunity by Hand…', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('addManual') },
        { label: 'Find New Opportunities', accelerator: 'CmdOrCtrl+R', click: () => actions.discover() },
        { label: 'Search the Web…', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('search') },
        { type: 'separator' },
        { label: 'New Proposal (Guided)…', click: () => send('newProposal') },
        { type: 'separator' },
        { label: 'Back Up Now', click: () => actions.backupNow() },
        { label: 'Back Up Everything To…', click: () => actions.backupTo() },
        { label: 'Restore from Backup…', click: () => actions.restore() },
        { label: 'Export Data…', click: () => actions.exportData() },
        { label: 'Show Data Folder', click: () => actions.showData() },
        ...(mac ? [] : [{ type: 'separator' }, { label: 'Settings', click: () => send('navigate', 'settings') }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...SECTIONS.map(([key, label, k]) => ({ label, accelerator: `CmdOrCtrl+${k}`, click: () => send('navigate', key) })),
        { type: 'separator' },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => send('back') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { role: 'reload' }]),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        { type: 'separator' },
        { label: 'Atelier Browser', accelerator: 'CmdOrCtrl+Shift+B', click: () => actions.openBrowser() },
        ...(mac ? [{ type: 'separator' }, { role: 'front' }] : []),
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Atelier on GitHub', click: () => shell.openExternal('https://github.com/guitarherofree/atelier#readme') },
        { label: 'Show Activity Log', click: () => actions.showLog() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
