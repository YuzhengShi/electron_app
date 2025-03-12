document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        // Send the selected text to the main process
        window.electronAPI.sendSelectedText(selectedText);
    }
});