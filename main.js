const { app, BrowserWindow, ipcMain, screen, clipboard } = require('electron');
const { exec } = require('child_process');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env file

let floatingWindow;
let popupWindow;
let streamlitProcess;
let isDragging = false;

function createFloatingWindow() {
  // Make the window exactly match the round button size
  floatingWindow = new BrowserWindow({
    width: 50,  
    height: 50, 
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    skipTaskbar: true,
    hasShadow: false
  });

  floatingWindow.loadFile('floating.html');

  // A completely different approach for dragging
  let startWindowPosition = { x: 0, y: 0 };
  let startMousePosition = { x: 0, y: 0 };
  
  ipcMain.on('mousedown', (event, mousePos) => {
    // Store both the window position and mouse position at drag start
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
    
    // Calculate the exact delta from the starting positions
    const deltaX = mousePos.x - startMousePosition.x;
    const deltaY = mousePos.y - startMousePosition.y;
    
    // Set position based on the original window position plus total delta
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
    width: 800,  // Increased width for better visibility
    height: 600,
    show: false,
    frame: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  // Add debugging for window loading
  console.log("Creating popup window, loading URL: http://localhost:8501");
  
  popupWindow.loadURL('http://localhost:8501');
  
  // Add event listeners for debugging
  popupWindow.webContents.on('did-start-loading', () => {
    console.log('Popup window: Started loading content');
  });
  
  popupWindow.webContents.on('did-finish-load', () => {
    console.log('Popup window: Finished loading content');
  });
  
  popupWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Popup window: Failed to load:', errorCode, errorDescription);
  });

  // Show DevTools to help with debugging
  popupWindow.webContents.openDevTools();
  
  // Ensure the window is visible
  popupWindow.once('ready-to-show', () => {
    console.log('Popup window is ready to show');
  });
  
  popupWindow.on('closed', () => {
    console.log('Popup window was closed');
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

// Modified startStreamlitServer to use exec instead of spawn
async function startStreamlitServer() {
  await killProcessOnPort(8501);

  // Get the current directory
  const currentDir = __dirname;
  console.log("Current directory:", currentDir);
  
  // Use the system Python instead
  const pythonPath = 'python'; // or 'python3' if needed
  const streamlitScriptPath = path.join(currentDir, 'polish_bot.py');
  
  console.log("Starting Streamlit with script path:", streamlitScriptPath);
  
  // Construct the full command with proper quoting
  const command = process.platform === 'win32'
    ? `${pythonPath} -m streamlit run "${streamlitScriptPath}" --server.headless=true --server.port=8501`
    : `${pythonPath} -m streamlit run "${streamlitScriptPath}" --server.headless=true --server.port=8501`;
  
  console.log("Running command:", command);
  
  // Use exec instead of spawn
  streamlitProcess = exec(command, {
    cwd: currentDir,
    env: process.env
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

  // Wait for Streamlit to start
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Waited for Streamlit server, continuing');
      resolve();
    }, 5000);
  });
}

// Add clipboard functionality
ipcMain.handle('read-clipboard', async () => {
  return clipboard.readText();
});

// Make sure app.whenReady() uses await with the async startStreamlitServer
app.whenReady().then(async () => {
  try {
    // Start the Streamlit server
    await startStreamlitServer();

    // Create the floating window
    createFloatingWindow();

    ipcMain.on('toggle-popup', () => {
      console.log("toggle-popup event received");
      
      if (popupWindow) {
        if (popupWindow.isVisible()) {
          console.log("Hiding existing popup window");
          popupWindow.hide();
        } else {
          console.log("Showing existing popup window");
          popupWindow.show();
          const floatingPos = floatingWindow.getBounds();
          // Position popup to the left of floating window
          const popupX = floatingPos.x - 360; 
          const popupY = floatingPos.y - 275;
          console.log(`Positioning window at: ${popupX}, ${popupY}`);
          popupWindow.setPosition(popupX, popupY);
        }
      } else {
        console.log("Creating new popup window");
        createPopupWindow();
        popupWindow.show();
        const floatingPos = floatingWindow.getBounds();
        // Position popup to the left of floating window
        const popupX = floatingPos.x - 360;
        const popupY = floatingPos.y - 275;
        console.log(`Positioning window at: ${popupX}, ${popupY}`);
        popupWindow.setPosition(popupX, popupY);
      }
    });

    // Handle clipboard button clicked
    ipcMain.on('clipboard-button-clicked', () => {
      if (popupWindow) {
        popupWindow.show();
        popupWindow.webContents.send('paste-from-clipboard');
      } else {
        createPopupWindow();
        popupWindow.show();
        // Wait for the window to load before sending the message
        popupWindow.webContents.on('did-finish-load', () => {
          popupWindow.webContents.send('paste-from-clipboard');
        });
      }
    });
  } catch (error) {
    console.error("Error starting application:", error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Clean up the Streamlit process when the Electron app exits
app.on('will-quit', () => {
  if (streamlitProcess) {
    streamlitProcess.kill();
  }
});