// tests/teardown.js
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Cleanup function to run after all tests complete
 */
async function globalTeardown() {
  console.log('Starting global teardown...');

  // Kill any lingering Streamlit processes
  await killStreamlitProcesses();

  // Clean up temporary test files
  await cleanupTempFiles();

  // Remove any test audio or video files
  await cleanupMediaFiles();

  console.log('Global teardown complete');
}

/**
 * Kill any lingering Streamlit processes
 */
async function killStreamlitProcesses() {
  return new Promise((resolve) => {
    if (os.platform() === 'win32') {
      // Windows command
      exec('taskkill /F /IM streamlit.exe', (error) => {
        if (error) {
          console.log('No Streamlit processes found to kill or error:', error.message);
        } else {
          console.log('Killed lingering Streamlit processes');
        }
        resolve();
      });
    } else {
      // Unix/Mac command
      exec("pkill -f 'streamlit run'", (error) => {
        if (error) {
          console.log('No Streamlit processes found to kill or error:', error.message);
        } else {
          console.log('Killed lingering Streamlit processes');
        }
        resolve();
      });
    }
  });
}

/**
 * Clean up temporary Python test files
 */
async function cleanupTempFiles() {
  const tempFilePatterns = [
    'temp_*.py',
    'temp_*_test.py'
  ];

  for (const pattern of tempFilePatterns) {
    await new Promise((resolve) => {
      if (os.platform() === 'win32') {
        // Windows command
        exec(`del ${pattern}`, { cwd: __dirname }, (error) => {
          if (error) {
            console.log(`No ${pattern} files found to delete or error:`, error.message);
          } else {
            console.log(`Deleted temporary ${pattern} files`);
          }
          resolve();
        });
      } else {
        // Unix/Mac command
        exec(`find ${__dirname} -name "${pattern}" -delete`, (error) => {
          if (error) {
            console.log(`No ${pattern} files found to delete or error:`, error.message);
          } else {
            console.log(`Deleted temporary ${pattern} files`);
          }
          resolve();
        });
      }
    });
  }
}

/**
 * Clean up test media files
 */
async function cleanupMediaFiles() {
  // Clean temp directory
  const tempDir = os.tmpdir();
  const filePatterns = [
    'chunk_*.mp3',
    'test_video_*.mp4',
    'test_audio_*.mp3'
  ];

  for (const pattern of filePatterns) {
    await new Promise((resolve) => {
      if (os.platform() === 'win32') {
        // Windows command
        exec(`del ${path.join(tempDir, pattern)}`, (error) => {
          if (error) {
            console.log(`No ${pattern} files found in temp directory or error:`, error.message);
          } else {
            console.log(`Deleted ${pattern} files from temp directory`);
          }
          resolve();
        });
      } else {
        // Unix/Mac command
        exec(`find ${tempDir} -name "${pattern}" -delete`, (error) => {
          if (error) {
            console.log(`No ${pattern} files found in temp directory or error:`, error.message);
          } else {
            console.log(`Deleted ${pattern} files from temp directory`);
          }
          resolve();
        });
      }
    });
  }

  // Also clean test fixtures that might have been created
  const fixturesDir = path.join(__dirname, 'fixtures');
  if (fs.existsSync(fixturesDir)) {
    try {
      const tempAudioFiles = fs.readdirSync(fixturesDir)
        .filter(file => file.startsWith('temp_') && (file.endsWith('.mp3') || file.endsWith('.mp4')));
      
      for (const file of tempAudioFiles) {
        fs.unlinkSync(path.join(fixturesDir, file));
        console.log(`Deleted temporary test file: ${file}`);
      }
    } catch (error) {
      console.log('Error cleaning fixtures directory:', error.message);
    }
  }
}

// Make sure the teardown function is exported for Jest to use
module.exports = globalTeardown;