const { ipcRenderer } = require('electron');

let startX, startY;
let selectionBox = document.createElement('div');
selectionBox.className = 'selection-box';
document.body.appendChild(selectionBox);

ipcRenderer.on('screenshot-data', (event, dataUrl) => {
    document.body.style.backgroundImage = `url(${dataUrl})`;
});

document.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;

    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.close(); // Close the selection window on Escape key press
    }
});

function onMouseMove(e) {
    const width = e.clientX - startX;
    const height = e.clientY - startY;

    selectionBox.style.width = `${Math.abs(width)}px`;
    selectionBox.style.height = `${Math.abs(height)}px`;
    selectionBox.style.left = `${width > 0 ? startX : e.clientX}px`;
    selectionBox.style.top = `${height > 0 ? startY : e.clientY}px`;
}

function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // Adiciona uma classe para indicar que a seleção foi feita
    document.body.classList.add('selection-done');

    const x = parseInt(selectionBox.style.left, 10);
    const y = parseInt(selectionBox.style.top, 10);
    const width = parseInt(selectionBox.style.width, 10);
    const height = parseInt(selectionBox.style.height, 10);

    if (width > 0 && height > 0) {
        ipcRenderer.send('selection-done', { x, y, width, height });
    } else {
        // If the selection is too small or invalid, close the window without recording.
        window.close();
    }
}
