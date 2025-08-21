const { ipcRenderer } = require('electron');

ipcRenderer.on('update-timer', (event, time) => {
  document.getElementById('timer').innerText = time;
});

window.addEventListener('DOMContentLoaded', () => {
    const stopButton = document.getElementById('stop-button');
    
    stopButton.addEventListener('click', () => {
        ipcRenderer.send('stop-recording');
    });

    stopButton.addEventListener('mouseenter', () => {
        ipcRenderer.send('make-window-clickable');
    });

    stopButton.addEventListener('mouseleave', () => {
        ipcRenderer.send('make-window-unclickable');
    });
});
