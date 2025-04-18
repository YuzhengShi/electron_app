const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');

let floatingWindow;
let popupWindow;
let streamlitProcess;
let isDragging = false;

function createFloatingWindow() {
  floatingWindow = new BrowserWindow({
    width: 50,  
    height: 50, 
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    skipTaskbar: true,
    hasShadow: false
  });

  floatingWindow.loadFile('floating.html');

  let startWindowPosition = { x: 0, y: 0 };
  let startMousePosition = { x: 0, y: 0 };
  
  ipcMain.on('mousedown', (event, mousePos) => {
    startWindowPosition = {
      x: floatingWindow.getPosition()[0],
      y: floatingWindow.getPosition()[1]
    };
    
    startMousePosition = {
      x: mousePos.x,
      y: mousePos.y
    };
    
    isDragging = true;
  });

  ipcMain.on('mousemove', (event, mousePos) => {
    if (!isDragging) return;
    
    const deltaX = mousePos.x - startMousePosition.x;
    const deltaY = mousePos.y - startMousePosition.y;
    
    floatingWindow.setPosition(
      startWindowPosition.x + deltaX,
      startWindowPosition.y + deltaY
    );
  });

  ipcMain.on('mouseup', () => {
    isDragging = false;
  });
}

function createPopupWindow() {
  popupWindow = new BrowserWindow({
    width: 350,
    height: 600,
    show: false,
    frame: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  popupWindow.loadURL('http://localhost:8501');
  
  popupWindow.on('closed', () => {
    popupWindow = null;
  });
}

function killProcessOnPort(port) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32'
      ? `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`
      : `lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs -r kill -9`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`No process found on port ${port} or error killing it.`);
      } else {
        console.log(`Killed process on port ${port}`);
      }
      resolve();
    });
  });
}

async function startStreamlitServer() {

  await killProcessOnPort(8501);

  const pythonPath = 'python'; 
  const streamlitScriptPath = path.join(__dirname, 'polish_bot.py'); 

  streamlitProcess = spawn(pythonPath, [
    '-m', 
    'streamlit', 
    'run', 
    streamlitScriptPath, 
    '--server.headless=true', 
    '--server.port=8501'
  ], {
    shell: true,
  });

  streamlitProcess.stdout.on('data', (data) => {
    console.log(`Streamlit stdout: ${data}`);
  });

  streamlitProcess.stderr.on('data', (data) => {
    console.error(`Streamlit stderr: ${data}`);
  });

  streamlitProcess.on('close', (code) => {
    console.log(`Streamlit process exited with code ${code}`);
  });
}

app.whenReady().then(async () => {
  await startStreamlitServer();

  createFloatingWindow();

  ipcMain.on('toggle-popup', () => {
    if (popupWindow) {
      if (popupWindow.isVisible()) {
        popupWindow.hide();
      } else {
        popupWindow.show();
        const floatingPos = floatingWindow.getBounds();
        const popupX = floatingPos.x - 360;
        const popupY = floatingPos.y - 275;
        popupWindow.setPosition(popupX, popupY);
      }
    } else {
      createPopupWindow();
      popupWindow.show();
      const floatingPos = floatingWindow.getBounds();
      const popupX = floatingPos.x - 360; 
      const popupY = floatingPos.y - 275; 
      popupWindow.setPosition(popupX, popupY);
    }
  });
}
);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Clean up the Streamlit process when the Electron app exits
app.on('will-quit', () => {
  if (streamlitProcess) {
    streamlitProcess.kill();
  }
});