# ScreenTools - Screen Recorder

A simple screen recording application built with Electron and FFmpeg.

## Features

- **Full Screen Recording:** Record your entire screen with a single click.
- **Area Recording:** Select a specific area of your screen to record.
- **Recording Timer:** A timer is displayed during recording.
- **Preview Window:** After recording, a preview window is shown where you can watch the recorded video.
- **Save or Discard:** You can choose to save the recording to a file or discard it.
- **System Tray Menu:** The application runs in the system tray, providing easy access to all features.
- **Cross-Platform:** Works on Windows, macOS, and Linux.

## Prerequisites

- [Node.js](https://nodejs.org/)
- [FFmpeg](https://ffmpeg.org/download.html) must be installed and available in your system's PATH.

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/markallenarchviz/screentools.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd screentools
    ```
3.  Install the dependencies:
    ```bash
    npm install
    ```

## Usage

To run the application in development mode, use the following command:

```bash
npm start
```

The application icon will appear in the system tray. Right-click on it to see the recording options.

## Building the Application

To build the application for your current platform, run the following command:

```bash
npm run dist
```

The distributable file will be created in the `dist` directory.

## Technologies Used

- [Electron](https://www.electronjs.org/)
- [FFmpeg](https://ffmpeg.org/)
- [Node.js](https://nodejs.org/)
- [HTML](https://developer.mozilla.org/en-US/docs/Web/HTML)
- [CSS](https://developer.mozilla.org/en-US/docs/Web/CSS)
- [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
