const { app, Menu, Tray, screen, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const fs = require('fs');

// Variáveis globais
let tray = null;
let ffmpegProcess = null;
let isRecording = false;
let counterWindow = null;
let counterInterval = null;
let seconds = 0;
const COUNTER_WINDOW_HEIGHT = 30;
let indicatorWindow = null;
let previewWindow = null;
let lastVideoPath = null;

/**
 * Cria a janela do contador de tempo.
 */
const createCounterWindow = () => {
    counterWindow = new BrowserWindow({
        width: 120,
        height: COUNTER_WINDOW_HEIGHT,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        webPreferences: {
            preload: path.join(__dirname, 'counter.js'),
        },
    });

    counterWindow.setIgnoreMouseEvents(true, { forward: true });
    counterWindow.loadFile('counter.html');
    counterWindow.setContentProtection(true); // Impede a captura da janela (Win/macOS)

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    counterWindow.setPosition(Math.round((width / 2) - 60), 0);

    counterWindow.on('close', (e) => {
        e.preventDefault();
        counterWindow.hide();
    });

    counterWindow.hide(); // A janela começa escondida
};


/**
 * Inicia a gravação (tela cheia ou área selecionada).
 * @param {object|null} area - Objeto com {x, y, width, height} ou null para tela cheia.
 */
const startRecording = (area = null) => {
    if (isRecording) return;
    isRecording = true;
    updateTrayMenu();

    // Inicia e exibe o contador
    seconds = 0;
    counterWindow.webContents.send('update-timer', '00:00');
    counterWindow.show();
    counterInterval = setInterval(() => {
        seconds++;
        const formattedTime = new Date(seconds * 1000).toISOString().substr(14, 5);
        counterWindow.webContents.send('update-timer', formattedTime);
    }, 1000);

    const tempPath = app.getPath("temp"); // Use temporary directory
    const outputPath = path.join(tempPath, `gravacao-${Date.now()}.mp4`);
    const commonOptions = `-c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputPath}"`;
    let command;

    // Garante que a área seja um objeto com as propriedades corretas
    const captureArea = area && typeof area === 'object' && 'x' in area && 'y' in area && 'width' in area && 'height' in area ? area : null;

    if (captureArea) {
        // Garante que a largura e a altura sejam números pares para o codec libx264
        if (captureArea.width % 2 !== 0) {
            captureArea.width--;
        }
        if (captureArea.height % 2 !== 0) {
            captureArea.height--;
        }
    }

    switch (process.platform) {
        case 'win32': // Windows
            if (captureArea) {
                command = `ffmpeg -f gdigrab -framerate 30 -offset_x ${captureArea.x} -offset_y ${captureArea.y} -video_size ${captureArea.width}x${captureArea.height} -i desktop ${commonOptions}`;
            } else {
                command = `ffmpeg -f gdigrab -framerate 30 -i desktop ${commonOptions}`;
            }
            break;
        case 'darwin': // macOS
            if (captureArea) {
                // O formato para -i é "screen_index:capture_device_index" e -vf para cortar
                command = `ffmpeg -f avfoundation -i "1:0" -r 30 -vf "crop=${captureArea.width}:${captureArea.height}:${captureArea.x}:${captureArea.y}" ${commonOptions}`;
            } else {
                command = `ffmpeg -f avfoundation -i "1:0" -r 30 ${commonOptions}`;
            }
            break;
        case 'linux': // Linux
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.workAreaSize;
            if (captureArea) {
                command = `ffmpeg -f x11grab -r 30 -s ${captureArea.width}x${captureArea.height} -i :0.0+${captureArea.x},${captureArea.y} ${commonOptions}`;
            } else {
                command = `ffmpeg -f x11grab -r 30 -s ${width}x${height} -i :0.0 ${commonOptions}`;
            }
            break;
        default:
            console.error("Plataforma não suportada.");
            isRecording = false;
            updateTrayMenu();
            return;
    }

    console.log("Iniciando gravação...", `Comando: ${command}`);
    ffmpegProcess = exec(command, (error) => {
        if (error && !error.killed) {
            console.error(`Erro ao executar ffmpeg: ${error.message}`);
        }
    });

    ffmpegProcess.on('exit', (code) => {
        console.log(`Processo ffmpeg encerrado com código ${code}`);
        if (code !== 0 && code !== 255) {
            console.error("A gravação falhou.");
            isRecording = false;
            ffmpegProcess = null;
            updateTrayMenu();
            clearInterval(counterInterval);
            counterWindow.hide();
        } else {
            console.log(`Gravação temporária salva em: ${outputPath}`);
            lastVideoPath = outputPath;
            createPreviewWindow(outputPath);
            isRecording = false;
            ffmpegProcess = null;
            updateTrayMenu();
            clearInterval(counterInterval);
            counterWindow.hide();
        }
    });
};

/**
 * Para a gravação da tela.
 */
const stopRecording = () => {
    if (!isRecording || !ffmpegProcess) return;
    console.log("Parando a gravação...");
    ffmpegProcess.stdin.write('q');
    if (indicatorWindow) {
        indicatorWindow.close();
        indicatorWindow = null;
    }
};

const getRecordingOptions = async () => {
    return screen.getAllDisplays();
};

/**
 * Cria uma janela para seleção de área.
 */
const createSelectionWindow = () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const selectionWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    selectionWindow.loadFile('selection.html'); // Novo arquivo HTML

    ipcMain.once('selection-done', (event, area) => {
        selectionWindow.close();
        createIndicatorWindow(area);
        startRecording(area);
    });

    selectionWindow.on('close', () => {
        ipcMain.removeListener('selection-done', startRecording);
    });
};

