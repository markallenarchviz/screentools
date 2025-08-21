const { ipcRenderer } = require('electron');

const video = document.querySelector('video');
const saveButton = document.getElementById('save-button');
const timelineSlider = document.getElementById('timeline-slider');
const playPauseButton = document.getElementById('play-pause-button');
const timeDisplay = document.getElementById('time-display');
const closeButton = document.getElementById('close-button');

const timelineTrack = document.querySelector('.timeline-track');
const timelineSelection = document.querySelector('.timeline-selection');
const leftHandle = document.querySelector('.left-handle');
const rightHandle = document.querySelector('.right-handle');

let videoDuration = 0;
let isDraggingLeft = false;
let isDraggingRight = false;
let startSelectionTime = 0;
let endSelectionTime = 0;

ipcRenderer.on('video-path', (event, path) => {
    video.src = path;
    video.addEventListener('loadedmetadata', () => {
        videoDuration = video.duration;
        startSelectionTime = 0;
        endSelectionTime = videoDuration;
        updateSliderUI();
        updateTimeDisplay();
    });
});

function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimeDisplay() {
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(videoDuration)}`;
}

function updateSliderUI() {
    const sliderWidth = timelineSlider.offsetWidth;
    const leftPercent = (startSelectionTime / videoDuration) * 100;
    const rightPercent = (endSelectionTime / videoDuration) * 100;

    timelineSelection.style.left = `${leftPercent}%`;
    timelineSelection.style.width = `${rightPercent - leftPercent}%`;

    leftHandle.style.left = `${leftPercent}%`;
    rightHandle.style.left = `${rightPercent}%`;
}

// Handle dragging for left handle
leftHandle.addEventListener('mousedown', (e) => {
    isDraggingLeft = true;
    e.preventDefault();
});

// Handle dragging for right handle
rightHandle.addEventListener('mousedown', (e) => {
    isDraggingRight = true;
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingLeft || isDraggingRight) {
        const sliderRect = timelineSlider.getBoundingClientRect();
        const mouseX = e.clientX - sliderRect.left;
        let newTime = (mouseX / sliderRect.width) * videoDuration;

        // Clamp newTime within valid range
        newTime = Math.max(0, Math.min(videoDuration, newTime));

        if (isDraggingLeft) {
            startSelectionTime = Math.min(newTime, endSelectionTime - 0.1); // Minimum 0.1s selection
            video.currentTime = startSelectionTime;
        } else if (isDraggingRight) {
            endSelectionTime = Math.max(newTime, startSelectionTime + 0.1); // Minimum 0.1s selection
            video.currentTime = newTime; // Update video current time in real-time
        }
        updateSliderUI();
        updateTimeDisplay();
    }
});

document.addEventListener('mouseup', () => {
    isDraggingLeft = false;
    isDraggingRight = false;
});

closeButton.addEventListener('click', () => {
    ipcRenderer.send('close-preview-window');
});

playPauseButton.addEventListener('click', () => {
    if (video.paused) {
        video.play();
        playPauseButton.textContent = '❚❚';
    } else {
        video.pause();
        playPauseButton.textContent = '▶';
    }
});

video.addEventListener('timeupdate', () => {
    updateTimeDisplay();
    // Keep video playback within selected range
    if (video.currentTime < startSelectionTime || video.currentTime > endSelectionTime) {
        video.currentTime = startSelectionTime;
    }
});

saveButton.addEventListener('click', () => {
    ipcRenderer.send('show-save-dialog', {
        startTime: startSelectionTime,
        endTime: endSelectionTime
    });
});
