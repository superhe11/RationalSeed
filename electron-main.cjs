const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    title: 'Рациональное зерно',
    autoHideMenuBar: true,
    backgroundColor: '#071019',
    icon: path.join(__dirname, 'public', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL('app://localhost/');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    let reqPath = decodeURIComponent(new URL(request.url).pathname);
    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }
    const filePath = path.join(__dirname, 'dist-mobile', reqPath);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});