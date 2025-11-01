// Background (service worker) - MV3 (module)

const MSG = {
  TOGGLE: 'SAFE_MASK_TOGGLE',
  ANON_SELECTION: 'SAFE_MASK_ANON_SELECTION',
  DEANON_SELECTION: 'SAFE_MASK_DEANON_SELECTION',
  OPEN_SETTINGS: 'SAFE_MASK_OPEN_SETTINGS'
};

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'safemask.root', title: 'SafeMask', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'safemask.anon', title: 'Anonymize selection', parentId: 'safemask.root', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'safemask.deanon', title: 'De-anonymize selection', parentId: 'safemask.root', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'safemask.open', title: 'Open SafeMask', contexts: ['all'] });
    });
  } catch (_) {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'safemask.anon') {
    chrome.tabs.sendMessage(tab.id, { type: MSG.ANON_SELECTION });
  } else if (info.menuItemId === 'safemask.deanon') {
    chrome.tabs.sendMessage(tab.id, { type: MSG.DEANON_SELECTION });
  } else if (info.menuItemId === 'safemask.open') {
    chrome.tabs.sendMessage(tab.id, { type: MSG.TOGGLE });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  switch (command) {
    case 'toggle_overlay':
      chrome.tabs.sendMessage(tab.id, { type: MSG.TOGGLE });
      break;
    case 'anonymize_selection':
      chrome.tabs.sendMessage(tab.id, { type: MSG.ANON_SELECTION });
      break;
    case 'deanonymize_selection':
      chrome.tabs.sendMessage(tab.id, { type: MSG.DEANON_SELECTION });
      break;
    case 'open_settings':
      chrome.tabs.sendMessage(tab.id, { type: MSG.OPEN_SETTINGS });
      break;
  }
});