/**
 * Cria uma janela para indicar a área de gravação.
 * @param {object} area - Objeto com {x, y, width, height}.
 */
const createIndicatorWindow = (area) => {
    indicatorWindow = new BrowserWindow({
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
    });

    indicatorWindow.setIgnoreMouseEvents(true);
    indicatorWindow.loadFile('indicator.html');
    indicatorWindow.setContentProtection(true); // Impede a captura da janela (Win/macOS)
};

/**
 * Cria a janela de pré-visualização do vídeo.
 * @param {string} videoPath - Caminho do vídeo gravado.
 */
const createPreviewWindow = (videoPath) => {
    // Usa ffprobe para obter as dimensões do vídeo
    const ffprobeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`;

    exec(ffprobeCommand, (error, stdout) => {
        if (error) {
            console.error('Erro ao obter dimensões do vídeo:', error);
            // Fallback para tamanho padrão
            createPreviewWindowSized(videoPath, 800, 600);
            return;
        }

        const [width, height] = stdout.trim().split('x').map(Number);
        createPreviewWindowSized(videoPath, width, height);
    });
};

const createPreviewWindowSized = (videoPath, videoWidth, videoHeight) => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenWorkAreaWidth = primaryDisplay.workAreaSize.width;
    const screenWorkAreaHeight = primaryDisplay.workAreaSize.height;

    // Calculate 80% of video's native resolution
    let finalWidth = Math.round(videoWidth * 0.8);
    let finalHeight = Math.round(videoHeight * 0.8);

    // Ensure the window doesn't exceed screen work area dimensions
    if (finalWidth > screenWorkAreaWidth) {
        finalWidth = screenWorkAreaWidth;
        finalHeight = Math.round(screenWorkAreaWidth * (videoHeight / videoWidth));
    }
    if (finalHeight > screenWorkAreaHeight) {
        finalHeight = screenWorkAreaHeight;
        finalWidth = Math.round(screenWorkAreaHeight * (videoWidth / videoHeight));
    }

    previewWindow = new BrowserWindow({
        width: finalWidth,
        height: finalHeight,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    previewWindow.loadFile('preview.html');
    previewWindow.webContents.on('did-finish-load', () => {
        previewWindow.webContents.send('video-path', videoPath);
    });

    previewWindow.on('closed', () => {
        previewWindow = null;
        // Opcional: deletar o arquivo temporário se não for salvo
        if (lastVideoPath) {
            // fs.unlinkSync(lastVideoPath);
            lastVideoPath = null;
        }
    });
};

/**
 * Constrói e atualiza o menu da bandeja.
 */
const updateTrayMenu = async () => {
    const recordingOptions = await getRecordingOptions();

    const template = isRecording
        ? [
            { label: "Stop Recording", click: stopRecording },
            { type: "separator" },
            { label: "Exit", click: () => app.quit() },
          ]
        : [
            {
                label: "Record Full Screen",
                click: () => startRecording(),
            },
            {
                label: "Record Area",
                click: createSelectionWindow,
            },
            { type: "separator" },
            ...recordingOptions.map((display, index) => ({
                label: `Record Screen ${index + 1} (${display.size.width}x${display.size.height})`,
                click: () => startRecording(), // Ainda não implementado para telas específicas
            })),
            { type: "separator" },
            { label: "Exit", click: () => app.quit() },
          ];

    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
    tray.removeAllListeners('click');
    tray.on("click", () => tray.popUpContextMenu());
};

// Ciclo de vida da aplicação
ipcMain.on('stop-recording', stopRecording);

// Make the counter window clickable
ipcMain.on('make-window-clickable', () => {
    counterWindow.setIgnoreMouseEvents(false);
});

// Make the counter window unclickable
ipcMain.on('make-window-unclickable', () => {
    counterWindow.setIgnoreMouseEvents(true, { forward: true });
});

// Mostra o diálogo para salvar o arquivo
ipcMain.on('show-save-dialog', async (event, { startTime, endTime }) => {
    if (!lastVideoPath) return;

    // Fecha a janela de preview antes de abrir o diálogo de salvar
    if (previewWindow) {
        previewWindow.close();
    }

    const { filePath } = await dialog.showSaveDialog({
        defaultPath: `recording-${Date.now()}.mp4`,
        filters: [{ name: 'Videos', extensions: ['mp4'] }],
    });

    if (filePath) {
        const duration = endTime - startTime;
        // Re-encode video and audio to ensure compatibility after trimming
        const trimCommand = `ffmpeg -i "${lastVideoPath}" -ss ${startTime} -t ${duration} -c:v libx264 -preset ultrafast -crf 23 -c:a aac "${filePath}"`;

        exec(trimCommand, (error) => {
            if (error) {
                console.error('Erro ao cortar o vídeo:', error);
            } else {
                console.log(`Vídeo cortado e salvo em: ${filePath}`);
                fs.unlinkSync(lastVideoPath); // Deleta o arquivo original
                lastVideoPath = null;
                if (previewWindow) previewWindow.close();
            }
        });
    }
});

app.whenReady().then(() => {
    tray = new Tray(path.join(__dirname, "icon.png"));
    tray.setToolTip("Screen Recorder");
    createCounterWindow();
    updateTrayMenu();
});

app.on('before-quit', () => {
    if (isRecording) stopRecording();
    if (counterWindow) counterWindow.destroy();
    if (previewWindow) previewWindow.destroy(); // Garante que a janela de preview seja fechada
});

ipcMain.on('close-preview-window', () => {
    if (previewWindow) {
        previewWindow.close();
    }
});
