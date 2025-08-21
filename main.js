const { app, Menu, Tray, screen, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { exec } = require("child_process");

// Variáveis globais
let tray = null;
let ffmpegProcess = null;
let isRecording = false;
let counterWindow = null;
let counterInterval = null;
let seconds = 0;
const COUNTER_WINDOW_HEIGHT = 30;
let indicatorWindow = null;

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

    const desktopPath = app.getPath("desktop");
    const outputPath = path.join(desktopPath, `gravacao-${Date.now()}.mp4`);
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
        if (code !== 0 && code !== 255) console.error("A gravação falhou.");
        else console.log(`Gravação salva em: ${outputPath}`);
        
        isRecording = false;
        ffmpegProcess = null;
        updateTrayMenu();
        clearInterval(counterInterval);
        counterWindow.hide();
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

app.whenReady().then(() => {
    tray = new Tray(path.join(__dirname, "icon.png"));
    tray.setToolTip("Screen Recorder");
    createCounterWindow();
    updateTrayMenu();
});

app.on('before-quit', () => {
    if (isRecording) stopRecording();
    if (counterWindow) counterWindow.destroy();
});
