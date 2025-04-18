# Floating Windows Application

A desktop application that provides a floating window interface with a Streamlit-powered backend. The application features a draggable floating button that toggles a popup window containing a Streamlit application.

## Table of Contents

1. [Installation](#installation)
2. [User Manual](#user-manual)
3. [Technical Guide](#technical-guide)

## Installation

### Prerequisites

- Node.js (v14 or higher)
- Python 3.7 or higher
- npm (comes with Node.js)

### Step-by-Step Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

2. **Install Node.js dependencies**

   ```bash
   npm install
   ```

3. **Install Python dependencies**

   ```bash
   pip install streamlit openai python-dotenv
   ```

4. **Configure Environment Variables**
   Create a `.env` file in the root directory with your OpenAI API key:

   ```
   OPENAI_API_KEY=your_api_key_here
   ```

5. **Start the Application**
   ```bash
   npm start
   ```

## User Manual

### Basic Usage

1. **Launching the Application**

   - Run `npm start` to start the application
   - A floating circular button will appear on your screen

2. **Using the Floating Button**

   - The button can be dragged anywhere on your screen
   - Click the button to toggle the popup window
   - The popup window will appear to the left of the floating button

3. **Popup Window Features**

   - The popup window contains a Streamlit interface
   - You can resize the window as needed
   - The window can be minimized or closed

4. **Closing the Application**
   - Click the close button on the popup window
   - The floating button will remain until you quit the application
   - To completely exit, use your system's task manager or close the terminal

## Technical Guide

### Architecture Overview

The application is built using a combination of technologies:

1. **Electron (Frontend)**

   - Provides the desktop application framework
   - Handles window management and system integration
   - Manages the floating button and popup window

2. **Streamlit (Backend)**

   - Serves as the web interface within the popup window
   - Handles the main application logic
   - Provides a Python-based web interface

3. **Integration**
   - Electron and Streamlit communicate through localhost
   - The application runs a local Streamlit server on port 8501
   - IPC (Inter-Process Communication) handles window management

### Extending the Application

#### Adding New Features

1. **Frontend Extensions**

   - Modify `floating.html` to change the floating button appearance
   - Update `main.js` to add new window behaviors
   - Add new IPC events for custom functionality

2. **Backend Extensions**

   - Modify `polish_bot.py` to add new Streamlit features
   - Add new Python modules in the root directory
   - Update the Streamlit interface in the popup window

3. **API Integration**
   - The application uses OpenAI's API for processing
   - New API integrations can be added to `polish_bot.py`
   - Environment variables can be used for API keys

### Development Guidelines

1. **Testing**

   - Run `npm test` for all tests
   - Specific test categories:
     - UI tests: `npm run test:ui`
     - API tests: `npm run test:api`
     - Integration tests: `npm run test:integration`
     - Electron tests: `npm run test:electron`
     - Python tests: `npm run test:python`

2. **Code Structure**

   - `main.js`: Electron main process
   - `floating.html`: Floating button interface
   - `polish_bot.py`: Streamlit application
   - `rag_processor.py`: RAG processing logic

3. **Best Practices**
   - Keep the floating window lightweight
   - Use environment variables for sensitive data
   - Maintain proper error handling
   - Follow Electron security guidelines

### Troubleshooting

1. **Common Issues**

   - Port 8501 conflicts: The application will automatically kill existing processes
   - API key issues: Ensure the `.env` file is properly configured
   - Window positioning: The popup window is positioned relative to the floating button

2. **Debugging**
   - Check the console output for error messages
   - Monitor the Streamlit server logs
   - Use Electron's developer tools for frontend debugging

### Security Considerations

1. **API Keys**

   - Never commit API keys to version control
   - Use environment variables for sensitive data
   - Implement proper error handling for API failures

2. **Window Management**
   - The floating window is always on top
   - The popup window can be minimized
   - Both windows can be moved independently

### Performance Optimization

1. **Resource Usage**

   - The floating window is minimal in resource usage
   - The Streamlit server runs only when needed
   - Processes are cleaned up on application exit

2. **Memory Management**
   - The application automatically cleans up resources
   - Streamlit processes are terminated on exit
   - Window states are properly managed
